/**
 * r64 e2e (local, production build) — the user's exact bug:
 * «صنّف البوت عناوين مقاييس (برمجة وغيرها) لكن التصفية لا تجدها».
 *
 * Root cause: items ingested from module-less sources (ENS forum spans many
 * modules/years) kept module_id NULL — every المقياس filter excludes NULL.
 * r64 adds per-post module matching at ingest + a batch heal action.
 *
 * Covers (heuristic classifier — no Gemini key locally):
 *  A) NEW post with a course title → module linked at ingest → found by filter
 *  B) filter isolation (no cross-leak), unfiltered visibility, moduleName chip
 *  C) welcome/chatter post → classified but stays module-less (correct)
 *  D) batch heal (reclassify-source) links OLD null-module posts
 *  E) batch limit + re-run, guards (no cookie / student), empty-source message
 *  F) ENS-style forum topic message → ingested + linked
 *  G) simulate ingest shows the matched module name (admin dialog field)
 *
 * Run: bun run build && PORT=3117 npx next start & bun run scripts/r64-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://localhost:3117";
const ENV_SECRET = "local-r62-test-secret";
const CHAN_CHAT = -1009990001; // قناة الاختبار (module-less channel source)
const FORUM_CHAT = -1009990002; // منتدى الاختبار (ENS-like group source)

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

let updateSeq = 500_000;
function tgUpdate(msg: Record<string, unknown>): string {
  updateSeq += 1;
  return JSON.stringify({ update_id: updateSeq, ...msg });
}
function channelPost(chatId: number, messageId: number, text: string): string {
  return tgUpdate({
    channel_post: {
      message_id: messageId, chat: { id: chatId, type: "channel", title: "قناة الاختبار" },
      date: Math.floor(Date.now() / 1000), from: { id: 77, first_name: "طالب", is_bot: false },
      text,
    },
  });
}
function forumTopicMessage(chatId: number, messageId: number, threadId: number, text: string): string {
  return tgUpdate({
    message: {
      message_id: messageId, chat: { id: chatId, type: "supergroup", title: "منتدى الاختبار" },
      date: Math.floor(Date.now() / 1000), from: { id: 78, first_name: "طالبة", is_bot: false },
      message_thread_id: threadId, is_topic_message: true, text,
    },
  });
}
async function postWebhook(body: string) {
  return fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": ENV_SECRET },
    body,
  });
}
async function login(name: string, email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: name, email }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function j(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

const db = new Database("/home/z/my-project/db/custom.db");
// ---------------------------------------------------------------------------
// Setup: fixture alignment + fresh sources + OLD null-module items
// ---------------------------------------------------------------------------
db.run("UPDATE AppUser SET scopeAcademicYearId = 1 WHERE id = 2"); // طالبة التحقق → سنة أولى تخصص ١ (كالمقاييس)
db.run("DELETE FROM TelegramSource WHERE tgChannelId IN (?, ?)", [String(CHAN_CHAT), String(FORUM_CHAT)]);
db.run("DELETE FROM TelegramItem WHERE sourceId NOT IN (SELECT id FROM TelegramSource)");
db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'testchan', 'قناة الاختبار', 'channel', 'public', 1, 1, 0, datetime('now'), datetime('now'))`,
  [String(CHAN_CHAT)]
);
db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'testforum', 'منتدى الاختبار', 'group', 'public', 1, 1, 0, datetime('now'), datetime('now'))`,
  [String(FORUM_CHAT)]
);
const chanId = (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(CHAN_CHAT)) as { id: number }).id;

function insertItem(sourceId: number, tgId: number, title: string, caption: string, postedAt = "2026-09-01 10:00:00"): void {
  db.run(
    `INSERT INTO TelegramItem (sourceId, tgMessageId, mediaGroupId, kind, titleAr, captionText, searchText, fileName, mimeType, fileId, fileUniqueId, sizeBytes, link, specialtyId, moduleId, itemType, origin, postedBy, cohortId, isHidden, isFeatured, aiClassified, postedAt, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [sourceId, tgId, "", "text", title, caption, title, "", "", "", "", 0, "https://t.me/testchan/" + tgId, 1, null, "عام", "telegram", "طالب", null, 0, 0, 0, postedAt, postedAt, postedAt]
  );
}
// منشورات قديمة (قبل r64) بلا مقياس — سيناريو المستخدم الحقيقي
insertItem(chanId, 501, "امتحان النحو والتطبيق 2024", "امتحان النحو والتطبيق 2024");
insertItem(chanId, 502, "ملخص الأدب الجاهلي", "ملخص الأدب الجاهلي");
insertItem(chanId, 503, "درس في البلاغة", "درس في البلاغة");
insertItem(chanId, 504, "اجتماع عام للطلبة", "اجتماع عام للطلبة");

function itemByMsg(msgId: number): Record<string, unknown> | null {
  return (db.query("SELECT * FROM TelegramItem WHERE tgMessageId = ?").get(msgId) as Record<string, unknown>) ?? null;
}
async function library(studentCookie: string, moduleId?: number): Promise<Array<Record<string, unknown>>> {
  const qs = new URLSearchParams({ mode: "library" });
  if (moduleId != null) qs.set("moduleId", String(moduleId));
  const res = await fetch(`${BASE}/api/telegram/items?${qs}`, { headers: { cookie: studentCookie } });
  const data = await j(res);
  return (data.items ?? []) as Array<Record<string, unknown>>;
}

const ownerCookie = await login("مالك التحقق", "r52-owner@test.dz");
const studentCookie = await login("طالبة التحقق", "r52-student@test.dz");
console.log("\n=== A. منشور جديد بعنوان مقياس → يُربط عند الاستيراد ويجده الفلتر ===");
{
  const res = await postWebhook(channelPost(CHAN_CHAT, 601, "امتحان النحو والتطبيق — الدورة العادية"));
  check("webhook 200", res.status === 200, `got ${res.status}`);
  const it = itemByMsg(601);
  check("المنشور استُورد", !!it);
  check("المقياس رُبط عند الاستيراد (module_id=1)", Number(it?.moduleId ?? -1) === 1, `got ${it?.moduleId}`);
  const lib = await library(studentCookie, 1);
  const found = lib.some((x) => Number(x.tgMessageId) === 601);
  check("فلتر «النحو والتطبيق» يجد المنشور (عطل المستخدم قُضي عليه)", found);
  check("اسم المقياس يظهر للطالب (moduleName)", lib.some((x) => Number(x.tgMessageId) === 601 && String(x.moduleName ?? "").includes("النحو")));
}

console.log("\n=== B. عزل الفلاتر وظهور المكتبة بلا فلتر ===");
{
  const lib2 = await library(studentCookie, 2);
  check("فلتر «الأدب الجاهلي» لا يتسرب إليه المنشور", !lib2.some((x) => Number(x.tgMessageId) === 601));
  const libAll = await library(studentCookie);
  check("بلا فلتر مقياس → المنشور ظاهر", libAll.some((x) => Number(x.tgMessageId) === 601));
}

console.log("\n=== C. رسالة ترحيب → تُصنّف لكن تبقى بلا مقياس (سلوك صحيح) ===");
{
  await postWebhook(channelPost(CHAN_CHAT, 602, "مرحبا بكم في قناة الطلبة الجدد"));
  const it = itemByMsg(602);
  check("الترحيب استُورد وصُنّف", !!it && String(it.itemType ?? "") !== "");
  check("الترحيب بلا مقياس (ليس محتوى دراسياً)", it?.moduleId == null, `got ${it?.moduleId}`);
  const lib1 = await library(studentCookie, 1);
  check("الترحيب لا يظهر تحت أي فلتر مقياس", !lib1.some((x) => Number(x.tgMessageId) === 602));
}

console.log("\n=== D. الشفاء الجماعي — ربط المنشورات القديمة بلا مقياس ===");
{
  const res = await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "reclassify-source", sourceId: chanId }),
  });
  const data = await j(res);
  check("heal 200 (لم يُحجب ببوابة id)", res.status === 200, `code=${res.status} err=${data.error ?? ""}`);
  check("عالج ٥ منشورات (٣ دروسية + ترحيب + اجتماع)", Number(data.processed ?? -1) === 5, `processed=${data.processed}`);
  check("ربط ٣ بمقاييس", Number(data.moduleAssigned ?? -1) === 3, `assigned=${data.moduleAssigned}`);
  check("بقي ٢ بلا مقياس (ترحيب + اجتماع — صحيح)", Number(data.remaining ?? -1) === 2, `remaining=${data.remaining}`);

  const f1 = await library(studentCookie, 1);
  const f2 = await library(studentCookie, 2);
  const f3 = await library(studentCookie, 3);
  check("فلتر ١ يجد القديم (501) والجديد (601)", f1.some((x) => Number(x.tgMessageId) === 501) && f1.some((x) => Number(x.tgMessageId) === 601));
  check("فلتر ٢ يجد ملخص الأدب (502)", f2.some((x) => Number(x.tgMessageId) === 502));
  check("فلتر ٣ يجد درس البلاغة (503)", f3.some((x) => Number(x.tgMessageId) === 503));
  check("الاجتماع (504) لم يُربط زوراً", itemByMsg(504)?.moduleId == null);
}

console.log("\n=== E. حدود الدفعة + حراسة الصلاحيات ===");
{
  // أحدث زمنياً من الترحيب (٦٠٢ — أُبرز اليوم عبر الويبهوك) كي تُختار في الدفعة المحدودة أولاً
  const newer = "2026-09-08 12:00:00";
  insertItem(chanId, 603, "تمارين النحو والتطبيق رقم 5", "تمارين النحو والتطبيق رقم 5", newer);
  insertItem(chanId, 604, "TD الأدب الجاهلي", "TD الأدب الجاهلي", newer);
  insertItem(chanId, 605, "ملخص البلاغة النهائي", "ملخص البلاغة النهائي", newer);
  const res = await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "reclassify-source", sourceId: chanId, limit: 2 }),
  });
  const data = await j(res);
  check("دفعة محدودة: عالج ٢", Number(data.processed ?? -1) === 2, `processed=${data.processed}`);
  check("بقي ٣ (منشور + ترحيب + اجتماع)", Number(data.remaining ?? -1) === 3, `remaining=${data.remaining}`);
  const res2 = await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "reclassify-source", sourceId: chanId, limit: 40 }),
  });
  const data2 = await j(res2);
  check("الدفعة الثانية تكمل البقية القابلة للربط", Number(data2.remaining ?? -1) === 2, `remaining=${data2.remaining}`);
  const f1 = await library(studentCookie, 1);
  const f3 = await library(studentCookie, 3);
  check("تمارين النحو (603) مربوطة", f1.some((x) => Number(x.tgMessageId) === 603));
  check("ملخص البلاغة (605) مربوطة", f3.some((x) => Number(x.tgMessageId) === 605));

  const noAuth = await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reclassify-source", sourceId: chanId }),
  });
  check("بلا جلسة → 403", noAuth.status === 403, `got ${noAuth.status}`);
  const asStudent = await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: studentCookie },
    body: JSON.stringify({ action: "reclassify-source", sourceId: chanId }),
  });
  check("طالبة → 403 (ليست مشرفة)", asStudent.status === 403, `got ${asStudent.status}`);

  const emptyRes = await fetch(`${BASE}/api/telegram/items`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "reclassify-source", sourceId: 99999 }),
  });
  check("مصدر غير موجود → 404", emptyRes.status === 404, `got ${emptyRes.status}`);
}

console.log("\n=== F. منشور داخل موضوع منتدى (سيناريو ENS) ===");
{
  const res = await postWebhook(forumTopicMessage(FORUM_CHAT, 701, 3, "محاضرة البلاغة — المحاضرة الأولى"));
  check("webhook المنتدى 200", res.status === 200, `got ${res.status}`);
  const it = itemByMsg(701);
  check("منشور الموضوع استُورد", !!it);
  check("رُبط بمقياس البلاغة (module_id=3)", Number(it?.moduleId ?? -1) === 3, `got ${it?.moduleId}`);
  const f3 = await library(studentCookie, 3);
  check("فلتر البلاغة يجد منشور الموضوع", f3.some((x) => Number(x.tgMessageId) === 701));
}

console.log("\n=== G. فحص الاستيراد يعرض المقياس المربوط (حقل المشرف) ===");
{
  const res = await fetch(`${BASE}/api/telegram/setup`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "simulate", sourceId: chanId, text: "امتحان الأدب الجاهلي — الدورة الاستدراكية" }),
  });
  const data = await j(res);
  check("simulate 200", res.status === 200, `got ${res.status}`);
  const item = data.item as Record<string, unknown> | undefined;
  check("نتيجة الفحص تحمل اسم المقياس", !!item && String(item.moduleName ?? "").includes("الأدب"), `moduleName=${item?.moduleName ?? "—"}`);
  check("المنشور التجريبي نُظّف (حُذف)", data.cleaned === true);
}

// cleanup: test sources + their items (leave the rest of the DB intact)
db.run("DELETE FROM TelegramItem WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId IN (?, ?))", [String(CHAN_CHAT), String(FORUM_CHAT)]);
db.run("DELETE FROM TelegramSource WHERE tgChannelId IN (?, ?)", [String(CHAN_CHAT), String(FORUM_CHAT)]);

console.log(`\n=== النتيجة: ${passed} ناجح / ${failed} فاشل ===`);
process.exit(failed > 0 ? 1 : 0);
