/**
 * r69 — seed a persistent scenario for BROWSER verification (no cleanup):
 * two same-named cohorts «فوج 69» in different years, a channel bound to
 * cohort A with two ingested posts, owner + student A accounts.
 */
import { Database } from "bun:sqlite";

const BASE = "http://127.0.0.1:3123";
const ENV_SECRET = "local-r62-test-secret";
const M_CHAT = -100999000111;

const db = new Database("/home/z/my-project/db/custom.db");
db.run("PRAGMA foreign_keys = OFF");

db.run("DELETE FROM TelegramItem WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId LIKE '-100999%')");
db.run("DELETE FROM TelegramSource WHERE tgChannelId LIKE '-100999%'");
db.run("DELETE FROM DeviceSession");
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

db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, 'فوج 69', '', datetime('now'), datetime('now'))`, [spec, y1]);
db.run(`INSERT INTO CohortGroup (specialtyId, academicYearId, groupName, subGroup, createdAt, updatedAt) VALUES (?, ?, 'فوج 69', '', datetime('now'), datetime('now'))`, [spec, y2]);
const cohortA = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج 69' AND academicYearId = ?").get(y1) as { id: number }).id;
const cohortB = (db.query("SELECT id FROM CohortGroup WHERE groupName = 'فوج 69' AND academicYearId = ?").get(y2) as { id: number }).id;

function addUser(email: string, name: string, role: string, cohort: number | null) {
  db.run(
    `INSERT INTO AppUser (fullName, email, studentId, role, assignedSpecialtyId, scopeCohortGroupId, specialtyName, yearName, groupNumber, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 'الآداب 69', '', '', datetime('now'))`,
    [name, email, Math.floor(10000000 + Math.random() * 90000000), role, spec, cohort]
  );
}
addUser("r69-owner@test.dz", "مالك 69", "OWNER", null);
addUser("r69-student-a@test.dz", "طالب الفوج أ", "STUDENT", cohortA);

async function login(name: string, email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: name, email }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const owner = await login("مالك 69", "r69-owner@test.dz");
const res = await fetch(`${BASE}/api/telegram/sources`, {
  method: "POST", headers: { "Content-Type": "application/json", cookie: owner },
  body: JSON.stringify({ handle: String(M_CHAT), sourceType: "channel", cohortId: cohortA, title: "قناة الفوج أ 69" }),
});
if (!res.ok) throw new Error(`source POST failed ${res.status}`);

let seq = 910_000;
for (const [mid, text] of [[701, "تنبيه الفوج أ: محاضرة الغد أُجّلت"], [702, "ملخص درس اليوم — النحو"]] as Array<[number, string]>) {
  await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": ENV_SECRET },
    body: JSON.stringify({
      update_id: ++seq,
      channel_post: {
        message_id: mid, chat: { id: M_CHAT, type: "channel", title: "قناة الفوج أ" },
        date: Math.floor(Date.now() / 1000), text,
      },
    }),
  });
}
console.log(`seeded: spec=${spec} cohortA=${cohortA} cohortB=${cohortB}`);
console.log("accounts: مالك 69 / r69-owner@test.dz · طالب الفوج أ / r69-student-a@test.dz (كلمة السر غير مطلوبة — تسجيل بالاسم والبريد)");
