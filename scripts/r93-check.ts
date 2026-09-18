/**
 * r93 — فصل تيليجرام عن الدروس + رفع الطلبة بمراجعة المشرف + سمّ الاختبارات
 * (bun, no Next.js, no network).
 *
 * Owner asked (r93):
 *   1) «في قسم الدروس لا تظهر دروس تيليجرام» — Telegram lessons are
 *      REMOVED from the Courses section (gateway card + course-detail
 *      lessons tab); the Telegram screen stays as its own section.
 *      «المشرف يرفع الملفات وهذا موجود» — supervisor upload untouched.
 *   2) «تمكين الطلبة من رفع الملفات لكن تتم مراجعتها من طرف المشرف أولاً»
 *      — student uploads land as review_status='pending', invisible to
 *      other students until a supervisor approves/rejects; supervisors
 *      get an inline review strip in «ملفاتي».
 *   3) «سمّ الاختبارات… الاختبار القصير مع العمل الموجه» — a named kind
 *      (اختبار / اختبار قصير / عمل موجه) on every exam, chosen in the
 *      add/edit dialog and badged on cards.
 *
 * Run from the repo root:  bun scripts/r93-check.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n——— ${title} ———`);
}

const ROOT = process.cwd();
function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

// ---------------------------------------------------------------------------
// A) قسم الدروس بلا تيليجرام — الإزالة البنيوية
// ---------------------------------------------------------------------------

section("A) قسم الدروس بلا تيليجرام");
const courses = read("src/components/talib/screens/courses-screen.tsx");
check("لا بوابة دروس تيليجرام في قائمة المقاييس", !courses.includes("بوابة دروس تيليجرام") && !courses.includes("navigate(\"TELEGRAM\")") && !courses.includes("Send"));
check("القائمة توثّق الإزالة", courses.includes("round 93 (طلب المالك"));

const detail = read("src/components/talib/screens/course-detail-screen.tsx");
for (const token of ["TgItem", "LessonCard", "kindIcon", "lessonsState", "lessonsTick", "newLessonIds", "sortedLessons", "api/telegram/items", "تصفّح دروس تيليجرام", "value=\"lessons\""]) {
  check(`لا أثر لـ«${token}» في تفاصيل المقياس`, !detail.includes(token));
}
check("تبويب الملفات يحل محل الدروس", detail.includes('defaultValue="files"') && detail.includes(">الملفات<"));
check("لا بطاقة معاينة تيليجرام/زر فتح تيليجرام", !detail.includes("telegram/file?file_id") && !detail.includes("في تيليجرام"));
check("شاشة تيليجرام نفسها باقية كقسم مستقل", existsSync(join(ROOT, "src/components/talib/screens/telegram-screen.tsx")) && read("src/app/app/page.tsx").includes("TalibTelegramScreen"));
check("رفع المشرف من مستوى المقياس باقٍ", detail.includes("PublishToLibraryDialog") && detail.includes("رفع ملف لهذا المقياس"));
check("شريط الرفع للجميع بلسان الطالب للمراجعة", detail.includes("ارفع ملفاً لهذا المقياس") && detail.includes("بعد موافقة المشرف عليه"));

// ---------------------------------------------------------------------------
// B) رفع الطلبة بمراجعة المشرف — الواجهة البرمجية
// ---------------------------------------------------------------------------

section("B) مكتبة الرفع بمراجعة المشرف — API");
const lib = read("src/app/api/library/route.ts");
check("POST يفتح للجميع (بلا بوابة canUploadContent على الحرس الأول)", lib.includes("if (!user) {\n    return NextResponse.json({ error: \"غير مصرّح\" }, { status: 403 });\n  }\n  // round 93"));
check("الطالب يُخزَّن pending والمشرف approved", lib.includes('review_status: "approved", uploader_id: user.id') && lib.includes('review_status: "pending", uploader_id: user.id'));
check("أعمدة المراجعة صارمة للطالب (needsSchema)", lib.includes("isMissingReviewColumns(lastErr)") && lib.includes("needsReviewSchemaResponse()"));
check("أعمدة المراجعة اختيارية للمشرف (attempts)", /pre-r93 databases without the review columns keep working/.test(lib));
check("GET يطابق reviewStatus/uploaderId", lib.includes('reviewStatus: String(r.review_status ?? "approved")') && lib.includes("uploaderId: r.uploaderId ?? null"));
check("GET يخفي غير المقبول عن الطلبة ويُبقي مرفوعاتهم", lib.includes('it.reviewStatus === "approved" || it.uploaderId === user.id'));
check("PATCH: reviewAction موافقة/رفض", lib.includes('reviewAction === "approve" || reviewAction === "reject"') && lib.includes('review_status: approved ? "approved" : "rejected"'));
check("موافقة الملف تُطلق الإشعار العام (لا عند الإرسال)", lib.split("notifyContentPublished({").length >= 3 && lib.includes("أُقرّ بعد المراجعة"));
check("DELETE: الطالب يحذف ما لم يُقبل بعد", lib.includes("ownUnapproved") && lib.includes("String(item.review_status ?? \"approved\") !== \"approved\""));
check("SQL المراجعة لمرة واحدة موجود", lib.includes("ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved'") && lib.includes("ADD COLUMN IF NOT EXISTS uploader_id INTEGER"));

section("B+) إشعارات المراجعة");
const notif = read("src/lib/notifications.ts");
check("notifyFileReviewRequested موجودة", notif.includes("export async function notifyFileReviewRequested"));
check("notifyFileReviewed موجودة", notif.includes("export async function notifyFileReviewed"));
check("الإشعاران generic (غير قابلين للكتم)", notif.split('type: "generic" as const').length >= 3);
check("المشرفون يُصفّون بالنطاق", /canManageRoles\(u as AuthUser\) && u\.assignedSpecialtyId === opts\.specialtyId/.test(notif));

// ---------------------------------------------------------------------------
// C) السمات في الواجهات
// ---------------------------------------------------------------------------

section("C) السمات في الواجهات");
const pub = read("src/components/talib/cloud/publish-dialog.tsx");
check("نافذة الرفع تدرك دور الطالب", pub.includes("const needsReview = !!user && !canUploadContent(user);"));
check("لسان المراجعة داخل النافذة (الوضعان)", pub.split("ملفك سيُراجع من طرف المشرف أولاً").length >= 3);
check("رسائل نجاح الطالب تصفّ المراجعة", pub.includes("سيظهر للطلبة بعد موافقة المشرف عليه"));

const files = read("src/components/talib/screens/files-screen.tsx");
check("زر الرفع لكل المستعملين", files.includes("<PublishToLibraryDialog onCreated={fetchLibrary} />"));
check("شريط مراجعة المعلّق للمشرفين", files.includes("pendingItems.length > 0") && files.includes('reviewItem(item.id, "approve")') && files.includes('reviewItem(item.id, "reject")'));
check("شارة بانتظار المراجعة على البطاقة", files.includes("بانتظار مراجعة المشرف") && files.includes("لم تتم الموافقة"));
check("الطالب يحذف ملفه غير المقبول من الواجهة", files.includes("isOwnUnapproved"));

const exams = read("src/app/api/exams/route.ts");
check("EXAM_KIND_SQL لمرة واحدة", exams.includes("ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT"));
check("GET يقرأ kind بقيمة افتراضية", exams.includes('kind: String(e.kind ?? "اختبار")') && exams.includes('kind: e.kind ?? "اختبار"'));
check("POST يحاول مع kind ثم بدون (attempts)", /const attempts: Array<Record<string, unknown>> = \[/.test(exams) && exams.includes("isMissingKindColumn"));
check("PATCH يقبل kind بتدرّج", exams.includes("if (examKind) patch.kind = examKind") && exams.includes("patchWithoutKind"));
check("الإشعار يسمّي النوع (عمل موجه ≠ اختبار)", exams.includes('examKind === "عمل موجه" ? "عمل موجه جديد"'));

const exScreen = read("src/components/talib/screens/exams-screen.tsx");
check("ثلاثة أنواع مُسمّاة", exScreen.includes('["اختبار", "اختبار قصير", "عمل موجه"]'));
check("النوع في نافذتي الإضافة والتعديل", exScreen.includes('id="examKind"') && exScreen.includes('id="editExamKind"'));
check("شارة النوع على البطاقة (عدا «اختبار» الافتراضي)", exScreen.includes('exam.kind !== "اختبار"'));
check("عنوان الحقل يتبع النوع", exScreen.includes("عنوان {kind}"));

const detExam = detail.includes('e.kind !== "اختبار"');
check("بطاقة النوع في تبويب اختبارات المقياس", detExam);

// ---------------------------------------------------------------------------
// D) المخطط المحلي — الأعمدة الثلاثة في prisma
// ---------------------------------------------------------------------------

section("D) prisma/schema.prisma");
const schema = read("prisma/schema.prisma");
check("LibraryReference.reviewStatus", schema.includes('reviewStatus    String   @default("approved")'));
check("LibraryReference.uploaderId", schema.includes("uploaderId      Int?"));
check("Exam.kind", schema.includes('kind           String        @default("اختبار")'));

// ---------------------------------------------------------------------------
// E) تأمين عابر للجولات — r90/r91/r92 كما هي
// ---------------------------------------------------------------------------

section("E) تأمين r90/r91/r92");
check(
  "ads.txt حرفياً",
  read("public/ads.txt").trim() === "google.com, pub-8081529487869617, DIRECT, f08c47fec0942fa0"
);
check("layout: AdsenseGate ولا pagead2", read("src/app/layout.tsx").includes("<AdsenseGate />"));
check("سطح API: الدفتر حي والاستوديو غائب", existsSync(join(ROOT, "src/app/api/ai/notebook/route.ts")) && !existsSync(join(ROOT, "src/app/api/ai/studio")));
const tab = read("src/components/talib/tools/tools-tab.tsx");
check("أدواتي: تسع أدوات وخلية الدفتر داخل الشبكة", (tab.match(/id: "/g) ?? []).length === 9 && tab.includes('key="notebook"') && tab.includes("gap-2.5"));
const gam = read("src/lib/gamification.ts");
check("تلعيب r92 باقٍ", gam.includes("export function rankFor") && gam.includes("talib-activity-v1"));
const group = read("src/components/talib/screens/group-screen.tsx");
check("شارة الرُتبة في الفوج باقية", group.includes("{activitySnap && <RankBadge snap={activitySnap} />}"));

console.log(`\n=== r93: ${pass}/${pass + fail} ===`);
if (fail > 0) process.exit(1);
