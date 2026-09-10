/**
 * r72 sanity check — تمييز «الجدول غير منشأ» عن «الخطأ العابر».
 * Run: bun run scripts/r72-check.ts
 */
import { isMissingTableError, tableStateFromError } from "../src/lib/supabase/table-state";

let pass = 0, fail = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} (got ${actual}, want ${expected})`); }
}

console.log("isMissingTableError:");
// حقيقي: الجدول/العمود غير منشأ
check("PGRST205 schema cache → true", isMissingTableError("Could not find the table 'public.telegram_topics' in the schema cache"), true);
check("PGRST204 column → true", isMissingTableError('Could not find the column "class_confidence" in the schema cache'), true);
check("relation does not exist → true", isMissingTableError('relation "public.bot_config" does not exist'), true);
check("42703 undefined column → true", isMissingTableError("ERROR: 42703: column telegram_items.class_confidence does not exist"), true);
check("جدول عربية → true", isMissingTableError("جدول المواضيع غير منشأ"), true);
// عابر: ليس غياب جدول
check("JWT invalid → false", isMissingTableError("Invalid API key: JWT could not be decoded"), false);
check("network timeout → false", isMissingTableError("fetch failed: Connect Timeout"), false);
check("401 → false", isMissingTableError("Unauthorized: 401"), false);
check("empty → false", isMissingTableError(""), false);
check("undefined → false", isMissingTableError(undefined), false);

console.log("tableStateFromError (topics):");
const missing = tableStateFromError("Could not find the table 'public.telegram_topics' in the schema cache", "supabase_telegram_topics.sql");
check("missing → tableMissing=true", missing.tableMissing, true);
check("missing → يذكر اسم الملف", missing.message.includes("supabase_telegram_topics.sql"), true);
const transient = tableStateFromError("fetch failed: Connect Timeout", "supabase_telegram_topics.sql");
check("transient → tableMissing=false", transient.tableMissing, false);
check("transient → يتحدث عن خطأ عابر", transient.message.includes("عابر"), true);
check("transient → لا يأمر بتنفيذ الملف", transient.message.includes("نفّذ ملف"), false);
check("transient → يطمئن أن ملفه المنفّذ سليم", transient.message.includes("لا يلزم إعادة تنفيذه"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
