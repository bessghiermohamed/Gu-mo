/**
 * Bot swap API (round 62) — «تغيير البوت» من لوحة الإدارة.
 *
 * GET  → حالة البوت الفعّال: من قاعدة البيانات أم من Vercel، @اسم البوت،
 *        الويبهوك، وجاهزية جدول bot_config ومفتاح الخدمة — بلا كشف التوكن.
 *
 * POST → «save-token»: التوكن الجديد يُتحقق منه لدى تيليجرام (getMe)،
 *        يُحفظ في bot_config (سـرّ — service role فقط)، يُولَّد له سرّ
 *        ويبهوك جديد، ويُفعَّل الويبهوك فوراً. لا Vercel ولا Redeploy.
 *        «clear»: حذف التوكن المحفوظ والعودة لمتغير البيئة.
 *
 * GUARDS: نفس هرمية لوحة الإدارة (canUploadContent). التوكن المرسَل
 * لا يُعاد أبداً في أي استجابة، ولا يُطبع في أي سجل.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { resolveBotCredentials, getBotConfigStatus, saveBotConfig, clearBotConfig } from "@/lib/telegram/bot-config";
import { getMeWith, activateWebhookWith, getWebhookInfoWith } from "@/lib/telegram/bot-api";

export const maxDuration = 60;

/** شكل توكن تيليجرام القياسي: 123456789:AA… (35+ حرفاً بعد النقطتين) */
const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,60}$/;

function freshWebhookSecret(): string {
  return `tgwh_${randomBytes(24).toString("hex")}`;
}

function resolveOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }

  const creds = await resolveBotCredentials();
  const config = await getBotConfigStatus();
  const me = creds.token ? await getMeWith(creds.token) : null;
  const webhook = creds.token ? await getWebhookInfoWith(creds.token) : null;

  return NextResponse.json({
    activeTokenSource: creds.source, // db | env | none
    botUsername: me?.username ?? "",
    botFirstName: me?.firstName ?? "",
    botTokenValid: !!me,
    webhook,
    config,
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
    return NextResponse.json({ error: "جسم الطلب غير مفهوم" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "save-token";

  // ---------- إلغاء التوكن المحفوظ (العودة لمتغير Vercel) ----------
  if (action === "clear") {
    const result = await clearBotConfig();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      message: "حُذف التوكن المحفوظ — عاد التطبيق إلى بوت متغير البيئة (TELEGRAM_BOT_TOKEN). اضغط «تفعيل الربط» من بطاقة الحالة لإعادة تسجيل الويبهوك عليه.",
    });
  }

  // ---------- حفظ توكن بوت جديد وتفعيله ----------
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "الصق توكن البوت (من @BotFather)" }, { status: 400 });
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "شكل التوكن غير صحيح — انسخه كاملاً من @BotFather (شكله 123456789:AAxyz…)" }, { status: 400 });
  }
  if (token.length > 200) return NextResponse.json({ error: "التوكن أطول من المتوقع" }, { status: 400 });

  // 1) التحقق من التوكن لدى تيليجرام نفسه — بالتوكن المُرسَل لا النشط
  const me = await getMeWith(token);
  if (!me || !me.username) {
    return NextResponse.json(
      { error: "تيليجرام يرفض هذا التوكن — تأكد من نسخه كاملاً من @BotFather (أو أن البوت لم يُحذف)" },
      { status: 400 }
    );
  }

  // 2) الحفظ في قاعدة البيانات (سرّ — لا يُقرأ إلا عبر مفتاح الخدمة)
  const secret = freshWebhookSecret();
  const saved = await saveBotConfig({ botToken: token, webhookSecret: secret, botUsername: me.username });
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error, reason: saved.reason }, { status: 400 });
  }

  // 3) تفعيل الويبهوك فوراً على نطاق النشر الحالي
  const origin = resolveOrigin(req);
  const hook = await activateWebhookWith(token, secret, origin);

  return NextResponse.json({
    ok: true,
    botUsername: me.username,
    botFirstName: me.firstName,
    webhook: { ok: hook.ok, message: hook.message, url: hook.url },
    message: hook.ok
      ? `تم التبديل إلى @${me.username} وتفعيل الربط ✅ — أضف البوت «مشرفاً» في قنواتك ليبدأ الترتيب التلقائي، ويمكن الآن مراسلته خاصاً ليجيب بذكاء.`
      : `حُفظ البوت @${me.username} ✅ لكن تعذّر تفعيل الويبهوك (${hook.message}) — جرّب «تفعيل الربط» من بطاقة الحالة.`,
  });
}
