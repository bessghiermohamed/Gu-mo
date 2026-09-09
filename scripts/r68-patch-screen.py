#!/usr/bin/env python3
# r68 — patch src/components/talib/screens/telegram-screen.tsx
# 1) trackLock state (seeded from user's scope, then from the server response)
# 2) the lock chip mentions the student's track alongside the year

import io, sys

PATH = "src/components/talib/screens/telegram-screen.tsx"
src = io.open(PATH, encoding="utf-8").read()
orig_len = len(src)
applied = 0


def patch(anchor, replacement, count=1):
    global src, applied
    n = src.count(anchor)
    if n != count:
        print(f"FAIL: anchor {n}x. Head:\n{anchor[:90]!r}")
        sys.exit(1)
    src = src.replace(anchor, replacement)
    applied += 1


# 1) state — after the yearLock useState block
patch(
    """  const [yearLock, setYearLock] = React.useState<{ yearId: number; yearName: string } | null>(
    user != null && user.scopeAcademicYearId != null && (user.role === "STUDENT" || user.role === "REPRESENTATIVE")
      ? { yearId: user.scopeAcademicYearId, yearName: "" }
      : null
  );""",
    """  const [yearLock, setYearLock] = React.useState<{ yearId: number; yearName: string } | null>(
    user != null && user.scopeAcademicYearId != null && (user.role === "STUDENT" || user.role === "REPRESENTATIVE")
      ? { yearId: user.scopeAcademicYearId, yearName: "" }
      : null
  );
  // r68: عزل الممح — ممح الطالب يُشتق داخلياً كالسنة (نطاقه أو فوجه)،
  // والمصدر المربط بملمح معين يظهر لطلبة ذلك الممح فقط.
  const [trackLock, setTrackLock] = React.useState<{ trackId: number; trackName: string } | null>(
    user != null && user.scopeTrackId != null && (user.role === "STUDENT" || user.role === "REPRESENTATIVE")
      ? { trackId: user.scopeTrackId, trackName: "" }
      : null
  );""",
)

# 2) read trackLock from the response
patch(
    "      setYearLock(data.yearLock ?? null);",
    "      setYearLock(data.yearLock ?? null);\n      setTrackLock(data.trackLock ?? null);",
)

# 3) the lock chip — replace the whole {yearLocked && (...)} block (programmatic)
chip_start = "          {yearLocked && ("
if src.count(chip_start) != 1:
    print(f"FAIL: chip start anchor {src.count(chip_start)}x")
    sys.exit(1)
i = src.find(chip_start)
close_marker = "\n          )}"
j = src.find(close_marker, i)
if j < 0:
    print("FAIL: chip close not found")
    sys.exit(1)
j_end = j + len(close_marker)

new_chip = """          {(yearLocked || trackLock) && (
            <Card className="p-2.5 bg-primary/5 border-primary/20">
              <p className="text-xs text-foreground/80 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />
                <span>
                  تعرض مكتبة <strong>{yearLocked ? (myYearName ?? "سنتك الدراسية") : "تخصصك"}</strong>
                  {trackLock?.trackName ? (
                    <>
                      {" "}وممح <strong>{trackLock.trackName}</strong>
                    </>
                  ) : null}{" "}
                  فقط تلقائياً — محتوى سنتك{trackLock?.trackName ? " وملمحك" : ""} يظهر لك،
                  وما يُصنّف لسنة أخرى{trackLock?.trackName ? " أو ملمح آخر" : ""} لا يظهر لك.
                </span>
              </p>
            </Card>
          )}"""
src = src[:i] + new_chip + src[j_end:]
applied += 1

io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — {applied} patches applied. {orig_len} → {len(src)} chars")
