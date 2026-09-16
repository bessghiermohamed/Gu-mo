/**
 * r83 sanity check — استوديو الصور: طبقة المزوّدين + حراس المسار + الحدود الأمنية.
 * Run: bun run scripts/r83-check.ts
 *
 * لا يحتاج أي مفتاح حقيقي: كل الفحوص إما منطق نقي أو مسار الخطأ الصادق
 * (مفتاح Gemini مزيف ← 400 «API key not valid» ← تصنيف auth ← رسالة المالك).
 * فحص المسار يستخدم جلسة مؤقتة عبر مفتاح الخدمة (نمط r73) وتُحذف فورًا.
 */
import { isImageConfigured, isImageAspect, generateImage } from "../src/lib/ai/image";
import { ProviderError } from "../src/lib/ai/providers";
import { readFileSync } from "fs";

let pass = 0, fail = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} (got ${actual}, want ${expected})`); }
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ntdzvujhujnbazaqzuvo.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE = "http://localhost:3000";

// ---------------------------------------------------------------------------
console.log("isImageAspect (تحقق الأبعاد):");
check("1:1 → true", isImageAspect("1:1"), true);
check("16:9 → true", isImageAspect("16:9"), true);
check("9:16 → false (غير مدعوم)", isImageAspect("9:16"), false);
check("null → false", isImageAspect(null), false);
check(" bất|string عشوائي → false", isImageAspect("square"), false);

// ---------------------------------------------------------------------------
console.log("isImageConfigured (اكتشاف المفاتيح):");
const savedEnv = { ...process.env } as Record<string, string | undefined>;
delete process.env.GROQ_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.XAI_API_KEY;
delete process.env.GEMINI_IMAGE_MODEL; delete process.env.XAI_IMAGE_MODEL;
check("بلا مفاتيح → false", isImageConfigured(), false);
process.env.GEMINI_API_KEY = "AIza-fake";
check("مفتاح Gemini → true", isImageConfigured(), true);
delete process.env.GEMINI_API_KEY;
process.env.GROQ_API_KEY = "gsk-fake";
check("مفتاح Groq وحده → false (لا صور من Groq)", isImageConfigured(), false);
process.env.GROQ_API_KEY = "xai-fake"; // مزوّد Grok في خانة Groq — نمط r44
check("مفتاح xai- في خانة Groq → true (اكتشاف تلقائي)", isImageConfigured(), true);
delete process.env.GROQ_API_KEY;
process.env.XAI_API_KEY = "xai-fake2";
check("مفتاح XAI صريح → true", isImageConfigured(), true);
delete process.env.XAI_API_KEY;

// ---------------------------------------------------------------------------
console.log("generateImage بمفتاح Gemini مزيف (مسار الخطأ الحقيقي):");
process.env.GEMINI_API_KEY = "AIza-totally-fake-key-r83";
try {
  await generateImage("رسم توضيحي لخلية نباتية", "1:1");
  check("يجب أن يرمي خطأ", true, false);
} catch (e) {
  const pe = e instanceof ProviderError ? e : null;
  check("ProviderError", pe !== null, true);
  check("kind = auth (مفتاح غير صالح — لا إعادة محاولة عبثية)", pe?.kind === "auth", true);
  check("provider = gemini", pe?.provider === "gemini", true);
}
delete process.env.GEMINI_API_KEY;

// ---------------------------------------------------------------------------
// مسار HTTP — ضد خادم التطوير المحلي
// ---------------------------------------------------------------------------
console.log("مسار /api/ai/image (ضد localhost:3000):");
const noAuth = await fetch(`${BASE}/api/ai/image`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "رسم توضيحي" }),
});
check("بلا جلسة → 401", noAuth.status === 401, true);

// جلسة مؤقتة (نمط r73) — تُحذف في النهاية مهما حدث
const randomToken = Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join("") + "r83";
let ownerId: number | null = null;
if (SERVICE) {
  const usersRes = await fetch(`${SUPA_URL}/rest/v1/app_users?role=eq.OWNER&select=id&limit=1`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const users = (await usersRes.json()) as Array<{ id: number }>;
  ownerId = users?.[0]?.id ?? null;
}
if (ownerId) {
  const ins = await fetch(`${SUPA_URL}/rest/v1/device_sessions`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: ownerId, device_token: randomToken, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
  });
  check("إنشاء جلسة مؤقتة (خدمة)", ins.ok, true);

  const cookie = { "Content-Type": "application/json", Cookie: `talib_session=${randomToken}` };
  const bad1 = await fetch(`${BASE}/api/ai/image`, { method: "POST", headers: cookie, body: JSON.stringify({ prompt: "" }) });
  check("وصف فارغ → 400", bad1.status === 400, true);
  const bad1Body = await bad1.json();
  check("رسالة عربية صادقة", typeof bad1Body.error === "string" && /وصف/.test(bad1Body.error), true);

  const bad2 = await fetch(`${BASE}/api/ai/image`, { method: "POST", headers: cookie, body: JSON.stringify({ prompt: "صمم لي كلمة مرور قوية password generator" }) });
  check("حد كلمات المرور → 400 (حدود المالك)", bad2.status === 400, true);
  const bad2Body = await bad2.json();
  check("رسالة الحدود الأمنية", /حساسة|كلمات مرور/.test(bad2Body.error ?? ""), true);

  const ok = await fetch(`${BASE}/api/ai/image`, { method: "POST", headers: cookie, body: JSON.stringify({ prompt: "رسم توضيحي لخلية نباتية", aspect: "4:3" }) });
  const okBody = await ok.json();
  check("محلي بلا مفاتيح → 200 needsConfig (اتفاقية المساعد)", ok.status === 200 && okBody.needsConfig === true, true);

  const del = await fetch(`${SUPA_URL}/rest/v1/device_sessions?device_token=eq.${randomToken}`, {
    method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  check("حذف الجلسة المؤقتة", del.ok || del.status === 204, true);
  // تحقق أن الحذف فعّال: الجلسة لم تعد صالحة
  const after = await fetch(`${BASE}/api/ai/image`, { method: "POST", headers: cookie, body: JSON.stringify({ prompt: "اختبار" }) });
  check("الجلسة المحذوفة لا تعمل → 401", after.status === 401, true);
} else {
  console.log("  (تخطي فحوص الجلسة — لا مفتاح خدمة في البيئة)");
}

// ---------------------------------------------------------------------------
console.log("ترابط الواجهة (tools-tab):");
const tab = readFileSync("src/components/talib/tools/tools-tab.tsx", "utf8");
check("بطاقة الاستوديو المميزة موجودة", tab.includes("استوديو الصور"), true);
check("حالة studio موصولة", tab.includes('activeTool === "studio"'), true);
check("الاستيراد موجود", tab.includes('from "./image-studio-tool"'), true);
check("لا رسالة «لا توجد أداة» كاذبة — matchesStudio في الشرط", tab.includes("!matchesStudio"), true);

const studio = readFileSync("src/components/talib/tools/image-studio-tool.tsx", "utf8");
check("حدود الأبعاد مطابقة للمسار (1:1/4:3/3:4/16:9)", studio.includes('"1:1" | "4:3" | "3:4" | "16:9"'), true);
check("عداد الأحرف 600 مطابق للمسار", studio.includes("MAX_PROMPT_CHARS = 600"), true);

console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail === 0 ? 0 : 1);
