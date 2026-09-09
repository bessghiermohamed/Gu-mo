/**
 * r68 e2e (local, production build) — الربط المتعدد + عزل الممح + الحذف الجماعي.
 *
 * Owner's requests under test:
 *  1) «القناة تُربط عدة مرات بقواعد مختلفة — تخصص محدد مع ملمح محدد»
 *     (specialty + track variations of the SAME channel → #N rows, one item
 *      copy per binding, each copy scoped by its binding's rules).
 *  2) «حذف المنشورات المصنّفة خطأ دفعة واحدة بدل واحدة واحدة» (bulk delete).
 *  3) Track (الملمح) isolation in the student library — auto like the year.
 *
 * Run: bun run build && TELEGRAM_BOT_TOKEN="" TELEGRAM_WEBHOOK_SECRET=local-r62-test-secret \
 *      npx next start -p 3121 & bun run scripts/r68-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://127.0.0.1:3121";
const ENV_SECRET = "local-r62-test-secret";

// معرّفات تيليجرام (سلبية بأسلوب القنوات الحقيقية)
const M_INTERNAL = 888000111;
const M_CHAT = -100888000111; // قناة الربط المتعدد
const T1_CHAT = -100888000222; // مصدر مربوط بملمح PEP
const T2_CHAT = -100888000333; // مصدر مربط بملمح PEM
const T3_CHAT = -100888000444; // مصدر بلا ملمح
const S_CHAT = -100888000555; // مصدر اختبار الحذف الجماعي
const G_INTERNAL = 888000666;
const G_CHAT = -100888000666; // مجموعة فوج (انحدار r67)

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
async function deleteItems(cookie: string, qs: string) {
  const res = await fetch(`${BASE}/api/telegram/items?${qs}`, { method: "DELETE", headers: { cookie } });
  return { status: res.status, data: await j(res) };
}
async function postSetup(cookie: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/telegram/setup`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await j(res) };
}

let updateSeq = 900_000;
function tgUpdate(msg: Record<string, unknown>): string {
  updateSeq += 1;
  return JSON.stringify({ update_id: updateSeq, ...msg });
}
function channelText(chatId: number, messageId: number, text: string): string {
  return tgUpdate({
    channel_post: {
      message_id: messageId, chat: { id: chatId, type: "channel", title: "قناة" },
      date: Math.floor(Date.now() / 1000), text,
    },
  });
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
db.run("DELETE FROM AppUser WHERE email LIKE '%@test-r68%'");
db.run("DELETE FROM TelegramSource WHERE tgChannelId LIKE '-100888000%'");
db.run("DELETE FROM ModuleCourse WHERE code IN ('R68-NHW', 'R68-JHL', 'R68-MAT')");
db.run("DELETE FROM CohortGroup WHERE groupName LIKE 'فوج 68%'");
db.run("DELETE FROM AcademicTrack WHERE code IN ('R68-PEP', 'R68-PEM')");
db.run("DELETE FROM AcademicYear WHERE yearName IN ('السنة الأولى 68', 'السنة الثانية 68')");
db.run("DELETE FROM Specialty WHERE code IN ('R68-LIT', 'R68-SCI')");

const inst = (db.query("SELECT id FROM Institution LIMIT 1").get() as { id: number } | null) ?? null;
let instId: number;
if (inst) instId = inst.id;
else {
  db.run(`INSERT INTO Institution (nameAr, type, city, createdAt, updatedAt) VALUES ('مؤسسة اختبار 68', 'مدرسة عليا', 'الجزائر', datetime('now'), datetime('now'))`);
  instId = (db.query("SELECT id FROM Institution ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
}
// تخصصان: A (آداب — للربط المتعدد والملامح) و B (علوم — لاختيار المالك)
db.run(`INSERT INTO Specialty (institutionId, nameAr, code, iconName, description, institution, faculty, createdAt, updatedAt) VALUES (?, 'اللغة والأدب العربي 68', 'R68-LIT', 'book', 'اختبار r68', 'مؤسسة اختبار 68', 'قسم الاختبار', datetime('now'), datetime('now'))`, [instId]);
db.run(`INSERT INTO Specialty (institutionId, nameAr, code, iconName, description, institution, faculty, createdAt, updatedAt) VALUES (?, 'الرياضيات 68', 'R68-SCI', 'sigma', 'اختبار r68', 'مؤسسة اختبار 68', 'قسم الاختبار', datetime('now'), datetime('now'))`, [instId]);
const specA = (db.query("SELECT id FROM Specialty WHERE code = 'R68-LIT'").get() as { id: number }).id;
const specB = (db.query("SELECT id FROM Specialty WHERE code = 'R68-SCI'").get() as { id: number }).id;

db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الأولى 68', 1, datetime('now'), datetime('now'))`, [specA]);
db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الثانية 68', 1, datetime('now'), datetime('now'))`, [specA]);
db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'سنة الرياضيات 68', 1, datetime('now'), datetime('now'))`, [specB]);
const y1 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الأولى 68'").get() as { id: number }).id;
const y2 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الثانية 68'").get() as { id: number }).id;
const by1 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'سنة الرياضيات 68'").get() as { id: number }).id;

db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (?, ?, 1, 'النحو والتطبيق', 'R68-NHW', datetime('now'), datetime('now'))`, [specA, y1]);
db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (?, ?, 2, 'الأدب الجاهلي', 'R68-JHL', datetime('now'), datetime('now'))`, [specA, y2]);
db.run(`INSERT INTO ModuleCourse (specialtyId, academicYearId, semester, name, code, createdAt, updatedAt) VALUES (?, ?, 1, 'التحليل الرياضي', 'R68-MAT', datetime('now'), datetime('now'))`, [specB, by1]);
const m1 = (db.query("SELECT id FROM ModuleCourse WHERE code = 'R68-NHW'").get() as { id: number }).id;
const m2 = (db.query("SELECT id FROM ModuleCourse WHERE code = 'R68-JHL'").get() as { id: number }).id;
const bm1 = (db.query("SELECT id FROM ModuleCourse WHERE code = 'R68-MAT'").get() as { id: number }).id;

// ملامح التخصص A: PEP و PEM
db.run(`INSERT INTO AcademicTrack (specialtyId, trackNameAr, code, createdAt, updatedAt) VALUES (?, 'ملمح PEP اختبار', 'R68-PEP', datetime('now'), datetime('now'))`, [specA]);
db.run(`INSERT INTO AcademicTrack (specialtyId, trackNameAr, code, createdAt, updatedAt) VALUES (?, 'ملمح PEM اختبار', 'R68-PEM', datetime('now'), datetime('now'))`, [specA]);
const trPep = (db.query("SELECT id FROM AcademicTrack WHERE code = 'R68-PEP'").get() as { id: number }).id;
const trPem = (db.query("SELECT id FROM AcademicTrack WHERE code = 'R68-PEM'").get() as { id: number }).id;

function addUser(fullName: string, email: string, role: string, scopeYear: number | null, scopeTrack: number | null, scopeCohort: number | null): number {
  db.run(
    `INSERT INTO AppUser (fullName, email, studentId, passwordHash, specialtyName, yearName, groupNumber, role, representativeScope, assignedSpecialtyId, scopeAcademicYearId, scopeTrackId, scopeCohortGroupId, createdAt, updatedAt)
     VALUES (?, ?, ?, '', 'الأدب العربي', 'سنة اختبار', '01', ?, 'سنة كاملة', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [fullName, email, email.split("@")[0], role, specA, scopeYear, scopeTrack, scopeCohort]
  );
  return (db.query("SELECT id FROM AppUser WHERE email = ?").get(email) as { id: number }).id;
}

// فوج بملمح PEP وسنة أولى (لاختبار اشتقاق الممح من الفوج)
db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, trackId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, ?, 'فوج 68 PEP', '', datetime('now'), datetime('now'))`, [specA, y1, trPep]);
const cohortPep = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج 68 PEP'").get() as { id: number }).id;

const ownerId = addUser("مالك اختبار 68", "owner@test-r68.talib", "OWNER", null, null, null);
const adminBId = addUser("مشرف علوم 68", "adminb@test-r68.talib", "SPECIALTY_ADMIN", null, null, null);
db.run(`UPDATE AppUser SET assignedSpecialtyId = ? WHERE id = ?`, [specB, adminBId]); // مشرف التخصص B
const sPepId = addUser("طالبة PEP", "spep@test-r68.talib", "STUDENT", null, trPep, null);
const sPemId = addUser("طالب PEM", "spem@test-r68.talib", "STUDENT", null, trPem, null);
const sNoId = addUser("طالب بلا ملمح", "sno@test-r68.talib", "STUDENT", null, null, null);
const sCohId = addUser("طالب فوج PEP", "scoh@test-r68.talib", "STUDENT", null, null, null);
db.run(`INSERT INTO JoinRequest (cohortId, requesterId, status, message, createdAt, reviewedAt) VALUES (?, ?, 'approved', 'انضمام 68', datetime('now'), datetime('now'))`, [cohortPep, sCohId]);
const sY1Id = addUser("طالبة سنة أولى", "sy1@test-r68.talib", "STUDENT", y1, null, null);
const sBId = addUser("طالب رياضيات", "sb@test-r68.talib", "STUDENT", by1, null, null);
db.run(`UPDATE AppUser SET assignedSpecialtyId = ? WHERE id = ?`, [specB, sBId]);

// ثلاثة مصادر ملامح (نفس المقياس m1 — الممح هو الفارق الوحيد)
function addSource(chatId: number, title: string, trackId: number | null, moduleId: number | null): number {
  db.run(
    `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, trackId, moduleId, isActive, lastUpdateId, createdAt, updatedAt)
     VALUES (?, '', ?, 'channel', 'private', ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`,
    [String(chatId), title, specA, trackId, moduleId]
  );
  return (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(String(chatId)) as { id: number }).id;
}
const t1 = addSource(T1_CHAT, "قناة PEP", trPep, m1);
const t2 = addSource(T2_CHAT, "قناة PEM", trPem, m1);
const t3 = addSource(T3_CHAT, "قناة عامة", null, m1);

function addItem(srcId: number, msgId: number, moduleId: number, title: string, spec: number): void {
  db.run(
    `INSERT INTO TelegramItem (sourceId, tgMessageId, mediaGroupId, kind, titleAr, captionText, searchText, fileName, mimeType, fileId, fileUniqueId, sizeBytes, link, specialtyId, moduleId, itemType, origin, postedBy, cohortId, isHidden, isFeatured, aiClassified, postedAt, createdAt, updatedAt)
     VALUES (?, ?, '', 'pdf', ?, ?, ?, 'ملخص.pdf', 'application/pdf', '', '', 0, 'https://t.me/x/${msgId}', ?, ?, 'ملخص', 'telegram', 'طالب', null, 0, 0, 0, datetime('now'), datetime('now'), datetime('now'))`,
    [srcId, msgId, title, title, title, spec, moduleId]
  );
}
addItem(t1, 901, m1, "ملخص PEP للنحو", specA);
addItem(t2, 902, m1, "ملخص PEM للنحو", specA);
addItem(t3, 903, m1, "ملخص عام للنحو", specA);
addItem(t3, 912, m2, "ملخص عام للأدب الجاهلي", specA); // سنة ثانية — انحدار عزل السنوات

// مصدر الحذف الجماعي: 6 منشورات
const sSrc = addSource(S_CHAT, "قناة التنقيح", null, m1);
for (let i = 0; i < 6; i++) addItem(sSrc, 950 + i, m1, `منشور تنقيح ${i + 1}`, specA);

function srcRow(chatIdKey: string): Record<string, unknown> | null {
  return (db.query("SELECT * FROM TelegramSource WHERE tgChannelId = ?").get(chatIdKey) as Record<string, unknown>) ?? null;
}
function itemsForMsg(msgId: number): Array<Record<string, unknown>> {
  return (db.query("SELECT * FROM TelegramItem WHERE tgMessageId = ?").all(msgId) as Array<Record<string, unknown>>);
}

// ------------------------------------------------------------------- run!
async function main() {
  console.log("\n═══ A) الربط المتعدد: نفس القناة بقواعد مختلفة (#N) ═══");
  const owner = await login("مالك اختبار 68", "owner@test-r68.talib");
  const adminB = await login("مشرف علوم 68", "adminb@test-r68.talib");
  const sPep = await login("طالبة PEP", "spep@test-r68.talib");
  const sPem = await login("طالب PEM", "spem@test-r68.talib");
  const sNo = await login("طالب بلا ملمح", "sno@test-r68.talib");
  const sCoh = await login("طالب فوج PEP", "scoh@test-r68.talib");
  const sY1 = await login("طالبة سنة أولى", "sy1@test-r68.talib");
  const sB = await login("طالب رياضيات", "sb@test-r68.talib");

  // A1: الربط الأول — صف أساسي بلا لاحقة
  const a1 = await postSources(owner, { handle: `https://t.me/c/${M_INTERNAL}`, sourceType: "channel", title: "قناة متعددة" });
  check("A1 الربط الأول (أساسي)", a1.status === 200, `status=${a1.status} ${JSON.stringify(a1.data).slice(0, 140)}`);
  check("A1 linkedVariations=1", Number(a1.data.linkedVariations ?? 1) === 1, JSON.stringify(a1.data.linkedVariations));

  // A2: نفس القواعد تماماً → 409
  const a2 = await postSources(owner, { handle: `https://t.me/c/${M_INTERNAL}`, sourceType: "channel", title: "قناة متعددة" });
  check("A2 تكرار نفس القواعد مرفوض (409)", a2.status === 409, `status=${a2.status}`);

  // A3: نفس القناة + مقياس مختلف → تنويعة #2
  const a3 = await postSources(owner, { handle: `https://t.me/c/${M_INTERNAL}`, sourceType: "channel", title: "قناة متعددة", moduleId: m2 });
  check("A3 ربط ثانٍ بمقياس مختلف", a3.status === 200, `status=${a3.status} ${JSON.stringify(a3.data).slice(0, 140)}`);
  const a3row = srcRow(`${M_CHAT}#2`);
  check("A3 الصف بلواحق #2", a3row != null && Number(a3row.moduleId) === m2, JSON.stringify(a3row?.tgChannelId));
  check("A3 linkedVariations=2", Number(a3.data.linkedVariations ?? 0) === 2, JSON.stringify(a3.data.linkedVariations));

  // A4: ربط ثالث بممح PEP
  const a4 = await postSources(owner, { handle: `https://t.me/c/${M_INTERNAL}`, sourceType: "channel", title: "قناة متعددة", trackId: trPep });
  check("A4 ربط ثالث بملمح PEP", a4.status === 200, `status=${a4.status}`);
  const a4row = srcRow(`${M_CHAT}#3`);
  check("A4 الصف #3 بممح PEP", a4row != null && Number(a4row.trackId) === trPep, JSON.stringify(a4row?.tgChannelId));

  // A5: مملح لا يتبع التخصص → 400
  const a5 = await postSources(owner, { handle: `https://t.me/c/${M_INTERNAL}`, sourceType: "channel", trackId: trPep, specialtyId: specB });
  check("A5 ملمح خارج التخصص مرفوض (400)", a5.status === 400, `status=${a5.status}`);

  // A6: المالك يربط القناة لتخصص آخر (تنويعة #4)
  const a6 = await postSources(owner, { handle: `https://t.me/c/${M_INTERNAL}`, sourceType: "channel", title: "قناة متعددة", specialtyId: specB, moduleId: bm1 });
  check("A6 المالك يربط لتخصص آخر", a6.status === 200, `status=${a6.status} ${JSON.stringify(a6.data).slice(0, 140)}`);
  const a6row = srcRow(`${M_CHAT}#4`);
  check("A6 الصف #4 بتخصص B", a6row != null && Number(a6row.specialtyId) === specB, JSON.stringify(a6row?.tgChannelId));

  // A7: مشرف تخصص B لا يستطيع اختيار تخصص (403)
  const a7 = await postSources(adminB, { handle: `https://t.me/c/${G_INTERNAL}`, sourceType: "channel", specialtyId: specA });
  check("A7 اختيار تخصص للمالك فقط (403)", a7.status === 403, `status=${a7.status}`);

  // A8: القائمة — 4 روابط، الشارات، linkCount
  const a8 = await getSources(owner);
  const a8rows = ((a8.data.sources ?? []) as Array<Record<string, unknown>>).filter((s) => String(s.tgChannelId).startsWith(String(M_CHAT)));
  check("A8 أربعة صفوف للقناة", a8rows.length === 4, `n=${a8rows.length}`);
  check("A8 linkCount=4 للكل", a8rows.every((s) => Number(s.linkCount ?? 1) === 4), JSON.stringify(a8rows.map((s) => s.linkCount)));
  const a8t = a8rows.find((s) => String(s.tgChannelId) === `${M_CHAT}#3`);
  check("A8 trackName badge", a8t != null && String(a8t.trackName ?? "") === "ملمح PEP اختبار", String(a8t?.trackName));
  const a8s = a8rows.find((s) => String(s.tgChannelId) === `${M_CHAT}#4`);
  check("A8 specialtyName badge", a8s != null && String(a8s.specialtyName ?? "") === "الرياضيات 68", String(a8s?.specialtyName));

  // A9: منشور واحد → نسخة لكل ربط (4 صفوف بقواعد ربطها)
  const MSG = 990;
  const a9 = await postWebhook(channelText(M_CHAT, MSG, "ملخص النحو والتطبيق رقم 5 — دورة كاملة"));
  check("A9 استيراد منشور واحد", a9.status === 200 && a9.data.status === "inserted", `status=${a9.data.status}`);
  const a9rows = itemsForMsg(MSG);
  check("A9 نسخة لكل ربط (4 صفوف)", a9rows.length === 4, `n=${a9rows.length}`);
  const a9mods = a9rows.map((r) => Number(r.moduleId)).sort();
  check("A9 قواعد كل ربط تُطبَّق (m1,m1,m2,bm1)", a9mods.join(",") === [bm1, m1, m1, m2].sort().join(","), a9mods.join(","));
  const a9specs = new Set(a9rows.map((r) => Number(r.specialtyId)));
  check("A9 نسخة بتخصص B موجودة", a9specs.has(specB), JSON.stringify([...a9specs]));
  const a9trackRow = a9rows.find((r) => Number(r.sourceId) === Number(a4row?.id));
  check("A9 نسخة الربط المملحي من مصدر #3", a9trackRow != null && Number(a9trackRow.moduleId) === m1, JSON.stringify(a9trackRow?.moduleId));
  // روابط t.me خالية من لواحق #N (إصلاح الخلل الكامن r66)
  check("A9 الروابط تجرد لواحق #N", a9rows.every((r) => !String(r.link).includes("#")), JSON.stringify(a9rows.map((r) => r.link)));

  // A10: طالب تخصص B يرى نسخته فقط (عزل التخصص من الربط)
  const a10 = await getItems(sB, { mode: "library" });
  const a10items = (a10.items ?? []) as Array<Record<string, unknown>>;
  check("A10 طالب B يرى نسخة تخصصه", a10items.length === 1 && Number(a10items[0].moduleId) === bm1 && String(a10items[0].titleAr).includes("النحو والتطبيق"), `n=${a10items.length} mod=${a10items[0]?.moduleId}`);
  check("A10 لا يرى نسخ تخصص A", !a10items.some((it) => Number(it.moduleId) === m1 || Number(it.moduleId) === m2), `n=${a10items.length}`);

  // A11: رابط قسم تحت قناة مربوطة مرات عدة → يُضاف للربط الأساسي (r66)
  const a11 = await postSources(owner, { handle: `https://t.me/c/${M_INTERNAL}/77`, sourceType: "channel", title: "قسم التجارب", yearId: y1 });
  check("A11 قسم تحت القناة متعددة الروابط", a11.status === 200 && a11.data.topicAdded === true, `status=${a11.status} ${JSON.stringify(a11.data).slice(0, 140)}`);
  const a11topic = (db.query("SELECT * FROM TelegramTopic WHERE tgThreadId = 77").get() as Record<string, unknown> | null);
  check("A11 القسم تحت الربط الأساسي", a11topic != null && Number(a11topic.sourceId) === Number(srcRow(String(M_CHAT))?.id), JSON.stringify(a11topic?.sourceId));

  console.log("\n═══ B) عزل الممح في المكتبة (تلقائي كالسنة) ═══");

  // B1: طالبة PEP — ترى مصدر PEP والعام، لا PEM؛ trackLock بالاسم
  const b1 = await getItems(sPep, { mode: "library" });
  const b1items = (b1.items ?? []) as Array<Record<string, unknown>>;
  check("B1 PEP ترى منشور PEP", b1items.some((it) => String(it.titleAr).includes("ملخص PEP للنحو")), `n=${b1items.length}`);
  check("B1 PEP لا ترى منشور PEM", !b1items.some((it) => String(it.titleAr).includes("PEM")), `n=${b1items.length}`);
  check("B1 PEP ترى العام (بلا ملمح)", b1items.some((it) => String(it.titleAr).includes("ملخص عام للنحو")), `n=${b1items.length}`);
  check("B1 trackLock بالاسم", b1.trackLock != null && Number((b1.trackLock as Record<string, unknown>).trackId) === trPep && String((b1.trackLock as Record<string, unknown>).trackName) === "ملمح PEP اختبار", JSON.stringify(b1.trackLock));

  // B2: طالب PEM — العكس
  const b2 = await getItems(sPem, { mode: "library" });
  const b2items = (b2.items ?? []) as Array<Record<string, unknown>>;
  check("B2 PEM يرى منشور PEM", b2items.some((it) => String(it.titleAr).includes("PEM")), `n=${b2items.length}`);
  check("B2 PEM لا يرى منشور PEP", !b2items.some((it) => String(it.titleAr).includes("ملخص PEP")), `n=${b2items.length}`);

  // B3: بلا ملمح — العام فقط
  const b3 = await getItems(sNo, { mode: "library" });
  const b3items = (b3.items ?? []) as Array<Record<string, unknown>>;
  check("B3 بلا ملمح: العام فقط", b3items.every((it) => !String(it.titleAr).includes("PEP") && !String(it.titleAr).includes("PEM")) && b3items.some((it) => String(it.titleAr).includes("ملخص عام للنحو")), `n=${b3items.length}`);

  // B4: الممح من الفوج (بلا نطاق صريح) — طالب فوج PEP
  const b4 = await getItems(sCoh, { mode: "library" });
  const b4items = (b4.items ?? []) as Array<Record<string, unknown>>;
  check("B4 ممح الفوج يُشتق تلقائياً", b4.trackLock != null && Number((b4.trackLock as Record<string, unknown>).trackId) === trPep, JSON.stringify(b4.trackLock));
  check("B4 يرى PEP لا PEM", b4items.some((it) => String(it.titleAr).includes("ملخص PEP")) && !b4items.some((it) => String(it.titleAr).includes("ملخص PEM")), `n=${b4items.length}`);

  // B5: المالك بلا قفل ممح
  const b5 = await getItems(owner, { mode: "library", yearId: String(y1) });
  check("B5 المالك بلا trackLock", b5.trackLock == null, JSON.stringify(b5.trackLock));
  const b5items = (b5.items ?? []) as Array<Record<string, unknown>>;
  check("B5 المالك يرى كل الملامح", b5items.some((it) => String(it.titleAr).includes("ملخص PEP")) && b5items.some((it) => String(it.titleAr).includes("ملخص PEM")), `n=${b5items.length}`);

  // B6: PATCH الممح — تحويل قاعدة الربط
  const b6 = await patchSources(owner, { id: t3, trackId: trPem });
  check("B6 تعديل ممح المصدر", b6.status === 200, `status=${b6.status} ${JSON.stringify(b6.data).slice(0, 100)}`);
  const b6b = await getItems(sPep, { mode: "library" });
  check("B6 PEP فقدت رؤية المصدر المحوَّل", !((b6b.items ?? []) as Array<Record<string, unknown>>).some((it) => String(it.titleAr).includes("ملخص عام للنحو")), `n=${((b6b.items ?? []) as unknown[]).length}`);
  const b6c = await patchSources(owner, { id: t3, trackId: null });
  check("B6 إعادة المسح (بلا ملمح)", b6c.status === 200, `status=${b6c.status}`);

  console.log("\n═══ C) الحذف الجماعي للمنشورات ═══");

  // C1: المشهد الإداري يعرض الستة
  const c1 = await getItems(owner, { mode: "admin", sourceId: String(sSrc) });
  const c1items = (c1.items ?? []) as Array<Record<string, unknown>>;
  check("C1 وضع التنقيح يعرض المنشورات", c1items.length === 6, `n=${c1items.length}`);
  const c1ids = c1items.map((it) => Number(it.id)).slice(0, 3);

  // C2: حذف 3 دفعة واحدة
  const c2 = await deleteItems(owner, `ids=${c1ids.join(",")}`);
  check("C2 حذف جماعي 3 منشورات", c2.status === 200 && Number(c2.data.deleted) === 3, `status=${c2.status} ${JSON.stringify(c2.data).slice(0, 120)}`);

  // C3: بقيت 3
  const c3 = await getItems(owner, { mode: "admin", sourceId: String(sSrc) });
  check("C3 بقيت 3 فقط", ((c3.items ?? []) as unknown[]).length === 3, `n=${((c3.items ?? []) as unknown[]).length}`);

  // C4: طالب → 403
  const c4 = await deleteItems(sNo, `ids=${c1ids.join(",")}`);
  check("C4 الحذف الجماعي للمشرفين فقط (403)", c4.status === 403, `status=${c4.status}`);

  // C5: ids غير صالحة → 400
  const c5 = await deleteItems(owner, "ids=abc,xyz");
  check("C5 ids غير صالحة (400)", c5.status === 400, `status=${c5.status}`);

  // C6: معرّفات غير موجودة → 403 (لا شيء ضمن النطاق)
  const c6 = await deleteItems(owner, "ids=999999");
  check("C6 لا منشورات ضمن النطاق (403)", c6.status === 403, `status=${c6.status}`);

  // C7: تكرارات المعرفات تتسامح
  const c7ids = (c3.items ?? []) as Array<Record<string, unknown>>;
  const c7 = await deleteItems(owner, `ids=${c7ids[0].id},${c7ids[0].id},${c7ids[0].id}`);
  check("C7 التكرارات تُحذف مرة واحدة", c7.status === 200 && Number(c7.data.deleted) === 1, JSON.stringify(c7.data));

  // C8: الحذف المفرد القديم يعمل (انحدار)
  const c8left = (c3.items ?? []) as Array<Record<string, unknown>>;
  const c8 = await deleteItems(owner, `id=${c8left[1].id}`);
  check("C8 الحذف المفرد (انحدار)", c8.status === 200 && c8.data.ok === true, `status=${c8.status}`);

  console.log("\n═══ D) فحص الاستيراد: المحاكاة متعددة الروابط تنظّف كل النسخ ═══");

  // D1: محاكاة على صف تنويعة (#3) — chat.id الأساسي يصل كل الروابط
  const d1 = await postSetup(owner, { action: "simulate", sourceId: Number(a4row?.id), text: "ملخص النحو والتطبيق — محاكاة 68" });
  check("D1 المحاكاة على تنويعة تعمل", d1.status === 200 && d1.data.ok === true, `status=${d1.status} ${JSON.stringify(d1.data).slice(0, 160)}`);

  // D2: نظافة تامة — لا بقايا لأي نسخة
  const d2msg = (db.query("SELECT tgMessageId FROM TelegramItem WHERE titleAr LIKE '%محاكاة 68%' LIMIT 1").get() as { tgMessageId: number } | null);
  if (d2msg) {
    const leftovers = itemsForMsg(d2msg.tgMessageId);
    check("D2 لا بقايا نسخ المحاكاة", leftovers.length === 0, `n=${leftovers.length}`);
  } else {
    check("D2 لا بقايا نسخ المحاكاة", true, "(لا صفوف أصلاً — نظيف)");
  }

  console.log("\n═══ E) انحدارات الجولات السابقة ═══");

  // E1: r67 — نص في مجموعة فوج يُستورد للمساحة
  const e1a = await postSources(owner, { handle: `https://t.me/c/${G_INTERNAL}`, sourceType: "group", cohortId: cohortPep });
  check("E1 ربط مجموعة فوج", e1a.status === 200, `status=${e1a.status}`);
  const e1 = await postWebhook(groupText(G_CHAT, 700, "تذكير: محاضرة النحو غداً في القاعة 3"));
  check("E1 r67 نص المجموعة يُستورد", e1.status === 200 && e1.data.status === "inserted", `status=${e1.data.status}`);
  const e1row = (db.query("SELECT * FROM TelegramItem WHERE tgMessageId = 700").get() as Record<string, unknown> | null);
  check("E1 بفوج المساحة", e1row != null && Number(e1row.cohortId) === cohortPep, JSON.stringify(e1row?.cohortId));

  // E2: r66 — عزل السنوات (طالبة سنة أولى لا ترى ملخص السنة الثانية)
  const e2 = await getItems(sY1, { mode: "library" });
  const e2items = (e2.items ?? []) as Array<Record<string, unknown>>;
  check("E2 r66 عزل السنوات", !e2items.some((it) => String(it.titleAr).includes("ملخص عام للأدب")) && e2items.some((it) => String(it.titleAr).includes("ملخص عام للنحو")), `n=${e2items.length}`);
  check("E2 yearLock حاضر", e2.yearLock != null, JSON.stringify(e2.yearLock));

  // ------------------------------------------------------------------ result
  console.log(`\n══════════ النتيجة: ${passed} ✅ / ${failed} ❌ ══════════`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("E2E CRASH:", e);
  process.exit(1);
});
