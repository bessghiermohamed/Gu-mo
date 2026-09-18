#!/usr/bin/env python3
"""r93 helper — remove the round-7 «دروس تيليجرام» gateway card from the
courses list screen (owner: Telegram lessons must not appear in Courses)."""
import io

P = "src/components/talib/screens/courses-screen.tsx"
with io.open(P, "r", encoding="utf-8") as f:
    lines = f.readlines()

start = next(i for i, l in enumerate(lines) if "round 7" in l and "بوابة دروس تيليجرام" in l)
# the card ends at the first standalone "</Card>" after start
end = next(i for i in range(start, len(lines)) if lines[i].strip() == "</Card>")
# also swallow the blank line that followed the card, if any
if end + 1 < len(lines) and lines[end + 1].strip() == "":
    end += 1

del lines[start:end + 1]
text = "".join(lines)

# Send import is now unused (it only served the gateway card)
text = text.replace(
    'import { BookOpen, Plus, Flag, Loader2, ChevronDown, Send, AlertTriangle, RefreshCw, Pencil, Trash2 } from "lucide-react";',
    'import { BookOpen, Plus, Flag, Loader2, ChevronDown, AlertTriangle, RefreshCw, Pencil, Trash2 } from "lucide-react";'
)
# document the removal in the file header comment
text = text.replace(
    'interface Course extends CourseSummary {',
    '''// round 93 (طلب المالك: «في قسم الدروس لا تظهر دروس تيليجرام»): the
// round-7 Telegram-lessons gateway card is REMOVED — the Courses section
// lists مقاييس only. The Telegram screen stays as its own section.

interface Course extends CourseSummary {''',
)

with io.open(P, "w", encoding="utf-8") as f:
    f.write(text)

for token in ["دروس تيليجرام", "Send", "TELEGRAM"]:
    assert token not in text, token
print("gateway card removed; no telegram references remain in courses-screen")
