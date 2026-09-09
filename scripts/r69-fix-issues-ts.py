#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 fixup — issues route TS errors: simpler error sniffer + loosely-typed
report row so the fallback assignment typechecks."""
import io

PATH = "src/app/api/issues/route.ts"

src = io.open(PATH, encoding="utf-8").read()


def apply(old: str, new: str, count: int = 1) -> None:
    global src
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:90]!r}"
    src = src.replace(old, new)


apply(
    """/** r69: عمود reporter_id غير منشأ في الإنتاج بعد (SQL الجولة 56 اختياري) —
 * نتائج PostgREST: 42703 «column ... does not exist». كل عملية عليه تتراجع
 * بلا العمود فيعمل التبليغ فوراً، ويظل إشعار الحل يعمل بمطابقة الاسم. */
function reporterIdMissing(e: unknown): boolean {
  const msg = String((e as { message?: string } | { error?: { message?: string } })?.message ?? (e as { error?: { message?: string } })?.error?.message ?? "");
  return /reporter_id/i.test(msg) || /42703/.test(msg);
}""",
    """/** r69: عمود reporter_id غير منشأ في الإنتاج بعد (SQL الجولة 56 اختياري) —
 * نتائج PostgREST: 42703 «column ... does not exist». كل عملية عليه تتراجع
 * بلا العمود فيعمل التبليغ فوراً، ويظل إشعار الحل يعمل بمطابقة الاسم. */
function reporterIdMissing(e: unknown): boolean {
  if (e == null) return false;
  const err = e as { message?: unknown; code?: unknown; error?: { message?: unknown; code?: unknown } };
  const msg = [err.message, err.code, err.error?.message, err.error?.code]
    .map((x) => (x == null ? "" : String(x)))
    .join(" ");
  return /reporter_id/i.test(msg) || /42703/.test(msg);
}""",
)

apply(
    """      // r69: عمود المُبلِّغ اختياري — إن غاب نقرأ بدونه (الإشعار يسقط إلى
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
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });""",
    """      // r69: عمود المُبلِّغ اختياري — إن غاب نقرأ بدونه (الإشعار يسقط إلى
      // مطابقة full_name كما كان قبل الجولة 56).
      let report: Record<string, unknown> | null = null;
      const primary = await supabase
        .from("student_issue_reports")
        .select("id, status, student_name, item_title, reporter_id")
        .eq("id", Number(id)).maybeSingle();
      if (primary.error && reporterIdMissing(primary.error)) {
        const fallback = await supabase
          .from("student_issue_reports")
          .select("id, status, student_name, item_title")
          .eq("id", Number(id)).maybeSingle();
        report = (fallback.data ?? null) as Record<string, unknown> | null;
      } else {
        report = (primary.data ?? null) as Record<string, unknown> | null;
      }
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });""",
)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 fixup (issues TS) OK")
