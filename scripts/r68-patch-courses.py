#!/usr/bin/env python3
# r68 — patch src/app/api/courses/route.ts
# GET accepts ?specialtyId= for the OWNER (multi-specialty channel linking dialog).

import io, sys

PATH = "src/app/api/courses/route.ts"
src = io.open(PATH, encoding="utf-8").read()
applied = 0


def patch(anchor, replacement, count=1):
    global src, applied
    n = src.count(anchor)
    if n != count:
        print(f"FAIL: anchor {n}x. Head:\n{anchor[:80]!r}")
        sys.exit(1)
    src = src.replace(anchor, replacement)
    applied += 1


a1 = "export async function GET() {"
if src.count(a1) != 1:
    print("FAIL: GET signature not unique")
    sys.exit(1)

# find the year-scope line right after GET's opening
a2 = "    const yearId = user.scopeAcademicYearId ?? null;"
if src.count(a2) != 1:
    print("FAIL: yearId scope line not unique")
    sys.exit(1)

patch(
    "export async function GET() {\n  try {\n    const user = await getCurrentUser();\n    if (!user) return NextResponse.json({ courses: [] });",
    "export async function GET(req: NextRequest) {\n  try {\n    const user = await getCurrentUser();\n    if (!user) return NextResponse.json({ courses: [] });",
)

patch(
    "    const yearId = user.scopeAcademicYearId ?? null;",
    """    let yearId = user.scopeAcademicYearId ?? null;
    let specialtyId = user.assignedSpecialtyId;
    // r68: المالك يستعرض مقاييس تخصص آخر — ربط القنوات متعدد التخصصات
    if (user.role === "OWNER") {
      const url = new URL(req.url);
      const sp = url.searchParams.get("specialtyId");
      if (sp && Number(sp) > 0) {
        specialtyId = Number(sp);
        const yr = url.searchParams.get("yearId");
        yearId = yr && Number(yr) > 0 ? Number(yr) : null;
      }
    }""",
)

patch(
    '        .eq("specialty_id", user.assignedSpecialtyId);',
    '        .eq("specialty_id", specialtyId);',
)

patch(
    """      where: {
        specialtyId: user.assignedSpecialtyId,
        ...(yearId ? { academicYearId: yearId } : {}),
      },""",
    """      where: {
        specialtyId,
        ...(yearId ? { academicYearId: yearId } : {}),
      },""",
)

io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — {applied} patches applied to courses route")
