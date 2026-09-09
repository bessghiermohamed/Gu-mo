#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 hardening — items route: invalid cohortId values fall back to no filter
(NaN would otherwise poison the Prisma/PostgREST query)."""
import io

PATH = "src/app/api/telegram/items/route.ts"

src = io.open(PATH, encoding="utf-8").read()

old = """    // r69: فلتر المساحة (وضع المشرف) — فوج معين أو «بلا مساحة» (المكتبة)
    const cohortIdParam = url.searchParams.get("cohortId");
    const adminCohortFilter =
      mode === "admin" && cohortIdParam ? (cohortIdParam === "none" ? "none" : Number(cohortIdParam)) : null;
"""
new = """    // r69: فلتر المساحة (وضع المشرف) — فوج معين أو «بلا مساحة» (المكتبة)
    const cohortIdParam = url.searchParams.get("cohortId");
    const adminCohortFilter =
      mode === "admin" && cohortIdParam
        ? cohortIdParam === "none"
          ? "none"
          : Number.isFinite(Number(cohortIdParam)) && Number(cohortIdParam) > 0
            ? Number(cohortIdParam)
            : null
        : null;
"""
assert src.count(old) == 1, f"anchor x{src.count(old)}"
src = src.replace(old, new)
io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 hardening OK")
