/**
 * Telegram webhook setup/status + فحص ذاتي (round 7/8)
 *
 * GET  → تشخيص كامل: التوكن (ومن هو البوت)، سرّ الويبهوك، الويبهوك،
 *        مفتاح Gemini، وجداول Supabase — حتى يعرف المشرف بالضبط
 *        ما الخطوة التالية المطلوبة منه.
 *
 * POST → ثلاثة أوضاع عبر «action»:
 *   (بدون action) → تفعيل الويبهوك على نطاق النشر الحالي (كما في الجولة 7).
 *   "test-gemini"  → تصنيف عيّنة عربية فعلياً عبر Gemini + قائمة النماذج
 *                    المتاحة للمفتاح — يجيب «هل التصنيف الذكي يعمل؟».
 *   "simulate"     → محاكاة منشور جديد كامل (الويبهوك ← التصنيف ← القاعدة)
 *                    على قناة مربوطة، ثم عرض النتيجة وحذف المنشور التجريبي.
 *
 * المشرفون فقط (نفس هرمية لوحة الإدارة). البوت يجب أن يكون مشرفاً في
 * كل قناة/مجموعة مربوطة — هذا شرط تيليجرام لاستقبال منشوراتها.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import {
  getWebhookInfo,
  setWebhook,
  isBotConfigured,
  getBotInfo,
  loadSourceById,
  findTelegramItem,
  deleteTelegramItemById,
  processTelegramUpdate,
} from "@/lib/telegram/ingest";
import { classifyItem, isGeminiConfigured, geminiModel, probeGeminiRaw } from "@/lib/telegram/classify";
import type { TgUpdate } from "@/lib/telegram/types";

export const maxDuration = 60; // فحص Gemini قد يستغرق بضع ثوانٍ

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const GEMINI_SAMPLE = "امتحان محلول في التحليل الرياضي — السنة الأولى جامعي — الدورة العادية";

async function checkTablesReady(): Promise<boolean> {
  if (!isVercel) return true; // محلياً: جداول Prisma تنشأ بـ db push
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("telegram_sources").select("id", { head: true, limit: 1 });
    return !error;
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const botConfigured = isBotConfigured();
  const bot = botConfigured ? await getBotInfo() : null;
  const webhook = botConfigured ? await getWebhookInfo() : null;
  return NextResponse.json({
    botConfigured,
    // التوكن موجود ومقبول من تيليجرام (getMe نجح)
    botTokenValid: botConfigured && !!bot,
    botUsername: bot?.username ?? "",
    botFirstName: bot?.firstName ?? "",
    webhookSecretConfigured: !!process.env.TELEGRAM_WEBHOOK_SECRET?.trim(),
    geminiConfigured: isGeminiConfigured(),
    geminiModel: geminiModel(),
    tablesReady: await checkTablesReady(),
    isVercel,
    webhook,
    allowedUpdates: ["channel_post", "edited_channel_post", "message", "edited_message"],
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // جسم فارغ = تفعيل الويبهوك (توافق مع الجولة 7)
  }
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "test-gemini") return testGemini();
  if (action === "simulate") return simulateIngest(body, user);

  // ---------- الوضع الافتراضي: تفعيل الويبهوك ----------
  if (!isBotConfigured()) {
    return NextResponse.json(
      { error: "اضبط TELEGRAM_BOT_TOKEN في متغيرات البيئة على Vercel أولاً" },
      { status: 400 }
    );
  }
  // نطاق النشر الحالي — يمر عبر headers الموثوقة خلف Vercel
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
  const result = await setWebhook(origin);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message, webhookUrl: `${origin}/api/telegram/webhook` });
}

// ------------------------------------------------------------
// فحص Gemini: عيّنة حقيقية + قائمة النماذج المتاحة للمفتاح
// ------------------------------------------------------------
async function testGemini() {
  const configured = isGeminiConfigured();
  const cls = await classifyItem({ kind: "text", caption: GEMINI_SAMPLE, fileName: "" });

  // عند الفشل: مسبار خام يجرّب كل نموذج في السلسلة ويكشف السبب الحقيقي
  let probe: Array<{ model: string; status: number; body: string }> | null = null;
  if (configured && !cls.aiClassified) {
    try {
      probe = await probeGeminiRaw();
    } catch {
      probe = null;
    }
  }

  // قائمة النماذج التي تدعم generateContent (best-effort — قد تفشل دون أثر)
  let models: string[] = [];
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        };
        models = (data.models ?? [])
          .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
          .map((m) => String(m.name ?? "").replace(/^models\//, ""))
          .filter((n) => n.length > 0)
          .slice(0, 30);
      }
    } catch {
      // تجاهل — القائمة تحسين اختياري
    }
  }

  let message: string;
  if (cls.aiClassified) {
    message = `Gemini يعمل ✅ — صنّف العيّنة كـ «${cls.itemType}» عبر ${geminiModel()}. التصنيف الذكي وقراءة نص الصور مفعّلان للمنشورات الجديدة.`;
  } else if (configured) {
    const first = probe && probe.length > 0 ? probe[0] : null;
    const probeInfo = first
      ? ` جرّبنا السلسلة (${(probe ?? []).map((p) => `${p.model}:${p.status}`).join(" ثم ")}).${first.status === 200 ? " وصلت استجابة لكن بلا نص صالح — انظر «النتيجة الخام»" : ` أول خطأ من غوغل: ${first.body.slice(0, 200)}`}`
      : "";
    message = `المفتاح مضبوط لكن الاستدعاء فشل.${probeInfo} جرّب ضبط GEMINI_MODEL بنموذج من القائمة أدناه ثم أعد النشر — أو استعمل مفتاحاً آخر. التصنيف المحلي يعمل في هذه الأثناء.`;
  } else {
    message = "GEMINI_API_KEY غير مضبوط — التصنيف المحلي بالكلمات المفتاحية يعمل الآن بشكل كامل. أضف المفتاح في Vercel لتفعيل الذكاء الاصطناعي.";
  }

  return NextResponse.json({
    ok: true,
    configured,
    aiClassified: cls.aiClassified,
    itemType: cls.itemType,
    title: cls.title,
    model: geminiModel(),
    models,
    probe,
    message,
  });
}

// ------------------------------------------------------------
// محاكاة استيراد منشور (اختبار كامل للخط بدون تيليجرام)
// ------------------------------------------------------------
async function simulateIngest(body: Record<string, unknown>, user: { role: string; assignedSpecialtyId: number }) {
  const sourceId = Number(body.sourceId);
  if (!sourceId) return NextResponse.json({ error: "حدد القناة المراد فحصها" }, { status: 400 });

  const source = await loadSourceById(sourceId);
  if (!source) return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
  if (user.role !== "OWNER" && Number(source.specialtyId) !== Number(user.assignedSpecialtyId)) {
    return NextResponse.json({ error: "هذا المصدر خارج نطاقك" }, { status: 403 });
  }
  if (!source.isActive) {
    return NextResponse.json({ error: "هذا المصدر موقوف مؤقتاً — فعّل الاستيراد له أولاً" }, { status: 400 });
  }

  const customText = typeof body.text === "string" ? body.text.trim() : "";
  const text = customText ? customText.slice(0, 500) : "سلسلة تمارين محلولة رقم 3 — التحليل الرياضي — السنة الأولى";

  // معرفات ضخمة عشوائية (ضمن حد INT32 للعمود) حتى لا تتصادم مع منشورات
  // حقيقية أبداً — رسائل تيليجرام الفعلية أقرب للصفر من هذا المدى بكثير
  const messageId = 1_900_000_000 + Math.floor(Math.random() * 99_000_000);
  const update: TgUpdate = {
    update_id: (Math.floor(Date.now() / 1000) % 1_000_000_000) + 1,
    channel_post: {
      message_id: messageId,
      from: { id: 999_999, is_bot: false, first_name: "فحص تلقائي" },
      chat: {
        id: Number(source.tgChannelId) || 0,
        type: source.sourceType === "group" ? "supergroup" : "channel",
        title: source.titleAr,
      },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };

  const status = await processTelegramUpdate(update);
  if (status === "ignored") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "لم يكتمل الاستيراد التجريبي (حالة: تجاهُل). الأسباب الشائعة: جداول Supabase غير منشأة (نفّذ supabase_telegram.sql) أو مشكلة اتصال بقاعدة البيانات.",
      },
      { status: 500 }
    );
  }

  const item = await findTelegramItem(source.id, messageId);
  let cleaned = true;
  if (item) cleaned = await deleteTelegramItemById(item.id);

  return NextResponse.json({
    ok: true,
    status,
    aiClassified: item?.aiClassified ?? false,
    item: item
      ? {
          title: item.titleAr,
          itemType: item.itemType,
          kind: item.kind,
          caption: item.captionText.slice(0, 200),
          link: item.link,
        }
      : null,
    cleaned,
    message: cleaned
      ? "نجح الاستيراد التجريبي بالكامل ✅ — أُنشئ المنشور وصُنِّف ثم حُذف تلقائياً (لن يظهر للطلبة). الخط جاهز للمنشورات الحقيقية."
      : "نجح الاستيراد لكن تعذّر حذف المنشور التجريبي — احذفه يدوياً من تبويب «تنقيح المنشورات» (يبدأ عنوانه بـ «سلسلة»/«امتحان» حسب العيّنة).",
  });
}
