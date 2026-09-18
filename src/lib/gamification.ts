/**
 * gamification — نقاط النشاط ورُتَب الفوج (round 92, owner request).
 *
 * «في قسم الفوج يظهر اسم بجانبه شعار مثل الألعاب يتغير حسب عدد النقاط،
 * والنقاط تُحسب من نشاط الشخص داخل التطبيق» — بلا أي شرح يُعرض للطالب.
 *
 * كيف تعمل النقاط (داخلياً — لا يُعرض هذا للطالب):
 *   • كل يوم يح فيه الطالب التطبيق        → 5 نقاط (دفتر حضور محلي)
 *   • كل واجب مُنجز (شاشة/فوج الواجبات)   → 20 نقطة
 *   • كل ملاحظة شخصية في ملفاتي          → 10 نقاط
 *   • كل مصدر أضافه إلى دفتر طالب        → 10 نقاط
 *
 * الخصوصية: كل شيء يُقرأ ويُكتب في localStorage على جهاز الطالب فقط —
 * لا طلب شبكة، لا إرسال لأي خادم، توافقاً مع عقد «أدوات تعمل داخل جهازك».
 *
 * الصيانة: هذه الوحدة نقية بلا أي اعتماد على React أو lucide — الشعار
 * يُمثَّل باسم رمزي (RankIconName) وتحوّله الشارة في rank-badge.tsx،
 * لتبقى قابلة للاختبار المباشر من سكربتات الفحص (bun) دون DOM.
 */

/** أسماء الشعارات المسموحة للرُتَب — تُحوَّل إلى أيقونات lucide في الشارة */
export type RankIconName =
  | "sprout"
  | "book"
  | "zap"
  | "medal"
  | "star"
  | "trophy"
  | "crown";

export interface Rank {
  /** اسم الرُتبة الظاهر على الشارة */
  name: string;
  /** أدنى نقاط تُفتح عندها هذه الرُتبة */
  min: number;
  icon: RankIconName;
  /** ألوان الشارة (خلفية شفافة + نص) متوافقة مع الوضعين الفاتح والداكن */
  chip: string;
}

/** سبع رُتب متدرجة كالألعاب — الاسم والشعار يتغيران مع النقاط تلقائياً */
export const RANKS: Rank[] = [
  { name: "مبتدئ", min: 0, icon: "sprout", chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  { name: "ناشئ", min: 100, icon: "book", chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  { name: "نشيط", min: 250, icon: "zap", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  { name: "مجتهد", min: 500, icon: "medal", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-300" },
  { name: "مميّز", min: 800, icon: "star", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
  { name: "خبير", min: 1200, icon: "trophy", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  { name: "أسطورة", min: 2000, icon: "crown", chip: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-300" },
];

/** الرُتبة المناسبة لعدد النقاط (الرُتب مرتّبة تصاعدياً في RANKS) */
export function rankFor(points: number): Rank {
  const safe = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (safe >= rank.min) current = rank;
  }
  return current;
}

// ---------------------------------------------------------------------------
// دفتر الحضور المحلي — مفتاح واحد، كتابة واحدة يومياً من غلاف التطبيق
// ---------------------------------------------------------------------------

export const ACTIVITY_KEY = "talib-activity-v1";

/** نافذة القص — الدفتر لا ينمو بلا حدود (٦ أشهر كافية لأي حساب) */
const MAX_DAYS = 180;

/** لقطة نشاط الطالب على هذا الجهاز */
export interface ActivitySnapshot {
  points: number;
  days: number;
  assignments: number;
  notes: number;
  sources: number;
}

function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** تعليم يوم اليوم كيوم نشاط (كتابة idempotent — تُستدعى مرة من غلاف
 *  التطبيق عند الإقلاع). الصمت الكامل عند فشل التخزين (الوضع الخاص). */
export function recordDailyVisit(): void {
  try {
    const days: Record<string, boolean> = {};
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (v && /^\d{4}-\d{2}-\d{2}$/.test(k)) days[k] = true;
        }
      }
    }
    days[localDayKey()] = true;
    const cutoff = Date.now() - MAX_DAYS * 86400000;
    const kept: Record<string, boolean> = {};
    for (const k of Object.keys(days)) {
      const t = new Date(`${k}T00:00:00`).getTime();
      if (Number.isFinite(t) && t >= cutoff) kept[k] = true;
    }
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(kept));
  } catch {
    // وضع خاص / تخزين تالف — يبقى النشاط غير مرئي ولا يعطّل أي شيء
  }
}

function countActiveDays(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return 0;
    return Object.values(parsed).filter((v) => !!v).length;
  } catch {
    return 0;
  }
}

/** الواجبات المُنجزة — نفس مفتاح شاشة الواجبات وفوجها (قيم true فقط) */
function countCompletedAssignments(): number {
  try {
    const raw = localStorage.getItem("talib-assignments-completed");
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, unknown>;
    if (!map || typeof map !== "object") return 0;
    return Object.values(map).filter((v) => v === true).length;
  } catch {
    return 0;
  }
}

/** الملاحظات الشخصية في ملفاتي (talib-notes مصفوفة) */
function countLocalNotes(): number {
  try {
    const raw = localStorage.getItem("talib-notes");
    if (!raw) return 0;
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

/** مصادر دفتر طالب — تُجمع من كل مفاتيح talib-notebook-v1-* على الجهاز
 *  (بنية الحالة { sources, chat } كما في notebook-tool) */
function countNotebookSources(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("talib-notebook-v1-")) continue;
      try {
        const state = JSON.parse(localStorage.getItem(key) || "{}") as {
          sources?: unknown;
        };
        if (Array.isArray(state.sources)) total += state.sources.length;
      } catch {
        // مفتاح تالف — تجاوزه ولا تعطّل الحساب
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** حساب النقاط الكامل من حالة الجهاز الحالية (قراءة فقط، بلا أي كتابة) */
export function computeActivity(): ActivitySnapshot {
  const days = countActiveDays();
  const assignments = countCompletedAssignments();
  const notes = countLocalNotes();
  const sources = countNotebookSources();
  const points = days * 5 + assignments * 20 + notes * 10 + sources * 10;
  return { points, days, assignments, notes, sources };
}
