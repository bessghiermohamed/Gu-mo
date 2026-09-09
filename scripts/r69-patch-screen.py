#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 patch 4 — telegram screen: show WHICH cohort's space the user is
viewing («مساحة فوج 7 — السنة الثانية المشتركة») — the owner's exact blind
spot: two cohorts named «فوج 7» in different years."""
import io

PATH = "src/components/talib/screens/telegram-screen.tsx"

src = io.open(PATH, encoding="utf-8").read()


def apply(old: str, new: str, count: int = 1) -> None:
    global src
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:90]!r}"
    src = src.replace(old, new)


# 1) state
apply(
    "  const [myCohortId, setMyCohortId] = React.useState<number | null>(null);",
    """  const [myCohortId, setMyCohortId] = React.useState<number | null>(null);
  // r69: اسم الفوج المميِّز — يعرف المتصل أي فضاء يعرض (الأفواج تتشارك الأسماء)
  const [myCohortName, setMyCohortName] = React.useState<string | null>(null);""",
)

# 2) capture from the response
apply(
    "      setMyCohortId(data.myCohortId ?? null);",
    """      setMyCohortId(data.myCohortId ?? null);
      setMyCohortName(data.myCohortName ?? null);""",
)

# 3) pass to SharedList
apply(
    """            myCohortId={myCohortId}""",
    """            myCohortId={myCohortId}
            myCohortName={myCohortName}""",
)

# 4) SharedList signature + info card
apply(
    """function SharedList({ items, loading, myCohortId, courses, currentUserName, onRefresh }: {
  items: TgItem[];
  loading: boolean;
  myCohortId: number | null;""",
    """function SharedList({ items, loading, myCohortId, myCohortName, courses, currentUserName, onRefresh }: {
  items: TgItem[];
  loading: boolean;
  myCohortId: number | null;
  myCohortName: string | null;""",
)

apply(
    """          <p className="text-xs text-foreground/80 leading-relaxed">
            مساحة مشتركة لكل منتميي الفوج: ما يُنشر في مجموعة الفوج أو قناته المربوطة يظهر هنا تلقائياً،
            ويمكن لأي طالب إضافة روابط وملفات يدوياً. المحتوى الخاص بالفوج فقط — لا يراه الطلبة الآخرون.
          </p>""",
    """          <p className="text-xs text-foreground/80 leading-relaxed">
            مساحة {myCohortName ? <>«<strong>{myCohortName}</strong>» </> : "الفوج "}المشتركة: ما يُنشر في مجموعة الفوج أو قناته المربوطة يظهر هنا تلقائياً،
            ويمكن لأي طالب إضافة روابط وملفات يدوياً. المحتوى الخاص بهذا الفوج فقط — لا يراه طلبة الأفواج الأخرى.
          </p>""",
)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 patch 4 (telegram screen) OK")
