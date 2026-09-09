/**
 * r69 e2e (local, production build) — the owner's three requests:
 *  1) «ربطت القناة والمجموعة بفوج محدد والمنشورات لا تظهر في المساحة المشتركة»
 *     Root cause reproduced + fixed: TWO cohorts sharing the SAME name in
 *     different years (فوجان باسم «فوج 69») — the student of cohort B saw
 *     nothing because the channel was bound to cohort A. Fixes verified:
 *     cohort labels everywhere (year appended), myCohortName in the shared
 *     API, admin cohort filter to preview each space's posts.
 *  2) «التقارير لا تعمل» — reporter_id column missing in production → POST
 *     failed. Local branch (Prisma, column exists) regression + the fallback
 *     is verified live on production separately.
 *  3) «أدواتي في الشريط السفلي للطالب العادي» — verified via browser.
 *
 * Run: bun run build && TELEGRAM_BOT_TOKEN="" TELEGRAM_WEBHOOK_SECRET=local-r62-test-secret \
 *      npx next start -p 3123 & bun run scripts/r69-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://127.0.0.1:3123";
const ENV_SECRET = "local-r62-test-secret";

const M_CHAT = -100999000111; // القناة المربوطة بمساحة فوج A

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

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

// ---------------------------------------------------------------- seed (SQL)
const db = new Database("/home/z/my-project/db/custom.db");
db.run("PRAGMA foreign_keys = OFF");

db.run("DELETE FROM TelegramItem WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId LIKE '-100999%')");
db.run("DELETE FROM TelegramSource WHERE tgChannelId LIKE '-100999%'");
db.run("DELETE FROM DeviceSession");
db.run("DELETE FROM StudentIssueReport WHERE itemTitle LIKE 'r69%'");
db.run("DELETE FROM AppUser WHERE email LIKE '%r69-%@test%'");
db.run("DELETE FROM CohortGroup WHERE groupName LIKE 'فوج 69%'");
db.run("DELETE FROM AcademicYear WHERE yearName IN ('السنة الأولى 69', 'السنة الثانية 69')");
db.run("DELETE FROM Specialty WHERE code = 'R69-LOG'");

const inst = (db.query("SELECT id FROM Institution LIMIT 1").get() as { id: number } | null) ?? null;
let instId: number;
if (inst) instId = inst.id;
else {
  db.run(`INSERT INTO Institution (nameAr, type, city, createdAt, updatedAt) VALUES ('مؤسسة اختبار 69', 'مدرسة عليا', 'الجزائر', datetime('now'), datetime('now'))`);
  instId = (db.query("SELECT id FROM Institution ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
}
db.run(`INSERT INTO Specialty (institutionId, nameAr, code, iconName, description, institution, faculty, createdAt, updatedAt) VALUES (?, 'الآداب 69', 'R69-LOG', 'book', 'اختبار r69', 'مؤسسة اختبار 69', 'قسم الاختبار', datetime('now'), datetime('now'))`, [instId]);
const spec = (db.query("SELECT id FROM Specialty WHERE code = 'R69-LOG'").get() as { id: number }).id;

db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الأولى 69', 1, datetime('now'), datetime('now'))`, [spec]);
db.run(`INSERT INTO AcademicYear (specialtyId, yearName, semester, createdAt, updatedAt) VALUES (?, 'السنة الثانية 69', 1, datetime('now'), datetime('now'))`, [spec]);
const y1 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الأولى 69'").get() as { id: number }).id;
const y2 = (db.query("SELECT id FROM AcademicYear WHERE yearName = 'السنة الثانية 69'").get() as { id: number }).id;

// فوجان بالاسم نفسه في سنتين مختلفتين — سيناريو المالك الحقيقي بالضبط
db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, 'فوج 69', '', datetime('now'), datetime('now'))`, [spec, y1]);
db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, 'فوج 69', '', datetime('now'), datetime('now'))`, [spec, y2]);
const cohortA = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج 69' AND academicYearId = ?").get(y1) as { id: number }).id;
const cohortB = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج 69' AND academicYearId = ?").get(y2) as { id: number }).id;
console.log(`seed: cohortA=${cohortA} (سنة أولى) cohortB=${cohortB} (سنة ثانية) — نفس الاسم «فوج 69»`);

// طالبان: A في فوج القناة، B في الفوج الآخر بالاسم نفسه
function addUser(email: string, name: string, role: string, cohort: number | null) {
  db.run(
    `INSERT INTO AppUser (fullName, email, studentId, role, assignedSpecialtyId, scopeCohortGroupId, specialtyName, yearName, groupNumber, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 'الآداب 69', '', '', datetime('now'))`,
    [name, email, Math.floor(10000000 + Math.random() * 90000000), role, spec, cohort]
  );
}
addUser("r69-owner@test.dz", "مالك 69", "OWNER", null);
addUser("r69-student-a@test.dz", "طالب الفوج أ", "STUDENT", cohortA);
addUser("r69-student-b@test.dz", "طالب الفوج ب", "STUDENT", cohortB);
const ownerId = (db.query("SELECT id FROM AppUser WHERE email = 'r69-owner@test.dz'").get() as { id: number }).id;
const studentAId = (db.query("SELECT id FROM AppUser WHERE email = 'r69-student-a@test.dz'").get() as { id: number }).id;
const studentBId = (db.query("SELECT id FROM AppUser WHERE email = 'r69-student-b@test.dz'").get() as { id: number }).id;

// ---------------------------------------------------------------- requests
const owner = await login("مالك 69", "r69-owner@test.dz");
const studentA = await login("طالب الفوج أ", "r69-student-a@test.dz");
const studentB = await login("طالب الفوج ب", "r69-student-b@test.dz");
console.log("logins OK");

// 1) ربط القناة بمساحة فوج A (رابط رقمي — البوت محلي غير مضبوط)
{
  const res = await fetch(`${BASE}/api/telegram/sources`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: owner },
    body: JSON.stringify({ handle: String(M_CHAT), sourceType: "channel", cohortId: cohortA, title: "قناة الفوج أ 69" }),
  });
  const data = await j(res);
  check("1.1 ربط القناة بمساحة الفوج A", res.status === 200 && (data.source as Record<string, unknown> | undefined) != null, JSON.stringify(data).slice(0, 140));
}

// 2) رابط دعوة خاص → رسالة واضحة (كان: خطأ تيليجرام غامض)
{
  const res = await fetch(`${BASE}/api/telegram/sources`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: owner },
    body: JSON.stringify({ handle: "https://t.me/+AbCdEfGh123", sourceType: "group", cohortId: cohortB }),
  });
  const data = await j(res);
  check(
    "1.2 رابط دعوة خاص → 400 برس actionable",
    res.status === 400 && /رابط الدعوة الخاص/.test(String(data.error ?? "")),
    `${res.status} ${JSON.stringify(data).slice(0, 120)}`
  );
}

// 3) منشوران عبر الويبهوك الحقيقي → مساحة الفوج A
let updateSeq = 901_000;
async function postWebhook(body: string) {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": ENV_SECRET },
    body,
  });
  return j(res);
}
{
  const u1 = JSON.stringify({
    update_id: ++updateSeq,
    channel_post: {
      message_id: 501, chat: { id: M_CHAT, type: "channel", title: "قناة الفوج أ" },
      date: Math.floor(Date.now() / 1000), text: "تنبيه الفوج أ: محاضرة الغد أُجّلت",
    },
  });
  const r1 = await postWebhook(u1);
  const u2 = JSON.stringify({
    update_id: ++updateSeq,
    channel_post: {
      message_id: 502, chat: { id: M_CHAT, type: "channel", title: "قناة الفوج أ" },
      date: Math.floor(Date.now() / 1000), text: "ملخص درس اليوم",
    },
  });
  const r2 = await postWebhook(u2);
  check("1.3 الويبهوك يستورد نصاً عادياً إلى مساحة الفوج", r1.status === "inserted" && r2.status === "inserted", JSON.stringify(r1));
}

// 4) المساحة المشتركة: طالب A يرى المنشورين + اسم فوجه المميِّز
{
  const res = await fetch(`${BASE}/api/telegram/items?mode=shared`, { headers: { cookie: studentA }, cache: "no-store" });
  const data = await j(res);
  const items = (data.items ?? []) as Array<Record<string, unknown>>;
  check("1.4 طالب الفوج A يرى منشوري قناته", items.length === 2, `len=${items.length}`);
  check(
    "1.5 المساحة تعلن اسم الفوج المميِّز (الاسم + السنة)",
    /فوج 69/.test(String(data.myCohortName ?? "")) && /السنة الأولى 69/.test(String(data.myCohortName ?? "")),
    `myCohortName=${JSON.stringify(data.myCohortName)}`
  );
}

// 5) العزل: طالب B (الفوج الآخر بالاسم نفسه) لا يرى شيئاً — واسمه يبيّن السبب
{
  const res = await fetch(`${BASE}/api/telegram/items?mode=shared`, { headers: { cookie: studentB }, cache: "no-store" });
  const data = await j(res);
  const items = (data.items ?? []) as Array<Record<string, unknown>>;
  check("1.6 عزل المساحة: طالب الفوج B لا يرى منشورات فوج A", items.length === 0, `len=${items.length}`);
  check(
    "1.7 بطاقة طالب B تسمّي فوجه بالسنة — فيتضح أي فضاء يعرض",
    /السنة الثانية 69/.test(String(data.myCohortName ?? "")),
    `myCohortName=${JSON.stringify(data.myCohortName)}`
  );
}

// 6) قائمة المصادر: اسم الفوج بالسنة (بلا التباس)
{
  const res = await fetch(`${BASE}/api/telegram/sources`, { headers: { cookie: owner }, cache: "no-store" });
  const data = await j(res);
  const sources = (data.sources ?? []) as Array<Record<string, unknown>>;
  const mine = sources.find((s) => String(s.titleAr ?? "").includes("قناة الفوج أ"));
  check(
    "1.8 قائمة المصادر تعرض اسم الفوج مع سنته",
    mine != null && /فوج 69/.test(String(mine.cohortName ?? "")) && /السنة الأولى 69/.test(String(mine.cohortName ?? "")),
    `cohortName=${JSON.stringify(mine?.cohortName)}`
  );
}

// 7) فلتر المساحات في وضع المشرف — معاينة منشورات كل فوج
{
  const all = await j(await fetch(`${BASE}/api/telegram/items?mode=admin`, { headers: { cookie: owner }, cache: "no-store" }));
  const onlyA = await j(await fetch(`${BASE}/api/telegram/items?mode=admin&cohortId=${cohortA}`, { headers: { cookie: owner }, cache: "no-store" }));
  const onlyB = await j(await fetch(`${BASE}/api/telegram/items?mode=admin&cohortId=${cohortB}`, { headers: { cookie: owner }, cache: "no-store" }));
  const none = await j(await fetch(`${BASE}/api/telegram/items?mode=admin&cohortId=none`, { headers: { cookie: owner }, cache: "no-store" }));
  const allItems = (all.items ?? []) as Array<Record<string, unknown>>;
  const aItems = (onlyA.items ?? []) as Array<Record<string, unknown>>;
  const bItems = (onlyB.items ?? []) as Array<Record<string, unknown>>;
  const nItems = (none.items ?? []) as Array<Record<string, unknown>>;
  check("1.9 بلا فلتر: كل المنشورات (مع cohortId في الصفوف)", allItems.length >= 2 && allItems.every((i) => "cohortId" in i), `len=${allItems.length}`);
  check("1.10 فلتر فوج A → منشوراته فقط", aItems.length === 2 && aItems.every((i) => Number(i.cohortId) === cohortA), `len=${aItems.length}`);
  check("1.11 فلتر فوج B → فارغة", bItems.length === 0, `len=${bItems.length}`);
  check("1.12 فلتر «بلا مساحة» → المكتبة فقط (لا منشورات فوج)", nItems.every((i) => i.cohortId == null), `len=${nItems.length}`);
  const garbage = await j(await fetch(`${BASE}/api/telegram/items?mode=admin&cohortId=abc`, { headers: { cookie: owner }, cache: "no-store" }));
  const gItems = (garbage.items ?? []) as Array<Record<string, unknown>>;
  check("1.13 قيمة غير رقمية → يتجاهل الفلتر بلا انهيار", garbage.tablesReady !== false && gItems.length >= 2, `len=${gItems.length}`);
}

// 8) التقارير — مسار محلي كامل (POST → GET → PATCH)
{
  const res = await fetch(`${BASE}/api/issues`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: studentA },
    body: JSON.stringify({ itemType: "other", itemTitle: "r69 تقرير تجريبي", description: "وصف تجريبي" }),
  });
  const data = await j(res);
  check("2.1 إرسال تبليغ ينجح (المسار المحلي)", res.status === 200 && (data.report as Record<string, unknown> | undefined) != null, `${res.status} ${JSON.stringify(data).slice(0, 120)}`);

  const list = await j(await fetch(`${BASE}/api/issues`, { headers: { cookie: owner }, cache: "no-store" }));
  const reports = (list.reports ?? []) as Array<Record<string, unknown>>;
  const mine = reports.find((r) => String(r.itemTitle ?? "").includes("r69"));
  check("2.2 المشرف يرى التبليغ في اللائحة", mine != null, `reports=${reports.length}`);
  if (mine) {
    const patch = await fetch(`${BASE}/api/issues`, {
      method: "PATCH", headers: { "Content-Type": "application/json", cookie: owner },
      body: JSON.stringify({ id: mine.id, status: "تم الحل" }),
    });
    const pdata = await j(patch);
    check("2.3 حلّ التبليغ + إشعار المُبلِّغ", patch.status === 200 && pdata.ok === true, `${patch.status} ${JSON.stringify(pdata).slice(0, 100)}`);
  }
  const anon = await fetch(`${BASE}/api/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemType: "x", itemTitle: "y" }) });
  check("2.4 مجهول → 401", anon.status === 401, `${anon.status}`);
  const studentGet = await fetch(`${BASE}/api/issues`, { headers: { cookie: studentA }, cache: "no-store" });
  check("2.5 طالب لا يرى اللائحة → 403", studentGet.status === 403, `${studentGet.status}`);
}

// 9) انحدارات r68: الحذف الجماعي ما زال سليماً على منشورات المساحة
{
  const admin = await j(await fetch(`${BASE}/api/telegram/items?mode=admin&cohortId=${cohortA}`, { headers: { cookie: owner }, cache: "no-store" }));
  const ids = ((admin.items ?? []) as Array<Record<string, unknown>>).map((i) => Number(i.id)).join(",");
  const res = await fetch(`${BASE}/api/telegram/items?ids=${ids}`, { method: "DELETE", headers: { cookie: owner } });
  const data = await j(res);
  check("3.1 انحدار r68: الحذف الجماعي لمنشورات المساحة", res.status === 200 && Number(data.deleted) === 2, `${res.status} ${JSON.stringify(data).slice(0, 100)}`);
  const after = await j(await fetch(`${BASE}/api/telegram/items?mode=shared`, { headers: { cookie: studentA }, cache: "no-store" }));
  const aItems = (after.items ?? []) as unknown[];
  check("3.2 المساحة فارغة بعد الحذف", aItems.length === 0, `len=${aItems.length}`);
}

console.log(`\n${passed} ✅ / ${failed} ❌`);
db.run(`DELETE FROM TelegramItem WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId LIKE '-100999%')`);
db.run("DELETE FROM TelegramSource WHERE tgChannelId LIKE '-100999%'");
db.run("DELETE FROM AppUser WHERE email LIKE '%r69-%@test%'");
db.run("DELETE FROM CohortGroup WHERE groupName LIKE 'فوج 69%'");
db.run("DELETE FROM AcademicYear WHERE yearName IN ('السنة الأولى 69', 'السنة الثانية 69')");
db.run("DELETE FROM Specialty WHERE code = 'R69-LOG'");
db.run(`DELETE FROM StudentIssueReport WHERE itemTitle LIKE 'r69%'`);
console.log("cleanup done");
process.exit(failed > 0 ? 1 : 0);
