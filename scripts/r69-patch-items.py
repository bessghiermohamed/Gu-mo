#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 patch 1 — items route: cohort label in shared mode + admin cohort filter."""
import io, sys

PATH = "src/app/api/telegram/items/route.ts"


def apply(src: str, old: str, new: str, count: int = 1) -> str:
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:90]!r}"
    return src.replace(old, new)


src = io.open(PATH, encoding="utf-8").read()

# ---------------------------------------------------------------------------
# 1) resolveCohortLabel helper — right after resolveMyTrackId
# ---------------------------------------------------------------------------
anchor = """async function resolveMyTrackId(user: { id: number; scopeTrackId: number | null; scopeCohortGroupId: number | null }): Promise<number | null> {"""
assert src.count(anchor) == 1
helper = '''/**
 * r69: اسم الفوج المميِّز للعرض — «فوج 7 — السنة الثانية». الأفواج قد تحمل
 * الاسم نفسه في سنوات مختلفة؛ الاسم وحده لا يميّز (حدث فعلاً: فوجان
 * باسم «فوج 7» في سنتين مختلفتين). يُستعمل في بطاقة المساحة المشتركة
 * وفي تنقيح المشرف حتى يعرف الجميع أي فضاء يرون.
 */
async function resolveCohortLabel(cohortId: number | null): Promise<string | null> {
  if (cohortId == null) return null;
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("cohort_groups")
        .select("group_name, academic_years(year_name)")
        .eq("id", cohortId)
        .maybeSingle();
      if (!data) return null;
      const r = data as Record<string, unknown>;
      const year = r.academic_years as Record<string, unknown> | null;
      const yearName = year?.year_name != null ? String(year.year_name) : "";
      const base = String(r.group_name ?? "").trim();
      return yearName ? `${base} — ${yearName}` : base || null;
    }
    const c = await db.cohortGroup.findUnique({
      where: { id: cohortId },
      select: { groupName: true, subGroup: true, academicYear: { select: { yearName: true } } },
    });
    if (!c) return null;
    const base = [c.groupName.trim(), c.subGroup?.trim()].filter(Boolean).join(" ");
    return c.academicYear?.yearName ? `${base} — ${c.academicYear.yearName}` : base || null;
  } catch {
    return null;
  }
}

'''
src = apply(src, anchor, helper + anchor)

# ---------------------------------------------------------------------------
# 2) parse the cohortId filter param (admin mode)
# ---------------------------------------------------------------------------
old = """    // r65: خطوتا التصفية الجديدتان في المكتبة — السنة والفصل
    const yearIdParam = url.searchParams.get("yearId");
    const semesterParam = url.searchParams.get("semester");
"""
new = """    // r65: خطوتا التصفية الجديدتان في المكتبة — السنة والفصل
    const yearIdParam = url.searchParams.get("yearId");
    const semesterParam = url.searchParams.get("semester");
    // r69: فلتر المساحة (وضع المشرف) — فوج معين أو «بلا مساحة» (المكتبة)
    const cohortIdParam = url.searchParams.get("cohortId");
    const adminCohortFilter =
      mode === "admin" && cohortIdParam ? (cohortIdParam === "none" ? "none" : Number(cohortIdParam)) : null;
"""
assert src.count(old) == 1
src = src.replace(old, new)

# ---------------------------------------------------------------------------
# 3) apply the filter — Vercel admin branch
# ---------------------------------------------------------------------------
old = """      if (mode === "admin") {
        if (user.role !== "OWNER") query = query.eq("specialty_id", user.assignedSpecialtyId);
        if (sourceId) query = query.eq("source_id", Number(sourceId));
      } else if (mode === "shared") {"""
new = """      if (mode === "admin") {
        if (user.role !== "OWNER") query = query.eq("specialty_id", user.assignedSpecialtyId);
        if (sourceId) query = query.eq("source_id", Number(sourceId));
        // r69: تصفية إدارية حسب مساحة الفوج — معاينة ما يراه طلبة كل فوج
        if (adminCohortFilter === "none") query = query.is("cohort_id", null);
        else if (adminCohortFilter != null) query = query.eq("cohort_id", adminCohortFilter as number);
      } else if (mode === "shared") {"""
assert src.count(old) == 1
src = src.replace(old, new)

# ---------------------------------------------------------------------------
# 4) apply the filter — Prisma admin branch
# ---------------------------------------------------------------------------
old = """      if (mode === "admin") {
        if (user.role !== "OWNER") where.specialtyId = user.assignedSpecialtyId;
        if (sourceId) where.sourceId = Number(sourceId);
      } else if (mode === "shared") {"""
new = """      if (mode === "admin") {
        if (user.role !== "OWNER") where.specialtyId = user.assignedSpecialtyId;
        if (sourceId) where.sourceId = Number(sourceId);
        // r69: تصفية إدارية حسب مساحة الفوج (محلياً)
        if (adminCohortFilter === "none") where.cohortId = null;
        else if (adminCohortFilter != null) where.cohortId = adminCohortFilter as number;
      } else if (mode === "shared") {"""
assert src.count(old) == 1
src = src.replace(old, new)

# ---------------------------------------------------------------------------
# 5) shared mode: myCohortName in the response
# ---------------------------------------------------------------------------
old = """    return NextResponse.json({
      items: rows.map((r) =>
        shapeItem(
          r,
          r.moduleId != null ? moduleNames[r.moduleId] ?? null : null,
          r.sourceId != null ? sourceTitles[r.sourceId]?.titleAr ?? null : null,
          r.sourceId != null ? sourceTitles[r.sourceId]?.tgUsername ?? null : null
        )
      ),
      myCohortId,
      yearLock,
      trackLock,
      setup: { bot: await isBotConfigured(), activeSources },
    });"""
new = """    // r69: اسم الفوج المميِّز في وضع المساحة — يعرف الطالب (والمشرف الذي
    // يفحص بحسابه) أي فضاء يعرض، فلا يلتبس «فوج 7» بآخر بالاسم نفسه
    const myCohortName = mode === "shared" && myCohortId != null ? await resolveCohortLabel(myCohortId) : null;
    return NextResponse.json({
      items: rows.map((r) =>
        shapeItem(
          r,
          r.moduleId != null ? moduleNames[r.moduleId] ?? null : null,
          r.sourceId != null ? sourceTitles[r.sourceId]?.titleAr ?? null : null,
          r.sourceId != null ? sourceTitles[r.sourceId]?.tgUsername ?? null : null
        )
      ),
      myCohortId,
      myCohortName,
      yearLock,
      trackLock,
      setup: { bot: await isBotConfigured(), activeSources },
    });"""
assert src.count(old) == 1
src = src.replace(old, new)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 patch 1 (items route) OK")
