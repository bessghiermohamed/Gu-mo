/**
 * r72: تمييز «الجدول غير منشأ» عن «الخطأ العابر» في أخطاء PostgREST.
 *
 * الدافع (حادثة 2026-09-10): نفّذ المالك supabase_telegram_topics.sql
 * فعلاً، لكن أول استعلام بعده مباشرةً صادف نافذة إعادة تحميل مخطط
 * PostgREST (أو خطأ شبكة عابر) — فعرض التطبيق «نفّذ الملف» رغم أنه
 * منفّذ، فظنّ المالك أن تنفيذه لم يُسلَّم وأعاد المحاولة مراراً.
 * الرسالة الصادقة تميّز الحالتين:
 *   • جدول غائب فعلاً (PGRST205/PGRST204/42703/does not exist/schema
 *     cache) → أمر بتنفيذ ملف SQL المناسب (إعادة تنفيذه آمنة —
 *     كل ملفاتنا idempotent).
 *   • أي خطأ آخر → «خطأ عابر، أعد المحاولة» بلا اتهام SQL منفّذ.
 */

export interface TableState {
  /** true = الجدول غائب فعلاً؛ false = خطأ عابر في الاتصال */
  tableMissing: boolean;
  /** رسالة عربية جاهزة للعرض/التشخيص */
  message: string;
}

/** هل خطأ PostgREST يعني أن الجدول/العلاقة/العمود غير منشأ؟ */
export function isMissingTableError(errorMessage: string | null | undefined): boolean {
  return /PGRST205|PGRST204|42703|does not exist|Could not find|schema cache|جدول/i.test(
    String(errorMessage ?? "")
  );
}

/**
 * رسالة حالة موحّدة من خطأ استعلام Supabase.
 * @param errorMessage نص الخطأ كما عاده PostgREST
 * @param sqlFile      اسم ملف SQL المسؤول عن إنشاء الجدول (بدون مسار)
 */
export function tableStateFromError(
  errorMessage: string | null | undefined,
  sqlFile: string
): TableState {
  if (isMissingTableError(errorMessage)) {
    return {
      tableMissing: true,
      message: `جدول غير منشأ — نفّذ ملف ${sqlFile} مرة واحدة في محرر SQL داخل Supabase ثم أعد المحاولة (إعادة تنفيذه آمنة)`,
    };
  }
  return {
    tableMissing: false,
    message: `تعذّر الاتصال بقاعدة البيانات (خطأ عابر: ${String(errorMessage ?? "غير معروف")}). أعد المحاولة بعد لحظات — إن كنت نفّذت ملف ${sqlFile} سابقاً فهو منفّذ ولا يلزم إعادة تنفيذه.`,
  };
}
