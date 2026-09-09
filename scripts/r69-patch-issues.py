#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 patch 3 — issues route: the production table predates round 56 and
lacks the reporter_id column, so EVERY report insert fails with 42703 →
«التقارير لا تعمل». Degrade gracefully (like the r68 track_id pattern):
insert/select without the column when it is missing."""
import io

PATH = "src/app/api/issues/route.ts"

src = io.open(PATH, encoding="utf-8").read()


def apply(old: str, new: str, count: int = 1) -> None:
    global src
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:90]!r}"
    src = src.replace(old, new)


# ---------------------------------------------------------------------------
# 0) shared helper — did the query fail because reporter_id is missing?
# ---------------------------------------------------------------------------
anchor = """const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
"""
apply(anchor, anchor + """
/** r69: عمود reporter_id غير منشأ في الإنتاج بعد (SQL الجولة 56 اختياري) —
 * نتائج PostgREST: 42703 «column ... does not exist». كل عملية عليه تتراجع
 * بلا العمود فيعمل التبليغ فوراً، ويظل إشعار الحل يعمل بمطابقة الاسم. */
function reporterIdMissing(e: unknown): boolean {
  const msg = String((e as { message?: string } | { error?: { message?: string } })?.message ?? (e as { error?: { message?: string } })?.error?.message ?? "");
  return /reporter_id/i.test(msg) || /42703/.test(msg);
}
""")

# ---------------------------------------------------------------------------
# 1) POST — insert WITH reporter_id, retry without on 42703
# ---------------------------------------------------------------------------
old = """    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("student_issue_reports").insert({
        student_name: user.fullName,
        student_group: user.scopeCohortGroupId ? String(user.scopeCohortGroupId) : "بلا فوج",
        item_type: itemType.trim(), item_title: itemTitle.trim(),
        description: description?.trim() ?? "", date: now, status: "قيد المراجعة",
        // round 56 — remember WHO filed it so the resolution notification
        // can reach the reporter (column added by
        // download/supabase_report_reporter.sql; legacy rows are null).
        reporter_id: user.id,
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });"""
new = """    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // r69: نحاول أولاً بعمود المُبلِّغ (r56)، وإن غاب العمود في هذا الإنتاج
      // نعيد المحاولة بدونه — فلا يتعطل التبليغ أبداً غياب عمود اختياري.
      const baseRow = {
        student_name: user.fullName,
        student_group: user.scopeCohortGroupId ? String(user.scopeCohortGroupId) : "بلا فوج",
        item_type: itemType.trim(), item_title: itemTitle.trim(),
        description: description?.trim() ?? "", date: now, status: "قيد المراجعة",
      };
      let { data, error } = await supabase
        .from("student_issue_reports")
        .insert({ ...baseRow, reporter_id: user.id })
        .select()
        .single();
      if (error && reporterIdMissing(error)) {
        ({ data, error } = await supabase.from("student_issue_reports").insert(baseRow).select().single());
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });"""
apply(old, new)

# ---------------------------------------------------------------------------
# 2) PATCH — select reporter_id, retry without on 42703
# ---------------------------------------------------------------------------
old = """      const { data: report } = await supabase
        .from("student_issue_reports")
        .select("id, status, student_name, item_title, reporter_id")
        .eq("id", Number(id)).maybeSingle();
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });"""
new = """      // r69: عمود المُبلِّغ اختياري — إن غاب نقرأ بدونه (الإشعار يسقط إلى
      // مطابقة full_name كما كان قبل الجولة 56).
      let { data: report, error: fetchErr } = await supabase
        .from("student_issue_reports")
        .select("id, status, student_name, item_title, reporter_id")
        .eq("id", Number(id)).maybeSingle();
      if (fetchErr && reporterIdMissing(fetchErr)) {
        const fallback = await supabase
          .from("student_issue_reports")
          .select("id, status, student_name, item_title")
          .eq("id", Number(id)).maybeSingle();
        report = fallback.data;
      }
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });"""
apply(old, new)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 patch 3 (issues route) OK")
