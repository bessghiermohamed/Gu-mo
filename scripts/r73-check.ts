/**
 * r73 sanity check — الحالة الثالثة: رفض أذونات RLS (الجدول موجود والكتابة ممنوعة)
 * + تغطية r72 السابقة (الجدول غير منشأ / الخطأ العابر) كتراجع.
 * Run: bun run scripts/r73-check.ts
 */
import { isMissingTableError, isPermissionDeniedError, tableStateFromError } from "../src/lib/supabase/table-state";

let pass = 0, fail = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} (got ${actual}, want ${expected})`); }
}

const RLS_MSG = 'new row violates row-level security policy for table "telegram_topics"';

console.log("isPermissionDeniedError (r73):");
check("42501 row-level security → true", isPermissionDeniedError(RLS_MSG), true);
check("42501 code only → true", isPermissionDeniedError("42501: permission denied"), true);
check("permission denied → true", isPermissionDeniedError("permission denied for table telegram_topics"), true);
check("PGRST205 → false", isPermissionDeniedError("Could not find the table 'public.telegram_topics' in the schema cache"), false);
check("network timeout → false", isPermissionDeniedError("fetch failed: Connect Timeout"), false);
check("empty → false", isPermissionDeniedError(""), false);

console.log("isMissingTableError regression (r72):");
check("PGRST205 → true", isMissingTableError("Could not find the table 'public.telegram_topics' in the schema cache"), true);
check("42703 → true", isMissingTableError("ERROR: 42703: column x does not exist"), true);
check("RLS message → false (الجدول موجود — ليس غياب جدول)", isMissingTableError(RLS_MSG), false);

console.log("tableStateFromError (r73 three-state):");
const denied = tableStateFromError(RLS_MSG, "supabase_telegram_topics.sql");
check("rls → tableMissing=false", denied.tableMissing, false);
check("rls → permissionDenied=true", denied.permissionDenied === true, true);
check("rls → يذكر ملف السياسات", denied.message.includes("supabase_topics_write_policies.sql"), true);
check("rls → يطمئن أن ملف الإنشاء منفّذ", denied.message.includes("لا تلزم إعادة تنفيذ ملف supabase_telegram_topics.sql"), true);
const missing = tableStateFromError("Could not find the table 'public.telegram_topics' in the schema cache", "supabase_telegram_topics.sql");
check("missing → tableMissing=true", missing.tableMissing, true);
check("missing → يذكر اسم الملف", missing.message.includes("supabase_telegram_topics.sql"), true);
const transient = tableStateFromError("fetch failed: Connect Timeout", "supabase_telegram_topics.sql");
check("transient → tableMissing=false", transient.tableMissing, false);
check("transient → يتحدث عن خطأ عابر", transient.message.includes("عابر"), true);
check("transient → لا يأمر بتنفيذ الملف", transient.message.includes("نفّذ ملف"), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
