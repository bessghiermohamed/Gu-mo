/**
 * r65 e2e (local, production build) — عزل السنوات + بوابة المحتوى + روابط المواضيع.
 *
 * Owner's requirements under test:
 *  1) «مقياس السنة الأولى حين يُصنَّف يظهر لطلبة السنة الأولى فقط» — year
 *     isolation at the API level (student locked to their year, admins browse).
 *  2) Six-step library filter: السنة → الفصل → المقياس → النوع → نوع الملف → المصدر
 *     (yearId + semester + kind + moduleId + itemType params + client source filter).
 *  3) «حتى لو لم يكن العنوان اسم مقياس… لن يضيفه البوت أو يصنّفه» — strict
 *     course-content gate: welcome/chatter/negated-mention are NOT added at all.
 *  4) «عند إضافة قناة أضف روابط المواضيع ذات الصلة… قناة عامة، مجموعة، سنة
 *     أولى، سنة ثانية، تخصص محدد» — topic bindings: module-bound topic =
 *     deterministic, year-bound topic narrows candidates, general topic skipped.
 *
 * Run: bun run build && PORT=3117 npx next start & bun run scripts/r65-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://localhost:3117";
const ENV_SECRET = "local-r62-test-secret";
const CHAN_CHAT = -1008880001; // قناة اختبار (مكتبة، بلا ربط مقياس)
const FORUM_CHAT = -1008880002; // منتدى اختبار (أسلوب ENS)

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

let updateSeq = 700_000;
function tgUpdate(msg: Record<string, unknown>): string {
  updateSeq += 1;
  return JSON.stringify({ update_id: updateSeq, ...msg });
}
function channelPost(chatId: number, messageId: number, text: string, document?: Record<string, unknown>): string {
  return tgUpdate({
    channel_post: {
      message_id: messageId, chat: { id: chatId, type: "channel", title: "قناة الاختبار" },
      date: Math.floor(Date.now() / 1000), from: { id: 77, first_name: "طالب", is_bot: false },
      text, ...(document ?? {}),
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
async function postWebhook(body: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": ENV_SECRET },
    body,
  });
  return { status: res.status, data: await j(res) };
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
// Setup: سنة ثانية + مقاييسها (برمجة 2 والهندسة المعمارية) + مصادر الاختبار
// ---------------------------------------------------------------------------
db.run("UPDATE AppUser SET scopeAcademicYearId = 1 WHERE id = 2"); // طالبة التحقق → سنة أولى
db.run("DELETE FROM TelegramTopic WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId IN (?, ?))", [String(CHAN_CHAT), String(FORUM_CHAT)]);
db.run("DELETE FROM TelegramItem WHERE sourceId NOT IN (SELECT id FROM TelegramSource)");
db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'testchan65', 'قناة اختبار 65', 'channel', 'public', 1, 1, 0, datetime('now'), datetime('now'))`,
  [String(CHAN_CHAT)]
);
db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'testforum65', 'منتدى اختبار 65', 'group', 'public', 1, 1, 0, datetime('now'), datetime('now'))`,
  [String(FORUM_CHAT)]
);
const chanId = (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(CHAN_CHAT)) as { id: number }).id;
const forumId = (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(FORUM_CHAT)) as { id: number }).id;

// سنة ثانية لتخصص ١ + مقياسان: برمجة 2 (فصل ٢) والهندسة المعمارية (فصل ١)
db.run(`DELETE FROM ModuleCourse WHERE name IN ('برمجة 2', 'الهندسة المعمارية') AND specialtyId = 1`);
db.run(`DELETE FROM AcademicYear WHERE yearName = 'السنة الثانية' AND specialtyId = 1`);
db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (1, 'السنة الثانية', 1, datetime('now'), datetime('now'))`);
const y2 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الثانية' AND specialtyId = 1").get() as { id: number }).id;
db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (1, ?, 2, 'برمجة 2', 'PRG2', datetime('now'), datetime('now'))`, [y2]);
db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (1, ?, 1, 'الهندسة المعمارية', 'ARCH', datetime('now'), datetime('now'))`, [y2]);
const prg2 = (db.query("SELECT id FROM ModuleCourse WHERE name = 'برمجة 2' AND specialtyId = 1").get() as { id: number }).id;
const arch = (db.query("SELECT id FROM ModuleCourse WHERE name = 'الهندسة المعمارية' AND specialtyId = 1").get() as { id: number }).id;

// منشور قديم بلا مقياس (قبل r65) — يبقى في القاعدة لكن لا يظهر بمكتبة الطلبة
db.run(
  `INSERT INTO TelegramItem (sourceId, tgMessageId, mediaGroupId, kind, titleAr, captionText, searchText, fileName, mimeType, fileId, fileUniqueId, sizeBytes, link, specialtyId, moduleId, itemType, origin, postedBy, cohortId, isHidden, isFeatured, aiClassified, postedAt, createdAt, updatedAt)
   VALUES (?, 805, '', 'text', 'اجتماع عام للطلبة', 'اجتماع عام للطلبة', 'اجتماع عام للطلبة', '', '', '', '', 0, 'https://t.me/testchan65/805', 1, null, 'عام', 'telegram', 'طالب', null, 0, 0, 0, '2026-09-01 10:00:00', '2026-09-01 10:00:00', '2026-09-01 10:00:00')`,
  [chanId]
);

function itemByMsg(msgId: number): Record<string, unknown> | null {
  return (db.query("SELECT * FROM TelegramItem WHERE tgMessageId = ?").get(msgId) as Record<string, unknown>) ?? null;
}
async function library(cookie: string, params: Record<string, string> = {}): Promise<Array<Record<string, unknown>>> {
  const qs = new URLSearchParams({ mode: "library", ...params });
  const res = await fetch(`${BASE}/api/telegram/items?${qs}`, { headers: { cookie } });
  const data = await j(res);
  return (data.items ?? []) as Array<Record<string, unknown>>;
}

const ownerCookie = await login("مالك التحقق", "r52-owner@test.dz");
const studentCookie = await login("طالبة التحقق", "r52-student@test.dz");

// ---------------------------------------------------------------------------
console.log("\n=== A. بوابة المحتوى الدراسي عند الاستيراد (الطلب ٣) ===");
{
  const { status, data } = await postWebhook(channelPost(CHAN_CHAT, 801, "امتحان النحو والتطبيق — الدورة العادية"));
  check("webhook 200", status === 200, `got ${status}`);
  check("عنوان مقياس → status=inserted", data.status === "inserted", `status=${data.status}`);
  const it = itemByMsg(801);
  check("استُورد ورُبط بمقياس النحو (سنة أولى)", !!it && Number(it.moduleId) === 1, `module=${it?.moduleId}`);
}
{
  // رسالة الترحيب التي كان المستخدم يراها مصنَّفة — الآن لا تُضاف إطلاقاً
  const { data } = await postWebhook(channelPost(CHAN_CHAT, 802, "مرحبا بكم في قناة الطلبة الجدد"));
  check("الترحيب → status=skipped (لم يُضَف)", data.status === "skipped", `status=${data.status}`);
  check("الترحيب ليس في قاعدة البيانات أصلاً", itemByMsg(802) === null);
}
{
  // مثال المالك حرفياً: ذكر مقياس بنفي
  const { data } = await postWebhook(channelPost(CHAN_CHAT, 803, "لدينا 10 مقاييس لكن ليست الهندسة المعمارية"));
  check("«لدينا 10 مقاييس لكن ليست الهندسة» → skipped", data.status === "skipped", `status=${data.status}`);
  check("لم يُضَف ولم يُصنَّف", itemByMsg(803) === null);
}
{
  const { data } = await postWebhook(channelPost(CHAN_CHAT, 804, "امتحان برمجة 2 — السنة الثانية"));
  check("مقياس مبرمج (سنة ثانية) → inserted", data.status === "inserted", `status=${data.status}`);
  const it = itemByMsg(804);
  check("رُبط بمقياس برمجة 2 (سنة ثانية)", !!it && Number(it.moduleId) === prg2, `module=${it?.moduleId} prg2=${prg2}`);
}
{
  // ملف PDF (اسم ملف يذكر المقياس) — الملفات محتوى بالتعريف
  const { data } = await postWebhook(channelPost(CHAN_CHAT, 806, "", {
    document: { file_id: "r65doc1", file_unique_id: "u65doc1", file_name: "ملخص الهندسة المعمارية.pdf", mime_type: "application/pdf", file_size: 12345 },
  }));
  check("PDF → inserted", data.status === "inserted", `status=${data.status}`);
  const it = itemByMsg(806);
  check("PDF رُبط بمقياس الهندسة المعمارية", !!it && Number(it.moduleId) === arch, `module=${it?.moduleId} arch=${arch}`);
  check("نوع الملف pdf", it?.kind === "pdf");
}

// ---------------------------------------------------------------------------
console.log("\n=== B. عزل السنوات في مكتبة الطالب (الطلب ١) ===");
{
  const lib = await library(studentCookie);
  check("طالبة سنة أولى ترى منشور سنتها (801)", lib.some((x) => Number(x.tgMessageId) === 801));
  check("ولا ترى منشور السنة الثانية (804)", !lib.some((x) => Number(x.tgMessageId) === 804));
  check("ولا منشور PDF للسنة الثانية (806)", !lib.some((x) => Number(x.tgMessageId) === 806));
  check("منشور قديم بلا مقياس (805) غير مرئي بالمكتبة", !lib.some((x) => Number(x.tgMessageId) === 805));
  check("الترحيب/النفي غير موجودين أصلاً", !lib.some((x) => [802, 803].includes(Number(x.tgMessageId))));
}
{
  // الطالبة تحاول yearId لسنة أخرى عبر الرابط — الخادم يتجاهله (القيد سنتها)
  const lib = await library(studentCookie, { yearId: String(y2) });
  check("yearId مزور من طالبة → يبقى قيد سنتها", !lib.some((x) => Number(x.tgMessageId) === 804) && lib.some((x) => Number(x.tgMessageId) === 801));
}
{
  // طالبة سنة ثانية (تغيير النطاق مباشرة) — ترى سنتها فقط
  db.run("UPDATE AppUser SET scopeAcademicYearId = ? WHERE id = 2", [y2]);
  const lib = await library(studentCookie);
  check("طالب السنة الثانية يرى برمجة 2 (804)", lib.some((x) => Number(x.tgMessageId) === 804));
  check("ولا يرى مقياس السنة الأولى (801)", !lib.some((x) => Number(x.tgMessageId) === 801));
  db.run("UPDATE AppUser SET scopeAcademicYearId = 1 WHERE id = 2");
  const libBack = await library(studentCookie);
  check("عودة لنطاق السنة الأولى تعيد العزل", libBack.some((x) => Number(x.tgMessageId) === 801) && !libBack.some((x) => Number(x.tgMessageId) === 804));
}

// ---------------------------------------------------------------------------
console.log("\n=== C. الفلاتر الست للمشرف (الطلب ٢: السنة/الفصل/المقياس/نوع الملف) ===");
{
  // المالك المزروع تخصصه ٢ — ننقله مؤقتاً لتخصص ١ لفحص مكتبة الاختبار ثم نعيده
  db.run("UPDATE AppUser SET assignedSpecialtyId = 1 WHERE id = 1");
  const all = await library(ownerCookie);
  check("المالك بلا فلاتر يرى السنتين (801+804+806)", [801, 804, 806].every((id) => all.some((x) => Number(x.tgMessageId) === id)));
  const y1 = await library(ownerCookie, { yearId: "1" });
  check("فلتر السنة الأولى → 801 فقط", y1.some((x) => Number(x.tgMessageId) === 801) && !y1.some((x) => Number(x.tgMessageId) === 804));
  const y2lib = await library(ownerCookie, { yearId: String(y2) });
  check("فلتر السنة الثانية → 804+806 فقط", y2lib.some((x) => Number(x.tgMessageId) === 804) && !y2lib.some((x) => Number(x.tgMessageId) === 801));
  const sem1 = await library(ownerCookie, { semester: "1" });
  check("فلتر الفصل ١ → 801 (فصل ١) وليس برمجة 2 (فصل ٢)", sem1.some((x) => Number(x.tgMessageId) === 801) && !sem1.some((x) => Number(x.tgMessageId) === 804));
  const sem2 = await library(ownerCookie, { semester: "2" });
  check("فلتر الفصل ٢ → 804 فقط", sem2.some((x) => Number(x.tgMessageId) === 804) && !sem2.some((x) => Number(x.tgMessageId) === 801));
  const pdfOnly = await library(ownerCookie, { kind: "pdf" });
  check("فلتر نوع الملف PDF → 806 فقط", pdfOnly.some((x) => Number(x.tgMessageId) === 806) && pdfOnly.length === 1);
  const modPrg = await library(ownerCookie, { moduleId: String(prg2) });
  check("فلتر المقياس برمجة 2 → 804", modPrg.some((x) => Number(x.tgMessageId) === 804));
  const combo = await library(ownerCookie, { yearId: String(y2), semester: "1" });
  check("سنة ثانية + فصل ١ → الهندسة (806) وليس برمجة 2 (804)", combo.some((x) => Number(x.tgMessageId) === 806) && !combo.some((x) => Number(x.tgMessageId) === 804));
  db.run("UPDATE AppUser SET assignedSpecialtyId = 2 WHERE id = 1"); // إعادة تخصص المالك
}

// ---------------------------------------------------------------------------
console.log("\n=== D. روابط المواضيع — واجهة الإدارة (الطلب ٤) ===");
{
  // إنشاء روابط: موضوع → مقياس، موضوع → عام، موضوع → سنة
  const mk = async (body: Record<string, unknown>) =>
    await fetch(`${BASE}/api/telegram/topics`, { method: "POST", headers: { "Content-Type": "application/json", cookie: ownerCookie }, body: JSON.stringify(body) });
  let res = await mk({ sourceId: forumId, handle: "https://t.me/testforum65/3", titleAr: "البلاغة", moduleId: 3, link: "https://t.me/testforum65/3" });
  check("POST موضوع → مقياس البلاغة (201/200)", res.ok, `code=${res.status}`);
  res = await mk({ sourceId: forumId, handle: "9", titleAr: "نقاش عام", isGeneral: true });
  check("POST موضوع عام (رقم مجرد)", res.ok, `code=${res.status}`);
  res = await mk({ sourceId: forumId, handle: "https://t.me/testforum65/10", titleAr: "السنة الثانية", yearId: y2 });
  check("POST موضوع → السنة الثانية", res.ok, `code=${res.status}`);
  res = await mk({ sourceId: forumId, handle: "https://t.me/testforum65/3", titleAr: "مكرر", moduleId: 3 });
  check("موضوع مكرر → 409", res.status === 409, `code=${res.status}`);
  res = await mk({ sourceId: forumId, handle: "ليس رابطاً" });
  check("رابط غير مفهوم → 400", res.status === 400, `code=${res.status}`);
  res = await mk({ sourceId: forumId, handle: "11", yearId: 2 }); // سنة تخصص آخر
  check("سنة خارج تخصص المصدر → 403", res.status === 403, `code=${res.status}`);
  res = await mk({ sourceId: forumId, handle: "12" });
  check("بلا هدف (لا مقياس/سنة/عام) → 400", res.status === 400, `code=${res.status}`);

  const lst = await fetch(`${BASE}/api/telegram/topics?sourceId=${forumId}`, { headers: { cookie: ownerCookie } });
  const data = await j(lst);
  const topics = (data.topics ?? []) as Array<Record<string, unknown>>;
  check("GET يسرد ٣ روابط", topics.length === 3, `n=${topics.length}`);
  check("أسماء الأهداف تظهر (البلاغة/السنة الثانية/عام)", topics.some((t) => t.moduleName === "البلاغة") && topics.some((t) => String(t.yearName ?? "").includes("الثانية")) && topics.some((t) => t.isGeneral === true));

  const asStudent = await fetch(`${BASE}/api/telegram/topics?sourceId=${forumId}`, { headers: { cookie: studentCookie } });
  check("طالبة → 403", asStudent.status === 403, `code=${asStudent.status}`);
  const noAuth = await fetch(`${BASE}/api/telegram/topics?sourceId=${forumId}`);
  check("بلا جلسة → 403", noAuth.status === 403, `code=${noAuth.status}`);

  const generalId = topics.find((t) => t.isGeneral === true)?.id;
  if (generalId != null) {
    const del = await fetch(`${BASE}/api/telegram/topics?id=${generalId}`, { method: "DELETE", headers: { cookie: ownerCookie } });
    check("DELETE رابط عام", del.ok, `code=${del.status}`);
    const after = await fetch(`${BASE}/api/telegram/topics?sourceId=${forumId}`, { headers: { cookie: ownerCookie } });
    const dataAfter = await j(after);
    check("بعد الحذف: رابطان", ((dataAfter.topics ?? []) as unknown[]).length === 2);
    // نعيد الموضوع العام لاختبار الاستيراد أدناه
    await mk({ sourceId: forumId, handle: "9", titleAr: "نقاش عام", isGeneral: true });
  } else {
    check("إيجاد رابط «عام» للحذف", false);
  }
}

// ---------------------------------------------------------------------------
console.log("\n=== E. روابط المواضيع عند الاستيراد — تصنيف حتمي ===");
{
  // موضوع 3 مربط بمقياس البلاغة: نص لا يذكر أي مقياس → يُربط حتمياً
  const { data } = await postWebhook(forumTopicMessage(FORUM_CHAT, 901, 3, "تنبيه مهم جدا — انتبهوا جميعا"));
  check("منشور داخل موضوع مربط بمقياس → inserted", data.status === "inserted", `status=${data.status}`);
  const it = itemByMsg(901);
  check("رُبط بمقياس البلاغة مباشرة (بلا ذكره في النص!)", !!it && Number(it.moduleId) === 3, `module=${it?.moduleId}`);
}
{
  // موضوع 9 عام → لا يُستورد
  const { data } = await postWebhook(forumTopicMessage(FORUM_CHAT, 902, 9, "نقاش حر بين الطلبة"));
  check("منشور داخل موضوع «عام» → skipped", data.status === "skipped", `status=${data.status}`);
  check("ليس في قاعدة البيانات", itemByMsg(902) === null);
}
{
  // موضوع 10 مربط بالسنة الثانية → مقاييس السنة فقط + بوابة المحتوى
  const { data } = await postWebhook(forumTopicMessage(FORUM_CHAT, 903, 10, "ملخص برمجة 2 شامل"));
  check("منشور داخل موضوع سنة → inserted", data.status === "inserted", `status=${data.status}`);
  const it = itemByMsg(903);
  check("رُبط بمقياس برمجة 2 (مرشحو السنة الثانية)", !!it && Number(it.moduleId) === prg2, `module=${it?.moduleId}`);
}
{
  // موضوع غير مربط (4) → البوابة تعمل كالمعتاد
  const { data } = await postWebhook(forumTopicMessage(FORUM_CHAT, 904, 4, "شكرا جزيلا على المجهود"));
  check("موضوع غير مربط ونص غير دراسي → skipped", data.status === "skipped", `status=${data.status}`);
  const ok903 = await library(studentCookie);
  check("طالبة سنة أولى لا ترى منشور موضوع السنة الثانية (903)", !ok903.some((x) => Number(x.tgMessageId) === 903));
}

// ---------------------------------------------------------------------------
console.log("\n=== F. فحص الاستيراد — threadId + حالة «لم يُضَف» ===");
{
  const res = await fetch(`${BASE}/api/telegram/setup`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "simulate", sourceId: forumId, threadId: "3", text: "أي نص لا يذكر أي مقياس إطلاقا" }),
  });
  const data = await j(res);
  check("simulate بموضوع مربط → 200", res.status === 200, `got ${res.status}`);
  const item = data.item as Record<string, unknown> | undefined;
  check("يطبّق ربط الموضوع (المقياس: البلاغة)", !!item && String(item.moduleName ?? "") === "البلاغة", `moduleName=${item?.moduleName ?? "—"}`);
  check("نُظّف تلقائياً", data.cleaned === true);
}
{
  const res = await fetch(`${BASE}/api/telegram/setup`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "simulate", sourceId: chanId, text: "مرحبا بكم أحبتي" }),
  });
  const data = await j(res);
  check("simulate لترحيب → 200 + skipped=true (ليس خطأ)", res.status === 200 && data.skipped === true, `code=${res.status} skipped=${data.skipped}`);
  check("item=null ورسالة البوابة واضحة", data.item == null && String(data.message ?? "").includes("بوابة"));
}

// ---------------------------------------------------------------------------
console.log("\n=== G. انحدار r64 — الفلتر بالمقياس ما زال يجد المنشورات ===");
{
  const lib = await library(studentCookie, { moduleId: "1" });
  check("فلتر النحو والتطبيق يجد 801 (إصلاح r64 قائم)", lib.some((x) => Number(x.tgMessageId) === 801));
  const all = await library(studentCookie);
  check("مكتبة الطالبة = عناصر مربطة بمقياس فقط", all.every((x) => x.moduleId != null && x.moduleName != null));
}

// cleanup: مصادر ومواضيع ومنشورات الاختبار + المقاييس والسنة المستحدثة
db.run("DELETE FROM TelegramTopic WHERE sourceId IN (?, ?)", [chanId, forumId]);
db.run("DELETE FROM TelegramItem WHERE sourceId IN (?, ?)", [chanId, forumId]);
db.run("DELETE FROM TelegramSource WHERE id IN (?, ?)", [chanId, forumId]);
db.run(`DELETE FROM ModuleCourse WHERE id IN (?, ?)`, [prg2, arch]);
db.run(`DELETE FROM AcademicYear WHERE id = ?`, [y2]);
db.run("UPDATE AppUser SET scopeAcademicYearId = 1 WHERE id = 2");

console.log(`\n=== النتيجة: ${passed} ناجح / ${failed} فاشل ===`);
process.exit(failed > 0 ? 1 : 0);
