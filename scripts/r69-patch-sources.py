#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 patch 2 — sources route: disambiguated cohort names (year appended) +
invite-link guard with an actionable error."""
import io

PATH = "src/app/api/telegram/sources/route.ts"


def apply(src: str, old: str, new: str, count: int = 1) -> str:
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:90]!r}"
    return src.replace(old, new)


src = io.open(PATH, encoding="utf-8").read()

# ---------------------------------------------------------------------------
# 1) Vercel cohort names: join the year name
# ---------------------------------------------------------------------------
old = """        const cids = Array.from(new Set(sources.map((s) => s.cohortId).filter((x): x is number => x != null)));
        if (cids.length > 0) {
          const { data: cohorts } = await supabase.from("cohort_groups").select("id, group_name").in("id", cids);
          for (const c of cohorts ?? []) cohortNames[Number((c as Record<string, unknown>).id)] = String((c as Record<string, unknown>).group_name ?? "");
        }"""
new = """        const cids = Array.from(new Set(sources.map((s) => s.cohortId).filter((x): x is number => x != null)));
        if (cids.length > 0) {
          // r69: الاسم مع السنة — «فوج 7 — السنة الثانية»؛ الاسم وحده لا
          // يميّز بين فوجين بالاسم نفسه في سنتين مختلفتين
          const { data: cohorts } = await supabase
            .from("cohort_groups")
            .select("id, group_name, academic_years(year_name)")
            .in("id", cids);
          for (const c of cohorts ?? []) {
            const r = c as Record<string, unknown>;
            const year = r.academic_years as Record<string, unknown> | null;
            const yearName = year?.year_name != null ? String(year.year_name) : "";
            const base = String(r.group_name ?? "").trim();
            cohortNames[Number(r.id)] = yearName ? `${base} — ${yearName}` : base;
          }
        }"""
assert src.count(old) == 1
src = src.replace(old, new)

# ---------------------------------------------------------------------------
# 2) Prisma cohort names: join the year relation
# ---------------------------------------------------------------------------
old = """      const cids = Array.from(new Set(sources.map((s) => s.cohortId).filter((x): x is number => x != null)));
      for (const id of cids) {
        const c = await db.cohortGroup.findUnique({ where: { id }, select: { groupName: true } });
        if (c) cohortNames[id] = c.groupName;
      }"""
new = """      const cids = Array.from(new Set(sources.map((s) => s.cohortId).filter((x): x is number => x != null)));
      for (const id of cids) {
        // r69: الاسم مع السنة — محلياً عبر علاقة Prisma
        const c = await db.cohortGroup.findUnique({
          where: { id },
          select: { groupName: true, subGroup: true, academicYear: { select: { yearName: true } } },
        });
        if (c) {
          const base = [c.groupName.trim(), c.subGroup?.trim()].filter(Boolean).join(" ");
          cohortNames[id] = c.academicYear?.yearName ? `${base} — ${c.academicYear.yearName}` : base;
        }
      }"""
assert src.count(old) == 1
src = src.replace(old, new)

# ---------------------------------------------------------------------------
# 3) POST: actionable error for private invite links (t.me/+…, t.me/joinchat/…)
# ---------------------------------------------------------------------------
old = """    const body = await req.json();
    const handle = String(body.handle ?? "").trim();
    const sourceType = body.sourceType === "group" ? "group" : "channel";
    if (!handle) return NextResponse.json({ error: "أدخل رابط القناة أو @اسمها" }, { status: 400 });
"""
new = """    const body = await req.json();
    const handle = String(body.handle ?? "").trim();
    const sourceType = body.sourceType === "group" ? "group" : "channel";
    if (!handle) return NextResponse.json({ error: "أدخل رابط القناة أو @اسمها" }, { status: 400 });
    // r69: روابط الدعوة الخاصة (t.me/+… أو t.me/joinchat/…) لا تحمل معرفاً
    // رقمياً ولا اسم مستخدم — يستحيل على البوت قراءتها. رسالة واضحة بدل
    // خطأ تيليجرام الغامض «chat_id is empty».
    if (/^https?:\\/\\/t\\.me\\/(?:\\+|joinchat\\/)|^t\\.me\\/(?:\\+|joinchat\\/)/i.test(handle)) {
      return NextResponse.json(
        {
          error:
            "رابط الدعوة الخاص لا يكفي لتحديد المحادثة — أضف البوت مشرفاً فيها ثم الصق رابطاً منشوراً منها (يبدأ بـ t.me/c/… أو @اسم) أو معرفها الرقمي الذي يبدأ بـ -100",
        },
        { status: 400 }
      );
    }
"""
assert src.count(old) == 1
src = src.replace(old, new)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 patch 2 (sources route) OK")
