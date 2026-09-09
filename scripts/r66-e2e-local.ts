/**
 * r66 e2e (local, production build) — أقسام القناة المنفصلة + العزل التلقائي للسنوات.
 *
 * Owner's requirements under test:
 *  1) «القناة فيها عدة أقسام — هل يمكن إضافتها منفصلة؟ يقول: القناة
 *     مضافة مسبقاً» — pasting a SECTION link (t.me/<chan>/<topic>) must
 *     add that section as a separate binding under the already-linked
 *     channel instead of the old 409 rejection.
 *  2) «الفلترة حسب السنوات والفصول داخلية وتلقائية لا اختيار من
 *     الطالب» — a first-year post appears to first-year students only,
 *     second-year to second-year… even when the student's year is known
 *     ONLY through their cohort (join request), not their profile scope.
 *
 * Run: bun run build && TELEGRAM_BOT_TOKEN="" TELEGRAM_WEBHOOK_SECRET=local-r62-test-secret \
 *      npx next start -p 3118 & bun run scripts/r66-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://127.0.0.1:3123";
const ENV_SECRET = "local-r62-test-secret";
// صيغة روابط تيليجرام: t.me/c/<internal>/<topic> حيث chatId = -100<internal>
const FORUM_INTERNAL = 8880002;
const FORUM_CHAT = -1008880002; // قناة/منتدى أسلوب ENS (قنوات متعددة الأقسام)
const NEW_INTERNAL = 998880001;
const NEW_CHAT = -100998880001; // قناة جديدة تُربط مباشرة برابط قسم

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

// ------------------------------------------------------------------- helpers
async function j(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
async function login(name: string, email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: name, email }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status} for ${email}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function postSources(cookie: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/telegram/sources`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await j(res) };
}
async function getSources(cookie: string) {
  const res = await fetch(`${BASE}/api/telegram/sources`, { headers: { cookie }, cache: "no-store" });
  return { status: res.status, data: await j(res) };
}
async function library(cookie: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ mode: "library", ...params });
  const res = await fetch(`${BASE}/api/telegram/items?${qs}`, { headers: { cookie }, cache: "no-store" });
  return await j(res);
}

let updateSeq = 900_000;
function tgUpdate(msg: Record<string, unknown>): string {
  updateSeq += 1;
  return JSON.stringify({ update_id: updateSeq, ...msg });
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

// ---------------------------------------------------------------- seed (SQL)
const db = new Database("/home/z/my-project/db/custom.db");
db.run("PRAGMA foreign_keys = OFF");

// تنظيف بيانات الجولة السابقة
db.run("DELETE FROM TelegramTopic");
db.run("DELETE FROM TelegramItem");
db.run("DELETE FROM DeviceSession");
db.run("DELETE FROM JoinRequest");
db.run("DELETE FROM AppUser WHERE email LIKE '%@test-r66%'");
db.run("DELETE FROM TelegramSource");
db.run("DELETE FROM ModuleCourse WHERE code IN ('R66-NHW', 'R66-JHL')");
db.run("DELETE FROM CohortGroup WHERE groupName = 'فوج الاختبار 66'");
db.run("DELETE FROM AcademicYear WHERE yearName IN ('السنة الأولى 66', 'السنة الثانية 66')");

// هيكل أكاديمي: مؤسسة ← تخصص ← سنتان ← مقياسان
db.run(`DELETE FROM Specialty WHERE code = 'R66-LIT'`);
const inst = (db.query("SELECT id FROM Institution LIMIT 1").get() as { id: number } | null) ?? null;
let instId: number;
if (inst) instId = inst.id;
else {
  db.run(`INSERT INTO Institution (nameAr, type, city, createdAt, updatedAt) VALUES ('مؤسسة اختبار 66', 'مدرسة عليا', 'الجزائر', datetime('now'), datetime('now'))`);
  instId = (db.query("SELECT id FROM Institution ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
}
db.run(`INSERT INTO Specialty (institutionId, nameAr, code, iconName, description, institution, faculty, createdAt, updatedAt) VALUES (?, 'اللغة والأدب العربي 66', 'R66-LIT', 'book', 'اختبار', 'مؤسسة اختبار 66', 'قسم الاختبار', datetime('now'), datetime('now'))`, [instId]);
const specId = (db.query("SELECT id FROM Specialty WHERE code = 'R66-LIT'").get() as { id: number }).id;

db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الأولى 66', 1, datetime('now'), datetime('now'))`, [specId]);
db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الثانية 66', 1, datetime('now'), datetime('now'))`, [specId]);
const y1 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الأولى 66'").get() as { id: number }).id;
const y2 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الثانية 66'").get() as { id: number }).id;

db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (?, ?, 1, 'النحو والتطبيق', 'R66-NHW', datetime('now'), datetime('now'))`, [specId, y1]);
db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (?, ?, 2, 'الأدب الجاهلي', 'R66-JHL', datetime('now'), datetime('now'))`, [specId, y2]);
const m1 = (db.query("SELECT id FROM ModuleCourse WHERE code = 'R66-NHW'").get() as { id: number }).id;
const m2 = (db.query("SELECT id FROM ModuleCourse WHERE code = 'R66-JHL'").get() as { id: number }).id;

// مستخدمو الاختبار
function addUser(fullName: string, email: string, role: string, scopeYear: number | null): number {
  db.run(
    `INSERT INTO AppUser (fullName, email, studentId, passwordHash, specialtyName, yearName, groupNumber, role, representativeScope, assignedSpecialtyId, scopeAcademicYearId, createdAt, updatedAt)
     VALUES (?, ?, ?, '', 'الأدب العربي', 'سنة اختبار', '01', ?, 'سنة كاملة', ?, ?, datetime('now'), datetime('now'))`,
    [fullName, email, email.split("@")[0], role, specId, scopeYear]
  );
  return (db.query("SELECT id FROM AppUser WHERE email = ?").get(email) as { id: number }).id;
}
const ownerId = addUser("مالك اختبار 66", "owner@test-r66.talib", "OWNER", null);
const adminId = addUser("مشرفة اختبار 66", "admin@test-r66.talib", "SPECIALTY_ADMIN", null);
const s1Id = addUser("طالبة سنة أولى", "s1@test-r66.talib", "STUDENT", y1); // سنتها من نطاقها
const s2Id = addUser("طالب سنة ثانية", "s2@test-r66.talib", "STUDENT", null); // سنته من فوجه فقط!
db.run(`UPDATE AppUser SET studentId = ? WHERE id = ?`, [`owner66`, ownerId]);

// فوج يتبع السنة الثانية + طلب انضمام مقبول للطالب الثاني
db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, 'فوج الاختبار 66', '', datetime('now'), datetime('now'))`, [specId, y2]);
const cohortId = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج الاختبار 66'").get() as { id: number }).id;
db.run(`INSERT INTO JoinRequest (cohortId, requesterId, status, message, createdAt, reviewedAt) VALUES (?, ?, 'approved', 'انضمام اختبار', datetime('now'), datetime('now'))`, [cohortId, s2Id]);

// القناة متعددة الأقسام (أسلوب ENS) — مربوطة مسبقاً بلا مقياس
db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'testforum66', 'منتدى ENS 66', 'channel', 'public', ?, 1, 0, datetime('now'), datetime('now'))`,
  [String(FORUM_CHAT), specId]
);
const forumSrcId = (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(FORUM_CHAT)) as { id: number }).id;

// منشوران مصنّفان مسبقاً (سنة أولى وسنة ثانية) لاختبار عزل المكتبة
function addItem(msgId: number, moduleId: number, title: string, srcId: number | null): void {
  db.run(
    `INSERT INTO TelegramItem (sourceId, tgMessageId, mediaGroupId, kind, titleAr, captionText, searchText, fileName, mimeType, fileId, fileUniqueId, sizeBytes, link, specialtyId, moduleId, itemType, origin, postedBy, cohortId, isHidden, isFeatured, aiClassified, postedAt, createdAt, updatedAt)
     VALUES (?, ?, '', 'pdf', ?, ?, ?, 'ملخص.pdf', 'application/pdf', '', '', 0, 'https://t.me/testforum66/${msgId}', ?, ?, 'ملخص', 'telegram', 'طالب', null, 0, 0, 0, datetime('now'), datetime('now'), datetime('now'))`,
    [srcId, msgId, title, title, title, specId, moduleId]
  );
}
addItem(901, m1, "ملخص النحو والتطبيق", forumSrcId); // سنة أولى
addItem(902, m2, "ملخص الأدب الجاهلي", forumSrcId); // سنة ثانية

function topicRow(threadId: number, srcId: number): Record<string, unknown> | null {
  return (db.query("SELECT * FROM TelegramTopic WHERE tgThreadId = ? AND sourceId = ?").get(threadId, srcId) as Record<string, unknown>) ?? null;
}
function itemByMsg(msgId: number): Record<string, unknown> | null {
  return (db.query("SELECT * FROM TelegramItem WHERE tgMessageId = ?").get(msgId) as Record<string, unknown>) ?? null;
}

// ------------------------------------------------------------------- run!
async function main() {
  console.log("\n═══ A) أقسام منفصلة عبر رابط القسم (مشكلة «القناة مضافة مسبقاً») ═══");
  const admin = await login("مشرفة اختبار 66", "admin@test-r66.talib");
  const owner = await login("مالك اختبار 66", "owner@test-r66.talib");
  const s1 = await login("طالبة سنة أولى", "s1@test-r66.talib");
  const s2 = await login("طالب سنة ثانية", "s2@test-r66.talib");

  // A1: نفس ما فعله المالك — لصق رابط قسم تحت قناة مربوطة → قبل r66: 409
  const a1 = await postSources(admin, { handle: `https://t.me/c/${FORUM_INTERNAL}/12`, yearId: y2, title: "سنة ثانية", sourceType: "channel" });
  check("A1 رابط قسم تحت قناة موجودة → يُضاف (لا 409)", a1.status === 200 && a1.data.topicAdded === true, `status=${a1.status} body=${JSON.stringify(a1.data).slice(0, 200)}`);
  check("A1 رسالة نجاح واضحة", String(a1.data.message ?? "").includes("قسماً منفصلاً"), a1.data.message as string);

  // A2: السجل في القاعدة
  const t12 = topicRow(12, forumSrcId);
  check("A2 رابط القسم مكتمل في القاعدة (سنة ثانية)", t12 != null && Number(t12?.yearId) === y2 && Number(t12?.moduleId ?? 0) === 0 && String(t12?.titleAr) === "سنة ثانية", JSON.stringify(t12 ?? {}));

  // A3: إعادة اللصق نفسه بمقياس → تحديث لا تكرار
  const a3 = await postSources(admin, { handle: `https://t.me/c/${FORUM_INTERNAL}/12`, moduleId: m2, title: "الأدب الجاهلي", sourceType: "channel" });
  const t12b = topicRow(12, forumSrcId);
  check("A3 إعادة اللصق → تحديث الربط لا تكراره", a3.status === 200 && a3.data.topicAdded === true && a3.data.created === false, JSON.stringify(a3.data).slice(0, 150));
  check("A3 الربط صار بالمقياس", t12b != null && Number(t12b?.moduleId) === m2 && (t12b?.yearId ?? null) === null, JSON.stringify(t12b ?? {}));

  // A4: رابط قسم بلا سنة ولا مقياس → توجيه واضح
  const a4 = await postSources(admin, { handle: `https://t.me/c/${FORUM_INTERNAL}/77`, sourceType: "channel" });
  check("A4 قسم بلا نطاق → 400 مع توجيه", a4.status === 400 && String(a4.data.error ?? "").includes("رابط قسم"), JSON.stringify(a4.data));

  // A5: رابط القناة كاملة (بلا رقم قسم) يبقى 409 مع توجيه للأقسام
  const a5 = await postSources(admin, { handle: `https://t.me/c/${FORUM_INTERNAL}`, sourceType: "channel" });
  // r68: نفس القواعد ترفض بذات 409 لكن التوجيه صار للربط المتعدد (غيّر قاعدة) بدل الأقسام
  check("A5 تكرار القناة كاملة → 409 مع توجيه لتغيير قاعدة (r68)", a5.status === 409 && String(a5.data.error ?? "").includes("غيّر قاعدة"), JSON.stringify(a5.data));

  // A6: قسم في قناة جديدة → تُنشأ القناة والقسم معاً
  const a6 = await postSources(owner, { handle: `https://t.me/c/${NEW_INTERNAL}/5`, yearId: y1, title: "سنة أولى", sourceType: "channel" });
  check("A6 قناة جديدة برابط قسم → تنشأ مع قسمها", a6.status === 200 && a6.data.topicAdded === true, `status=${a6.status} ${JSON.stringify(a6.data).slice(0, 150)}`);
  const newSrc = db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(NEW_CHAT)) as { id: number } | null;
  check("A6 المصدر الجديد موجود", newSrc != null);
  check("A6 رابط القسم تحت المصدر الجديد", newSrc != null && topicRow(5, newSrc.id) != null && Number(topicRow(5, newSrc!.id)?.yearId) === y1);

  // A7: GET sources يعرض عدد الأقسام
  const a7 = await getSources(admin);
  const list = (a7.data.sources ?? []) as Array<Record<string, unknown>>;
  const forumRow = list.find((s) => String(s.tgChannelId) === String(FORUM_CHAT));
  const newRow = list.find((s) => String(s.tgChannelId) === String(NEW_CHAT));
  check("A7 قائمة المصادر تعرض topicCount", forumRow != null && Number(forumRow?.topicCount) === 1 && newRow != null && Number(newRow?.topicCount) === 1, `forum=${forumRow?.topicCount} new=${newRow?.topicCount}`);

  // A8: طالب لا يستطيع ربط قنوات (403)
  const a8 = await postSources(s1, { handle: `https://t.me/c/${FORUM_INTERNAL}/30`, yearId: y1, sourceType: "channel" });
  check("A8 طالب لا يربط قنوات (403)", a8.status === 403, `status=${a8.status}`);

  console.log("\n═══ B) الاستيراد عبر ربط القسم → تصنيف حتمي ═══");

  // B1: منشور داخل القسم 12 (مربوط بمقياس الأدب الجاهلي) → حتمي
  const b1 = await postWebhook(forumTopicMessage(FORUM_CHAT, 910, 12, "سلسلة تمارين محلولة في الأدب الجاهلي رقم 3"));
  await new Promise((r) => setTimeout(r, 400));
  const it910 = itemByMsg(910);
  check("B1 منشور القسم المربوط → المقياس المفروض", b1.status === 200 && it910 != null && Number(it910?.moduleId) === m2, `module=${it910?.moduleId}`);

  // B2: منشور داخل قسم غير مربوط بعنوان مقياس سنة أولى → ربط ذكي بالمقياس
  const b2 = await postWebhook(forumTopicMessage(FORUM_CHAT, 911, 99, "امتحان النحو والتطبيق — الدورة العادية 2025"));
  await new Promise((r) => setTimeout(r, 400));
  const it911 = itemByMsg(911);
  check("B2 قسم غير مربوط + عنوان مقياس → ربط ذكي", b2.status === 200 && it911 != null && Number(it911?.moduleId) === m1, `module=${it911?.moduleId}`);

  // B3: رسالة ترحيب داخل قسم غير مربوط → لا تُضاف (بوابة المحتوى r65)
  const b3 = await postWebhook(forumTopicMessage(FORUM_CHAT, 912, 99, "مرحباً بكم في القناة الجديدة يا طلبة"));
  await new Promise((r) => setTimeout(r, 400));
  check("B3 رسالة ترحيب → لا تُضاف", itemByMsg(912) == null);

  console.log("\n═══ C) العزل التلقائي للسنوات (داخلي بلا اختيار الطالب) ═══");

  // C1: طالبة السنة الأولى (سنتها من نطاقها) → مكتبة سنتها فقط + yearLock
  const c1 = await library(s1);
  const c1Lock = c1.yearLock as { yearId: number; yearName: string } | null;
  const c1Items = (c1.items ?? []) as Array<Record<string, unknown>>;
  check("C1 yearLock من الخادم لطالبة الأولى", c1Lock != null && Number(c1Lock?.yearId) === y1 && String(c1Lock?.yearName).includes("الأولى"), JSON.stringify(c1Lock ?? null));
  check("C1 ترى مقاييس سنتها فقط (النحو) ولا ترى الثانية", c1Items.length > 0 && c1Items.every((it) => Number(it.moduleId) !== m2) && c1Items.some((it) => Number(it.moduleId) === m1), `n=${c1Items.length} modules=${c1Items.map((i) => i.moduleId).join(",")}`);

  // C2: طالب السنة الثانية — سنتُه من فوجه فقط (r66 fallback)
  const c2 = await library(s2);
  const c2Lock = c2.yearLock as { yearId: number; yearName: string } | null;
  const c2Items = (c2.items ?? []) as Array<Record<string, unknown>>;
  check("C2 سنة مستنتجة من الفوج (لا من النطاق) — yearLock", c2Lock != null && Number(c2Lock?.yearId) === y2 && String(c2Lock?.yearName).includes("الثانية"), JSON.stringify(c2Lock ?? null));
  check("C2 يرى مقاييس سنته فقط (الأدب الجاهلي)", c2Items.length > 0 && c2Items.every((it) => Number(it.moduleId) !== m1) && c2Items.some((it) => Number(it.moduleId) === m2), `n=${c2Items.length} modules=${c2Items.map((i) => i.moduleId).join(",")}`);

  // C3: طالبة الأولى تزيّف yearId=2 → الخادم يتجاهل
  const c3 = await library(s1, { yearId: String(y2) });
  const c3Items = (c3.items ?? []) as Array<Record<string, unknown>>;
  check("C3 yearId مزيّف يُتجاهل (مقفلة على سنتها)", (c3.yearLock as { yearId: number } | null)?.yearId === y1 && c3Items.every((it) => Number(it.moduleId) !== m2), `lock=${(c3.yearLock as { yearId: number } | null)?.yearId}`);

  // C4: المشرفة تتصفح بحرية بلا قفل
  const c4 = await library(admin);
  const c4Items = (c4.items ?? []) as Array<Record<string, unknown>>;
  check("C4 المشرفة بلا قفل وترى السنتين", c4.yearLock == null && c4Items.some((it) => Number(it.moduleId) === m1) && c4Items.some((it) => Number(it.moduleId) === m2), `lock=${JSON.stringify(c4.yearLock ?? null)} n=${c4Items.length}`);

  // C5: المالك بفلتر سنة صريح
  const c5 = await library(owner, { yearId: String(y1) });
  const c5Items = (c5.items ?? []) as Array<Record<string, unknown>>;
  check("C5 المالك بـ yearId=الأولى → الأولى فقط", c5Items.length > 0 && c5Items.every((it) => Number(it.moduleId) !== m2), `n=${c5Items.length}`);

  // C6: الطالب المنسّق semester لا يكسر القفل (فصل 2 داخل سنته)
  const c6 = await library(s2, { semester: "2" });
  const c6Items = (c6.items ?? []) as Array<Record<string, unknown>>;
  check("C6 فصل ضمن السنة المقفلة يعمل", c6Items.length > 0 && c6Items.every((it) => Number(it.moduleId) === m2), `n=${c6Items.length}`);

  console.log("\n═══ D) محاكاة الإنتاج: جدول المواضيع غائب ← المسار البديل (قسم مستقل مركّب) ═══");
  // الإنتاج بلا جدول telegram_topics (لم يُنفَّذ supabase_telegram_topics.sql) —
  // نُسقط الجدول محلياً ونثبت أن الأقسام تعمل بمصادر مركّبة "chat:thread"
  const topicDDL = (db.query("SELECT sql FROM sqlite_master WHERE name = 'TelegramTopic'").get() as { sql: string } | null)?.sql ?? null;
  db.run("DROP TABLE IF EXISTS TelegramTopic");
  const compositeKey = `${FORUM_CHAT}:34`;

  // D1: لصق رابط قسم (34) تحت القناة الموجودة والجدول غائب → نجاح لا خطأ
  const d1 = await postSources(admin, { handle: `https://t.me/c/${FORUM_INTERNAL}/34`, yearId: y1, title: "سنة أولى", sourceType: "channel" });
  check("D1 قسم بلا جدول مواضيع → يُضاف قسماً مستقلاً", d1.status === 200 && d1.data.topicAdded === true, `status=${d1.status} ${JSON.stringify(d1.data).slice(0, 200)}`);

  // D2: مصدر مركّب في القاعدة بذات أعمدة القناة + ربط السنة
  const secRow = db.query("SELECT * FROM TelegramSource WHERE tgChannelId = ?").get(compositeKey) as Record<string, unknown> | null;
  check("D2 مصدر مركّب chat:thread موجود", secRow != null && Number(secRow?.specialtyId) === specId && Number(secRow?.yearId) === y1 && Number(secRow?.moduleId ?? 0) === 0, JSON.stringify(secRow ?? {}));
  check("D2 عنوان القسم: القناة • القسم", secRow != null && String(secRow?.titleAr).includes("منتدى ENS 66") && String(secRow?.titleAr).includes("سنة أولى"), secRow?.titleAr as string);
  check("D2 القسم نشط ومرئي", secRow != null && Number(secRow?.isActive) === 1);

  // D3: إعادة اللصق نفسه → تحديث الربط (لا تكرار — UNIQUE tgChannelId)
  const d3 = await postSources(admin, { handle: `https://t.me/c/${FORUM_INTERNAL}/34`, moduleId: m1, title: "سنة أولى — نحو", sourceType: "channel" });
  const secRow2 = db.query("SELECT * FROM TelegramSource WHERE tgChannelId = ?").get(compositeKey) as Record<string, unknown> | null;
  check("D3 إعادة اللصق → تحديث (بلا تكرار)", d3.status === 200 && d3.data.created === false && secRow2 != null && Number(secRow2?.moduleId) === m1, JSON.stringify(d3.data).slice(0, 120));
  const secCount = db.query("SELECT COUNT(*) AS n FROM TelegramSource WHERE tgChannelId = ?").get(compositeKey) as { n: number };
  check("D3 صف واحد فقط للقسم", secCount.n === 1, `n=${secCount.n}`);

  // D4: منشور داخل القسم المركّب → تصنيف حتمي من ربط القسم + رابط t.me سليم
  const d4 = await postWebhook(forumTopicMessage(FORUM_CHAT, 920, 34, "تمارين النحو والتطبيق — السلسلة الثانية"));
  await new Promise((r) => setTimeout(r, 400));
  const it920 = itemByMsg(920);
  check("D4 منشور القسم المستقل → مقياس القسم حتمياً", d4.status === 200 && it920 != null && Number(it920?.moduleId) === m1, `module=${it920?.moduleId}`);
  check("D4 رابط المنشور يشير للموضوع الصحيح", it920 != null && String(it920?.link).includes("/34/"), it920?.link as string);
  check("D4 منشوره مربوط بمصدر القسم", it920 != null && Number(it920?.sourceId) === Number(secRow2?.id), `src=${it920?.sourceId} vs ${secRow2?.id}`);

  // D5: قائمة المصادر — القناة الأم تعرض «أقسام مرتبطة» والقسم صف مستقل
  const d5 = await getSources(admin);
  const d5list = (d5.data.sources ?? []) as Array<Record<string, unknown>>;
  const d5forum = d5list.find((s) => String(s.tgChannelId) === String(FORUM_CHAT));
  const d5section = d5list.find((s) => String(s.tgChannelId) === compositeKey);
  check("D5 الأم تحسب القسم المستقل ضمن أقسامها", d5forum != null && Number(d5forum?.topicCount) >= 1, `topicCount=${d5forum?.topicCount}`);
  check("D5 القسم يظهر صفاً مستقلاً (isSection)", d5section != null && d5section?.isSection === true, JSON.stringify(d5section ?? {}).slice(0, 120));

  // D6: قناة جديدة برابط قسم والجدول غائب → القناة والقسم المركّب معاً
  const NEW2_INTERNAL = 997770001;
  const NEW2_CHAT = -100997770001;
  const d6 = await postSources(owner, { handle: `https://t.me/c/${NEW2_INTERNAL}/7`, moduleId: m2, title: "أدب جاهلي", sourceType: "channel" });
  const new2Sec = db.query("SELECT * FROM TelegramSource WHERE tgChannelId = ?").get(`${NEW2_CHAT}:7`) as Record<string, unknown> | null;
  const new2Chan = db.query("SELECT * FROM TelegramSource WHERE tgChannelId = ?").get(String(NEW2_CHAT)) as Record<string, unknown> | null;
  check("D6 قناة جديدة + قسم مركّب معاً", d6.status === 200 && d6.data.topicAdded === true && new2Sec != null && new2Chan != null && Number(new2Sec?.moduleId) === m2, `status=${d6.status} sec=${new2Sec != null} chan=${new2Chan != null}`);

  // D7: طالبة السنة الأولى ترى منشور القسم المستقل (سنتها)
  const d7 = await library(s1);
  const d7Items = (d7.items ?? []) as Array<Record<string, unknown>>;
  check("D7 منشور القسم المستقل مرئي لطالبة سنته", d7Items.some((it) => Number(it.tgMessageId) === 920), `n=${d7Items.length}`);

  // D8: منشور خارج أي قسم (غير موضوع) يستوي مستوى القناة كما كان
  const d8 = await postWebhook(tgUpdate({
    message: {
      message_id: 921, chat: { id: FORUM_CHAT, type: "supergroup", title: "منتدى الاختبار" },
      date: Math.floor(Date.now() / 1000), from: { id: 78, first_name: "طالبة", is_bot: false },
      text: "ملخص جديد في الأدب الجاهلي — نقطة مهمة",
    },
  }));
  await new Promise((r) => setTimeout(r, 400));
  const it921 = itemByMsg(921);
  check("D8 منشور خارج الأقسام → مستوى القناة (يعمل كالمعتاد)", d8.status === 200 && (it921 == null || Number(it921?.sourceId) === forumSrcId), `src=${it921?.sourceId}`);

  // D9: حذف قسم مستقل عبر مسار المصدر العادي (لا كتل محلية)
  const del = await fetch(`${BASE}/api/telegram/sources?id=${secRow2?.id}`, { method: "DELETE", headers: { cookie: admin } });
  const d9row = db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(compositeKey);
  check("D9 حذف القسم المستقل يعمل (والبقاء للقناة الأم)", del.status === 200 && d9row == null && db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(FORUM_CHAT)) != null, `status=${del.status}`);

  // إعادة الجدول المحلي (لا تؤثر على بقية الجولات)
  if (topicDDL) db.run(topicDDL);

  console.log(`\n══════════ النتيجة: ${passed} ✅ / ${failed} ❌ ══════════`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error("💥", e); process.exit(1); });
