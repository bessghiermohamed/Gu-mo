/**
 * r65 — بيانات العرض للقطات (تُنشأ ثم تُنظّف بعد اللقطات)
 */
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db");
const CHAT = "-1007770001";

// تنظيف أي بقايا سابقة ثم إنشاء مصدر ENS تجريبي + روابط مواضيع + منشورات
db.run("DELETE FROM TelegramTopic WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId = ?)", [CHAT]);
db.run("DELETE FROM TelegramItem WHERE sourceId IN (SELECT id FROM TelegramSource WHERE tgChannelId = ?)", [CHAT]);
db.run("DELETE FROM TelegramSource WHERE tgChannelId = ?", [CHAT]);

db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'ens_demo', 'ENS — قناة المدرسة', 'channel', 'public', 1, 1, 0, datetime('now'), datetime('now'))`,
  [CHAT]
);
const srcId = (db.query("SELECT id FROM TelegramSource WHERE tgChannelId = ?").get(CHAT) as { id: number }).id;

// روابط مواضيع: مقياس + عام + سنة
db.run(
  `INSERT INTO TelegramTopic (sourceId, tgThreadId, titleAr, link, yearId, moduleId, isGeneral, createdAt, updatedAt)
   VALUES (?, 3, 'البلاغة', 'https://t.me/ens_demo/3', NULL, 3, 0, datetime('now'), datetime('now'))`,
  [srcId]
);
db.run(
  `INSERT INTO TelegramTopic (sourceId, tgThreadId, titleAr, link, yearId, moduleId, isGeneral, createdAt, updatedAt)
   VALUES (?, 9, 'نقاش عام', 'https://t.me/ens_demo/9', NULL, NULL, 1, datetime('now'), datetime('now'))`,
  [srcId]
);
db.run(
  `INSERT INTO TelegramTopic (sourceId, tgThreadId, titleAr, link, yearId, moduleId, isGeneral, createdAt, updatedAt)
   VALUES (?, 10, 'السنة الأولى', 'https://t.me/ens_demo/10', 1, NULL, 0, datetime('now'), datetime('now'))`,
  [srcId]
);

function ins(msgId: number, title: string, module: number, itemType: string, kind: string, fileName: string, postedAt: string): void {
  db.run(
    `INSERT INTO TelegramItem (sourceId, tgMessageId, mediaGroupId, kind, titleAr, captionText, searchText, fileName, mimeType, fileId, fileUniqueId, sizeBytes, link, specialtyId, moduleId, itemType, origin, postedBy, cohortId, isHidden, isFeatured, aiClassified, postedAt, createdAt, updatedAt)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, 'application/pdf', '', '', 0, ?, 1, ?, ?, 'telegram', 'أستاذ المقياس', null, 0, 0, 1, ?, ?, ?)`,
    [srcId, msgId, kind, title, title, title, fileName, `https://t.me/ens_demo/${msgId}`, module, itemType, postedAt, postedAt, postedAt]
  );
}
ins(101, "امتحان النحو والتطبيق — الدورة العادية 2025", 1, "امتحان", "pdf", "exam_nahw_2025.pdf", "2026-09-07 09:00:00");
ins(102, "ملخص الأدب الجاهلي — شامل", 2, "ملخص", "pdf", "resume_adab_jahili.pdf", "2026-09-06 15:00:00");
ins(103, "محاضرة البلاغة — المحاضرة الأولى", 3, "محاضرة", "pdf", "cours_balagha_01.pdf", "2026-09-05 11:00:00");

console.log(`demo data ready: source=${srcId}, topics=3, items=3`);
