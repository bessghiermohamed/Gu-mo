/**
 * r67 e2e (local, production build) — مساحة الفوج المشتركة تستقبل كل شيء.
 *
 * Owner's report under test:
 *  «ربطت قناة Vogue فلم تظهر أي منشورات في المساحة المشتركة لدروس
 *   تيليجرام» — سببان جذريان:
 *   1) رسائل النص/الروابط في مجموعات الفوج العادية (غير المنتديات) كانت
 *      تُتجاهَل كلياً (فلتر دردشة r63 كان يسري على مساحات الفوج أيضاً).
 *   2) القناة لم تكن تستطيع الارتباط بفوج أصلاً — القنوات مكتبة فقط،
 *      ومنشوراتها غير الدراسية تحجبها بوابة المحتوى فلا تظهر لأحد.
 *
 * Run: bun run build && TELEGRAM_BOT_TOKEN="" TELEGRAM_WEBHOOK_SECRET=local-r62-test-secret \
 *      npx next start -p 3119 & bun run scripts/r67-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://127.0.0.1:3119";
const ENV_SECRET = "local-r62-test-secret";

// معرّفات تيليجرام (سلبية بأسلوب القنوات/المجموعات الحقيقية)
const GROUP_INTERNAL = 777000111;
const GROUP_CHAT = -100777000111; // مجموعة فوج عادية (بلا مواضيع)
const CHAN_INTERNAL = 777000222;
const CHAN_CHAT = -100777000222; // قناة تُربط بمساحة الفوج مباشرة (Vogue)
const LIBCHAN_INTERNAL = 777000333;
const LIBCHAN_CHAT = -100777000333; // قناة مكتبة عادية (بدون ربط)
const ENS_CHAT = -100777000444; // منتدى مكتبة (مجموعة بلا فوج — أسلوب ENS)

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
async function patchSources(cookie: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/telegram/sources`, {
    method: "PATCH", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await j(res) };
}
async function getSources(cookie: string) {
  const res = await fetch(`${BASE}/api/telegram/sources`, { headers: { cookie }, cache: "no-store" });
  return { status: res.status, data: await j(res) };
}
async function getItems(cookie: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${BASE}/api/telegram/items?${qs}`, { headers: { cookie }, cache: "no-store" });
  return await j(res);
}

let updateSeq = 700_000;
function tgUpdate(msg: Record<string, unknown>): string {
  updateSeq += 1;
  return JSON.stringify({ update_id: updateSeq, ...msg });
}
function groupText(chatId: number, messageId: number, text: string): string {
  return tgUpdate({
    message: {
      message_id: messageId, chat: { id: chatId, type: "supergroup", title: "مجموعة الفوج" },
      date: Math.floor(Date.now() / 1000), from: { id: 55, first_name: "طالب", is_bot: false },
      text,
    },
  });
}
function channelText(chatId: number, messageId: number, text: string): string {
  return tgUpdate({
    channel_post: {
      message_id: messageId, chat: { id: chatId, type: "channel", title: "قناة" },
      date: Math.floor(Date.now() / 1000), text,
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

db.run("DELETE FROM TelegramTopic");
db.run("DELETE FROM TelegramItem");
db.run("DELETE FROM DeviceSession");
db.run("DELETE FROM JoinRequest");
db.run("DELETE FROM AppUser WHERE email LIKE '%@test-r67%'");
db.run("DELETE FROM TelegramSource WHERE tgChannelId LIKE '-100777000%'");
db.run("DELETE FROM ModuleCourse WHERE code IN ('R67-NHW', 'R67-JHL')");
db.run("DELETE FROM CohortGroup WHERE groupName LIKE 'فوج الاختبار 67%'");
db.run("DELETE FROM AcademicYear WHERE yearName IN ('السنة الأولى 67', 'السنة الثانية 67')");
db.run("DELETE FROM Specialty WHERE code = 'R67-LIT'");

const inst = (db.query("SELECT id FROM Institution LIMIT 1").get() as { id: number } | null) ?? null;
let instId: number;
if (inst) instId = inst.id;
else {
  db.run(`INSERT INTO Institution (nameAr, type, city, createdAt, updatedAt) VALUES ('مؤسسة اختبار 67', 'مدرسة عليا', 'الجزائر', datetime('now'), datetime('now'))`);
  instId = (db.query("SELECT id FROM Institution ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
}
db.run(`INSERT INTO Specialty (institutionId, nameAr, code, iconName, description, institution, faculty, createdAt, updatedAt) VALUES (?, 'اللغة والأدب العربي 67', 'R67-LIT', 'book', 'اختبار r67', 'مؤسسة اختبار 67', 'قسم الاختبار', datetime('now'), datetime('now'))`, [instId]);
const specId = (db.query("SELECT id FROM Specialty WHERE code = 'R67-LIT'").get() as { id: number }).id;

db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الأولى 67', 1, datetime('now'), datetime('now'))`, [specId]);
db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الثانية 67', 1, datetime('now'), datetime('now'))`, [specId]);
const y1 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الأولى 67'").get() as { id: number }).id;
const y2 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الثانية 67'").get() as { id: number }).id;

db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (?, ?, 1, 'النحو والتطبيق', 'R67-NHW', datetime('now'), datetime('now'))`, [specId, y1]);
db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (?, ?, 2, 'الأدب الجاهلي', 'R67-JHL', datetime('now'), datetime('now'))`, [specId, y2]);
const m1 = (db.query("SELECT id FROM ModuleCourse WHERE code = 'R67-NHW'").get() as { id: number }).id;
const m2 = (db.query("SELECT id FROM ModuleCourse WHERE code = 'R67-JHL'").get() as { id: number }).id;

function addUser(fullName: string, email: string, role: string, scopeYear: number | null, scopeCohort: number | null): number {
  db.run(
    `INSERT INTO AppUser (fullName, email, studentId, passwordHash, specialtyName, yearName, groupNumber, role, representativeScope, assignedSpecialtyId, scopeAcademicYearId, scopeCohortGroupId, createdAt, updatedAt)
     VALUES (?, ?, ?, '', 'الأدب العربي', 'سنة اختبار', '01', ?, 'سنة كاملة', ?, ?, ?, datetime('now'), datetime('now'))`,
    [fullName, email, email.split("@")[0], role, specId, scopeYear, scopeCohort]
  );
  return (db.query("SELECT id FROM AppUser WHERE email = ?").get(email) as { id: number }).id;
}

// فوجان: فوج الاختبار 67 (سنة ثانية — الفوج المستهدف) وفوج بديل (سنة أولى)
db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, 'فوج الاختبار 67', '', datetime('now'), datetime('now'))`, [specId, y2]);
db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, 'فوج بديل 67', '', datetime('now'), datetime('now'))`, [specId, y1]);
const cohortId = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج الاختبار 67'").get() as { id: number }).id;
const cohort2Id = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج بديل 67'").get() as { id: number }).id;

const ownerId = addUser("مالك اختبار 67", "owner@test-r67.talib", "OWNER", null, null);
const repId = addUser("ممثل الفوج 67", "rep@test-r67.talib", "REPRESENTATIVE", null, cohortId);
const s1Id = addUser("طالبة سنة أولى", "s1@test-r67.talib", "STUDENT", y1, null);
const s2Id = addUser("طالب سنة ثانية", "s2@test-r67.talib", "STUDENT", null, null); // منتمٍ للفوج عبر طلب انضمام فقط
db.run(`INSERT INTO JoinRequest (cohortId, requesterId, status, message, createdAt, reviewedAt) VALUES (?, ?, 'approved', 'انضمام اختبار 67', datetime('now'), datetime('now'))`, [cohortId, s2Id]);

// منتدى مكتبة أسلوب ENS: مجموعة بلا فوج وبلا مقياس (كالإنتاج الحقيقي)
db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'ens67', 'منتدى ENS 67', 'group', 'public', ?, 1, 0, datetime('now'), datetime('now'))`,
  [String(ENS_CHAT), specId]
);
const ensSrcId = (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(ENS_CHAT)) as { id: number }).id;

// منشوران مصنّفان مسبقاً (سنة أولى/ثانية) تحت المنتدى — لانحدار عزل السنوات
function addItem(msgId: number, moduleId: number, title: string, srcId: number | null): void {
  db.run(
    `INSERT INTO TelegramItem (sourceId, tgMessageId, mediaGroupId, kind, titleAr, captionText, searchText, fileName, mimeType, fileId, fileUniqueId, sizeBytes, link, specialtyId, moduleId, itemType, origin, postedBy, cohortId, isHidden, isFeatured, aiClassified, postedAt, createdAt, updatedAt)
     VALUES (?, ?, '', 'pdf', ?, ?, ?, 'ملخص.pdf', 'application/pdf', '', '', 0, 'https://t.me/ens67/${msgId}', ?, ?, 'ملخص', 'telegram', 'طالب', null, 0, 0, 0, datetime('now'), datetime('now'), datetime('now'))`,
    [srcId, msgId, title, title, title, specId, moduleId]
  );
}
addItem(801, m1, "ملخص النحو والتطبيق", ensSrcId); // سنة أولى
addItem(802, m2, "ملخص الأدب الجاهلي", ensSrcId); // سنة ثانية

function itemRow(chatIdKey: number, msgId: number): Record<string, unknown> | null {
  const src = (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(chatIdKey)) as { id: number } | null);
  if (!src) return null;
  return (db.query("SELECT * FROM TelegramItem WHERE sourceId = ? AND tgMessageId = ?").get(src.id, msgId) as Record<string, unknown>) ?? null;
}

// ------------------------------------------------------------------- run!
async function main() {
  console.log("\n═══ A) مجموعة الفوج: نص/روابط تصل المساحة المشتركة (الإصلاح الجوهري) ═══");
  const owner = await login("مالك اختبار 67", "owner@test-r67.talib");
  const s1 = await login("طالبة سنة أولى", "s1@test-r67.talib");
  const s2 = await login("طالب سنة ثانية", "s2@test-r67.talib");
  const rep = await login("ممثل الفوج 67", "rep@test-r67.talib");

  // A1: ربط مجموعة بالفوج (المسار التقليدي)
  const a1 = await postSources(owner, { handle: `https://t.me/c/${GROUP_INTERNAL}`, sourceType: "group", cohortId });
  check("A1 ربط مجموعة فوج", a1.status === 200, `status=${a1.status} ${JSON.stringify(a1.data).slice(0, 150)}`);

  // A2: نص عادي (بلا موضوع — مجموعة عادية) → قبل r67: تجاهُل تام
  const a2 = await postWebhook(groupText(GROUP_CHAT, 501, "ملخصات دورة الأدب الجاهلي على هذا الرابط https://t.me/ens67/802"));
  check("A2 نص في مجموعة فوج يُستورد (كان يُتجاهَل)", a2.status === 200 && a2.data.status === "inserted", `status=${a2.data.status}`);
  const a2row = itemRow(GROUP_CHAT, 501);
  check("A2 الصف بفوج المساحة (cohort_id)", a2row != null && Number(a2row.cohortId) === cohortId, JSON.stringify(a2row?.cohortId));
  check("A2 النوع kind=text", a2row != null && a2row.kind === "text", String(a2row?.kind));

  // A3: صورة في المجموعة → تظل تُستورد (انحدار)
  const a3 = await postWebhook(tgUpdate({
    message: {
      message_id: 502, chat: { id: GROUP_CHAT, type: "supergroup", title: "مجموعة الفوج" },
      date: Math.floor(Date.now() / 1000), from: { id: 55, first_name: "طالب", is_bot: false },
      photo: [{ file_id: "f67a", file_unique_id: "u67a", width: 800, height: 600, file_size: 45678 }],
      caption: "امتحان الأدب الجاهلي محلول",
    },
  }));
  check("A3 صورة في مجموعة الفوج تُستورد", a3.status === 200 && a3.data.status === "inserted", `status=${a3.data.status}`);

  // A4: طالب الفوج يرى المنشورين في المساحة المشتركة
  const a4 = await getItems(s2, { mode: "shared" });
  const a4items = (a4.items ?? []) as Array<Record<string, unknown>>;
  check("A4 منتمي الفوج يرى النص والصورة", a4items.length === 2 && a4items.some((it) => it.kind === "text") && a4items.some((it) => it.kind === "image"), `n=${a4items.length}`);
  check("A4 myCohortId للمنتمي", Number(a4.myCohortId) === cohortId, String(a4.myCohortId));

  // A5: طالب خارج الفوج لا يرى شيئاً
  const a5 = await getItems(s1, { mode: "shared" });
  check("A5 غير المنتمي لا يرى المساحة", a5.myCohortId == null && ((a5.items ?? []) as unknown[]).length === 0, `myCohort=${a5.myCohortId}`);

  // A6: منشورات المساحة لا تتسرب للمكتبة
  const a6 = await getItems(s2, { mode: "library" });
  check("A6 المساحة لا تظهر في المكتبة", !((a6.items ?? []) as Array<Record<string, unknown>>).some((it) => it.kind === "text" && String(it.titleAr ?? "").includes("ملخصات دورة")), `n=${((a6.items ?? []) as unknown[]).length}`);

  console.log("\n═══ B) قناة مربوطة بمساحة فوج (طلب المالك: قناة Vogue) ═══");

  // B1: ربط قناة بفوج مباشرة — الإمكانية الجديدة r67
  const b1 = await postSources(owner, { handle: `https://t.me/c/${CHAN_INTERNAL}`, sourceType: "channel", cohortId, title: "قناة Vogue" });
  check("B1 ربط قناة بمساحة فوج", b1.status === 200, `status=${b1.status} ${JSON.stringify(b1.data).slice(0, 150)}`);

  // B2: المصدر يحمل الفوج ويظهر اسمه
  const b2 = await getSources(owner);
  const b2src = ((b2.data.sources ?? []) as Array<Record<string, unknown>>).find((s) => String(s.tgChannelId) === String(CHAN_CHAT));
  check("B2 المصدر cohortId صحيح", b2src != null && Number(b2src.cohortId) === cohortId, JSON.stringify(b2src?.cohortId));
  check("B2 cohortName معروض", b2src != null && String(b2src.cohortName ?? "") === "فوج الاختبار 67", String(b2src?.cohortName));

  // B3: منشور نصي غير دراسي في القناة → يستورد رغم بوابة المحتوى (مساحة فوج لا بوابة عليها)
  const b3 = await postWebhook(channelText(CHAN_CHAT, 601, "تنبيه: اجتماع الفوج مساء الجمعة في القاعة 4"));
  check("B3 نص غير دراسي يُستورد للمساحة", b3.status === 200 && b3.data.status === "inserted", `status=${b3.data.status}`);
  const b3row = itemRow(CHAN_CHAT, 601);
  check("B3 الصف بفوج المساحة", b3row != null && Number(b3row.cohortId) === cohortId, JSON.stringify(b3row?.cohortId));

  // B4: منتمي الفوج يرى منشور القناة
  const b4 = await getItems(s2, { mode: "shared" });
  const b4items = (b4.items ?? []) as Array<Record<string, unknown>>;
  check("B4 منتمي الفوج يرى منشور القناة", b4items.some((it) => String(it.titleAr ?? "").includes("تنبيه")), `n=${b4items.length}`);

  // B5: لا يظهر في مكتبة أحد (cohort_id ليس null)
  const b5 = await getItems(s1, { mode: "library" });
  const b5items = (b5.items ?? []) as Array<Record<string, unknown>>;
  check("B5 قناة المساحة لا تظهر في المكتبة", !b5items.some((it) => String(it.titleAr ?? "").includes("تنبيه")), `n=${b5items.length}`);

  console.log("\n═══ C) تحويل قناة مكتبة إلى مساحة فوج (زر التعديل) ═══");

  // C1: قناة مكتبة عادية بلا أي ربط
  const c1 = await postSources(owner, { handle: `https://t.me/c/${LIBCHAN_INTERNAL}`, sourceType: "channel", title: "قناة مكتبة" });
  check("C1 ربط قناة مكتبة عادية", c1.status === 200, `status=${c1.status}`);

  // C2: نص غير دراسي → بوابة المحتوى تمنعه (انحدار r65)
  const c2 = await postWebhook(channelText(LIBCHAN_CHAT, 701, "مرحبا بالجميع في قناتنا الجديدة"));
  check("C2 بوابة المحتوى تعمل للمكتبة (تجاهُل ممنوع)", c2.status === 200 && c2.data.status === "skipped", `status=${c2.data.status}`);

  // C3: تعديل الربط → فوج المساحة + تطبيق على المنشورات
  const libChanRow = ((await getSources(owner)).data.sources as Array<Record<string, unknown>>).find((s) => String(s.tgChannelId) === String(LIBCHAN_CHAT));
  const c3 = await patchSources(owner, { id: libChanRow?.id, cohortId, applyToItems: true });
  check("C3 التحويل إلى مساحة فوج", c3.status === 200, `status=${c3.status} ${JSON.stringify(c3.data).slice(0, 120)}`);

  // C4: بعد التحويل المنشور نفسه النمط يُستورد (البوابة لم تعد تسري)
  const c4 = await postWebhook(channelText(LIBCHAN_CHAT, 702, "تنبيه ثانٍ: موعد المراجعة تغيّر"));
  check("C4 بعد التحويل النص يُستورد", c4.status === 200 && c4.data.status === "inserted", `status=${c4.data.status}`);
  const c4row = itemRow(LIBCHAN_CHAT, 702);
  check("C4 الصف بفوج المساحة", c4row != null && Number(c4row.cohortId) === cohortId, JSON.stringify(c4row?.cohortId));

  console.log("\n═══ D) منتدى المكتبة: فلتر الدردشة كما هو (انحدار r63) ═══");

  // D1: نص عادي بلا موضوع في منتدى مكتبة (group بلا فوج) → تجاهُل (كما كان)
  const d1 = await postWebhook(groupText(ENS_CHAT, 803, "شكرا جزيلا على المجهود"));
  check("D1 نقاش العام في منتدى مكتبة يُتجاهَل", d1.status === 200 && d1.data.status === "ignored", `status=${d1.data.status}`);

  // D2: نص داخل موضوع + محتوى دراسي → يُستورد (كما كان)
  const d2 = await postWebhook(tgUpdate({
    message: {
      message_id: 804, chat: { id: ENS_CHAT, type: "supergroup", title: "منتدى ENS 67" },
      date: Math.floor(Date.now() / 1000), from: { id: 66, first_name: "طالب", is_bot: false },
      message_thread_id: 5, is_topic_message: true,
      text: "ملخص جديد في الأدب الجاهلي",
    },
  }));
  check("D2 محتوى دراسي داخل موضوع يُستورد", d2.status === 200 && d2.data.status === "inserted", `status=${d2.data.status}`);

  // D3: محتوى غير دراسي داخل موضوع → بوابة r65 تمنعه
  const d3 = await postWebhook(tgUpdate({
    message: {
      message_id: 805, chat: { id: ENS_CHAT, type: "supergroup", title: "منتدى ENS 67" },
      date: Math.floor(Date.now() / 1000), from: { id: 66, first_name: "طالب", is_bot: false },
      message_thread_id: 5, is_topic_message: true,
      text: "مبروك التخرج للدفعة السابقة",
    },
  }));
  check("D3 غير الدراسي داخل موضوع → بوابة", d3.status === 200 && d3.data.status === "skipped", `status=${d3.data.status}`);

  console.log("\n═══ E) عزل السنوات التلقائي (انحدار r66) ═══");

  // E1: طالبة السنة الأولى ترى مقياس سنتها فقط من منشورات المنتدى
  const e1 = await getItems(s1, { mode: "library" });
  const e1items = (e1.items ?? []) as Array<Record<string, unknown>>;
  check("E1 سنة أولى ترى النحو فقط", e1items.length === 1 && String(e1items[0]?.titleAr ?? "").includes("النحو"), `n=${e1items.length} [${e1items.map((i) => i.titleAr).join("،")}]`);
  check("E1 yearLock مقفلة على سنتها", e1.yearLock != null && Number(e1.yearLock.yearId) === y1, JSON.stringify(e1.yearLock));

  // E2: طالب الفوج (سنة ثانية من فوجه) يرى مقياس سنة ثانية فقط
  const e2 = await getItems(s2, { mode: "library" });
  const e2items = (e2.items ?? []) as Array<Record<string, unknown>>;
  check("E2 فوج السنة الثانية يرى مقاييس سنته فقط", e2items.length >= 1 && e2.yearLock != null && Number(e2.yearLock.yearId) === y2 && !e2items.some((it) => String(it.moduleName ?? "") === "النحو والتطبيق"), `n=${e2items.length} lock=${JSON.stringify(e2.yearLock)} mods=${e2items.map((i) => i.moduleName).join("،")}`);

  console.log("\n═══ F) الممثل: قناة بمساحة فوجه فقط ═══");

  // F1: الممثل يربط قناة بفوجه → مسموح (r67)
  const f1 = await postSources(rep, { handle: `https://t.me/c/${777000555}`, sourceType: "channel", cohortId });
  check("F1 ممثل يربط قناة بفوجه", f1.status === 200, `status=${f1.status} ${JSON.stringify(f1.data).slice(0, 120)}`);

  // F2: الممثل يربط قناة بفوج آخر → مرفوض
  const f2 = await postSources(rep, { handle: `https://t.me/c/${777000666}`, sourceType: "channel", cohortId: cohort2Id });
  check("F2 ممثل بفوج آخر → 403", f2.status === 403, `status=${f2.status}`);

  console.log("\n═══ G) تنظيف نصوص لوحة الإدارة (طلب المالك) ═══");
  console.log("  (تُفحص في chunks البناء مباشرة — انظر سكربت r67-check-ui.mjs)");

  // ---------------------------------------------------------------- summary
  console.log(`\n═════════ النتيجة: ${passed} ✅ / ${failed} ❌ ═════════`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("E2E CRASHED:", e);
  process.exit(1);
});
