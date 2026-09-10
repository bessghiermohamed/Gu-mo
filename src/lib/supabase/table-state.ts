/**
 * r72: تمييز «الجدول غير منشأ» عن «الخطأ العابر» في أخطاء PostgREST.
 * r73: تمييز حالة ثالثة — «الجدول موجود لكن أذونات الكتابة ناقصة (RLS)».
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
 *
 * الدافع (حادثة 2026-09-11 — r73): نفّذ المالك الملف فعلاً والجدول
 * موجود، لكن ملف r65 منح anon صلاحية SELECT فقط بينما مسارات الخادم
 * تكتب بمفتاح anon — فكان الإدراج يُرفض بخطأ 42501 «new row violates
 * row-level security policy for table "telegram_topics"»، ورسالة
 * المسار (error.message.includes("telegram_topics")) عرضت خطأً
 * «الجدول غير منشأ» لأن نص خطأ RLS يحوي اسم الجدول — فظنّ المالك أن
 * تنفيذه لم يُسلَّم بينما المشكلة أذونات الكتابة فقط. الحالة الثالثة
 * تذكر بملف سياسات الكتابة ولا تتهم ملف إنشاء الجدول:
 *   • رفض RLS (42501/row-level security/permission denied) → نفّذ
 *     ملف السياسات supabase_topics_write_policies.sql.
 *
 * ملاحظة r73 على 42703: «عمود غير موجود» (42703) يعني أن الجدول
 * منشأ بمخطط قديم — يعالجها ملف التحديث المطابق، لكن تصنيفها يبقى
 * ضمن عائلة «نفّذ ملف SQL» لأن العلاج بنفس الطريقة.
 */

export interface TableState {
  /** true = الجدول غائب فعلاً؛ false = خطأ عابر أو أذونات */
  tableMissing: boolean;
  /** true = الجدول موجود لكن RLS يرفض الكتابة (سياسات ناقصة) */
  permissionDenied?: boolean;
  /** رسالة عربية جاهزة للعرض/التشخيص */
  message: string;
}

/** هل خطأ PostgREST يعني أن الجدول/العلاقة/العمود غير منشأ؟ */
export function isMissingTableError(errorMessage: string | null | undefined): boolean {
  return /PGRST205|PGRST204|42703|does not exist|Could not find|schema cache|جدول/i.test(
    String(errorMessage ?? "")
  );
}

/** r73: هل الخطأ رفض أذونات RLS (الجدول موجود والكتابة ممنوعة)؟ */
export function isPermissionDeniedError(errorMessage: string | null | undefined): boolean {
  return /42501|row-level security|permission denied|violates row-level/i.test(
    String(errorMessage ?? "")
  );
}

/**
 * r73b: هل الخطأ رفض المفتاح نفسه (قيمة غير صالحة / مشروع آخر)؟
 * تشخيص حي 2026-09-11: SUPABASE_SERVICE_ROLE_KEY مضبوط على Vercel بقيمة
 * غير صالحة — كل كتابة عبره ردّت «Invalid API key» حتمياً بينما قراءات
 * anon سليمة. يختلف عن رفض RLS (الأذونات) — علاجه تصحيح/حذف المتغير
 * أو السقوط التلقائي إلى anon في مسارات الكتابة.
 */
export function isInvalidKeyError(errorMessage: string | null | undefined): boolean {
  return /invalid api key|jwt|api key|401/i.test(String(errorMessage ?? ""));
}

/**
 * رسالة حالة موحّدة من خطأ استعلام Supabase.
 * @param errorMessage نص الخطأ كما عاده PostgREST
 * @param sqlFile      اسم ملف SQL المسؤول عن إنشاء الجدول (بدون مسار)
 * @param policiesFile r73: اسم ملف سياسات الكتابة (لحالة رفض RLS)
 */
export function tableStateFromError(
  errorMessage: string | null | undefined,
  sqlFile: string,
  policiesFile = "supabase_topics_write_policies.sql"
): TableState {
  if (isPermissionDeniedError(errorMessage)) {
    return {
      tableMissing: false,
      permissionDenied: true,
      message: `الجدول موجود لكن أذونات الكتابة ناقصة (RLS) — نفّذ ملف ${policiesFile} مرة واحدة في محرر SQL داخل Supabase ثم أعد المحاولة (لا تلزم إعادة تنفيذ ملف ${sqlFile})`,
    };
  }
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
