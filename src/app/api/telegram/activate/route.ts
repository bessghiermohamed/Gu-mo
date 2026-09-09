/**
 * Telegram self-activation API (round 63) — «أضف البوت بنفسك، بلا لوحات».
 *
 * POST { token, specialtyId?, chats: [{ chatId, sourceType?, titleAr? }] }
 *
 * Called ONCE (by us / by the owner) to make an allowlisted bot live on
 * production WITHOUT any dashboard step. It:
 *   1. Validates the token live (getMe) + checks AUTO_BOT_IDS — proof of
 *      possession is the auth here: whoever holds the token owns the bot.
 *   2. setWebhook → the URL carries the token (?b=…) with a derived secret;
 *      pending updates are KEPT so the owner's queued test posts flow in.
 *   3. Registers/refreshes telegram_sources for the given chats (the bot
 *      must actually be a member — verified via getChat with the token).
 *   4. Best-effort: persists the token into bot_config (service key + table
 *      required — otherwise the ?b= URL path keeps everything working).
 *   5. Probes item counts for the registered sources after a short wait —
 *      live feedback that the pending posts really landed in the app.
 *
 * The token is NEVER echoed in any response and NEVER logged.
 * Local dev note: setWebhook requires a public HTTPS origin, so on localhost
 * step 2 fails gracefully (everything else still verifies).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveBotConfig } from "@/lib/telegram/bot-config";
import { telegramApi, getMeWith, activateAutoWebhook } from "@/lib/telegram/bot-api";
import { derivedWebhookSecret, isAutoBotToken, TOKEN_RE } from "@/lib/telegram/auto-bot";
import type { TgChatInfo } from "@/lib/telegram/types";

export const maxDuration = 60;

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface ActivateChat {
  chatId: number | string;
  sourceType?: "channel" | "group";
  titleAr?: string;
  specialtyId?: number;
}

function resolveOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
}

/** يقرأ أول تخصص متاح — هدف افتراضي لمصدر جديد حتى يعيد المشرف ربطه بدقة */
async function defaultSpecialtyId(): Promise<number> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("specialties").select("id").order("id", { ascending: true }).limit(1).maybeSingle();
      if (data) return Number(data.id);
      return 1;
    }
    const s = await db.specialty.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
    return s?.id ?? 1;
  } catch {
    return 1;
  }
}

interface SourceOutcome {
  chatId: string;
  title: string;
  username: string;
  sourceType: string;
  registered: boolean;
  created: boolean;
  typeCorrected?: boolean;
  cleanedChatter?: number;
  itemCount: number;
  recentTitles?: string[];
  error?: string;
}

/** يسجّل/ينعّش مصدراً واحداً — البوت يجب أن يكون عضواً (يُتحقق عبر getChat) */
async function registerSource(
  token: string,
  chat: ActivateChat,
  fallbackSpecialtyId: number
): Promise<SourceOutcome> {
  const chatIdStr = String(chat.chatId).trim();
  const outcome: SourceOutcome = {
    chatId: chatIdStr,
    title: chat.titleAr ?? "",
    username: "",
    sourceType: chat.sourceType === "group" ? "group" : "channel",
    registered: false,
    created: false,
    itemCount: 0,
  };

  // 1) تحقق حي من العضوية — لا تسجيل لمحادثة ليس البوت فيها
  const r = await telegramApi<TgChatInfo>(token, "getChat", { chat_id: chatIdStr });
  if (!r.ok || !r.result) {
    outcome.error = r.description ?? "تعذّر قراءة المحادثة";
    return outcome;
  }
  const info = r.result;
  outcome.title = (chat.titleAr ?? info.title ?? "").trim() || `قناة ${chatIdStr.slice(-6)}`;
  outcome.username = (info.username ?? "").replace(/^@/, "").trim();
  outcome.sourceType = chat.sourceType === "group" || info.type === "supergroup" || info.type === "group" ? "group" : "channel";
  const kind = outcome.username ? "public" : "private";
  const specialtyId = chat.specialtyId ?? fallbackSpecialtyId;

  // 2) upsert — لا نطال حقول التنقيح الإداري (module/cohort/year) إن وُجدت.
  //    r63b: نوع المصدر يُصحّح دائماً من نوع المحادثة الفعلي — مجموعة منتدى
  //    سُجّلت سابقاً كـ«قناة» تبتلع نقاش «العام»؛ تصحيحها إلى «مجموعة» يوقف ذلك.
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase
        .from("telegram_sources")
        .select("id, source_type")
        .eq("tg_channel_id", chatIdStr)
        .maybeSingle();
      if (existing) {
        const prevType = String((existing as Record<string, unknown>).source_type ?? "channel");
        const { error } = await supabase
          .from("telegram_sources")
          .update({ tg_username: outcome.username, title_ar: outcome.title, source_type: outcome.sourceType, is_active: true })
          .eq("id", Number(existing.id));
        if (error) {
          outcome.error = error.message;
          return outcome;
        }
        outcome.registered = true;
        outcome.typeCorrected = prevType !== outcome.sourceType;
      } else {
        const { error } = await supabase.from("telegram_sources").insert({
          tg_channel_id: chatIdStr,
          tg_username: outcome.username,
          title_ar: outcome.title,
          source_type: outcome.sourceType,
          kind,
          specialty_id: specialtyId,
          is_active: true,
        });
        if (error) {
          outcome.error = error.message;
          return outcome;
        }
        outcome.registered = true;
        outcome.created = true;
      }
    } else {
      const existing = await db.telegramSource.findUnique({ where: { tgChannelId: chatIdStr } });
      if (existing) {
        await db.telegramSource.update({
          where: { id: existing.id },
          data: { tgUsername: outcome.username, titleAr: outcome.title, sourceType: outcome.sourceType, isActive: true },
        });
        outcome.registered = true;
        outcome.typeCorrected = existing.sourceType !== outcome.sourceType;
      } else {
        await db.telegramSource.create({
          data: {
            tgChannelId: chatIdStr,
            tgUsername: outcome.username,
            titleAr: outcome.title,
            sourceType: outcome.sourceType,
            kind,
            specialtyId,
            isActive: true,
          },
        });
        outcome.registered = true;
        outcome.created = true;
      }
    }
  } catch (e) {
    outcome.error = (e as Error).message;
    return outcome;
  }

  // 3) r63b: إن صُحّح النوع إلى «مجموعة» فكان سابقاً «قناة» — نظّف نقاش
  //    «العام» الذي ابتُلع خطأً (نص بلا وسائط وبرابط t.me بلا موضوع).
  //    عناصر التنقيح ذات الوسائط أو داخل مواضيع تبقى كما هي.
  if (outcome.typeCorrected && outcome.sourceType === "group") {
    outcome.cleanedChatter = await cleanupGeneralChatter(chatIdStr);
  }
  return outcome;
}

/** يحذف عناصر نقاش العام المبتلعة خطأً — روابطها بلا جزء الموضوع */
async function cleanupGeneralChatter(chatIdStr: string): Promise<number> {
  try {
    let removed = 0;
    const isChatterLink = (link: string): boolean => {
      // t.me/<user>/<msg> (بلا موضوع) أو t.me/c/<id>/<msg> — مقطع رقمي واحد بعد الجذر
      const m = /^https:\/\/t\.me\/(?:c\/\d+|[^/]+)\/(\d+)$/.exec((link ?? "").trim());
      return !!m;
    };
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: src } = await supabase
        .from("telegram_sources")
        .select("id")
        .eq("tg_channel_id", chatIdStr)
        .maybeSingle();
      if (!src) return 0;
      const { data: items } = await supabase
        .from("telegram_items")
        .select("id, kind, link")
        .eq("source_id", Number(src.id))
        .eq("kind", "text");
      for (const it of items ?? []) {
        const row = it as Record<string, unknown>;
        if (isChatterLink(String(row.link ?? ""))) {
          await supabase.from("telegram_items").delete().eq("id", Number(row.id));
          removed += 1;
        }
      }
    } else {
      const src = await db.telegramSource.findUnique({ where: { tgChannelId: chatIdStr }, select: { id: true } });
      if (!src) return 0;
      const items = await db.telegramItem.findMany({ where: { sourceId: src.id, kind: "text" }, select: { id: true, link: true } });
      for (const it of items) {
        if (isChatterLink(it.link)) {
          await db.telegramItem.delete({ where: { id: it.id } });
          removed += 1;
        }
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

/** يعدّ منشورات المصادر المسجّلة ويقرأ أحدث عناوينها — ملاحظة حية أن التحديثات وصلت فعلاً */
async function countSourceItems(sourceOutcomes: SourceOutcome[]): Promise<void> {
  for (const s of sourceOutcomes) {
    if (!s.registered) continue;
    try {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: src } = await supabase
          .from("telegram_sources")
          .select("id")
          .eq("tg_channel_id", s.chatId)
          .maybeSingle();
        if (src) {
          const { count } = await supabase
            .from("telegram_items")
            .select("id", { count: "exact", head: true })
            .eq("source_id", Number(src.id));
          s.itemCount = count ?? 0;
          const { data: recent } = await supabase
            .from("telegram_items")
            .select("title_ar")
            .eq("source_id", Number(src.id))
            .order("posted_at", { ascending: false })
            .limit(3);
          s.recentTitles = (recent ?? []).map((r) => String((r as Record<string, unknown>).title_ar ?? "")).filter(Boolean);
        }
      } else {
        const src = await db.telegramSource.findUnique({ where: { tgChannelId: s.chatId }, select: { id: true } });
        if (src) {
          s.itemCount = await db.telegramItem.count({ where: { sourceId: src.id } });
          const recent = await db.telegramItem.findMany({
            where: { sourceId: src.id },
            orderBy: { postedAt: "desc" },
            select: { titleAr: true },
            take: 3,
          });
          s.recentTitles = recent.map((r) => r.titleAr).filter(Boolean);
        }
      }
    } catch {
      // عدّ استرشادي فقط
    }
  }
}

export async function GET() {
  return NextResponse.json({
    hint: "أرسل POST مع توكن بوت مسموح (AUTO_BOT_IDS) وقائمة المحادثات لتفعيله — راجع تقرير الجولة 63.",
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير مفهوم" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "توكن غير صالح" }, { status: 400 });
  }
  if (!isAutoBotToken(token)) {
    return NextResponse.json({ error: "هذا البوت غير مسموح بالتفعيل الذاتي" }, { status: 403 });
  }

  // 1) تحقق حي من التوكن
  const me = await getMeWith(token);
  if (!me?.username) {
    return NextResponse.json({ error: "تيليجرام يرفض هذا التوكن" }, { status: 400 });
  }

  // 2) الربط الذاتي — الرابط يحمل التوكن والسرّ مشتق منه (لا يُعاد أبداً في الردّ)
  const origin = resolveOrigin(req);
  const hook = await activateAutoWebhook(token, origin, derivedWebhookSecret);

  // 3) تسجيل المصادر (قناة ENS والمحادثات المرسلة)
  const fallbackSpecialtyId =
    typeof body.specialtyId === "number" && body.specialtyId > 0 ? body.specialtyId : await defaultSpecialtyId();
  const chatsRaw = Array.isArray(body.chats) ? body.chats : [];
  const chats: ActivateChat[] = chatsRaw
    .filter((c): c is ActivateChat => !!c && typeof (c as ActivateChat).chatId !== "undefined")
    .slice(0, 20);
  const sourceOutcomes: SourceOutcome[] = [];
  for (const c of chats) {
    sourceOutcomes.push(await registerSource(token, c, fallbackSpecialtyId));
  }

  // 4) أفضل جهد: حفظ التوكن في bot_config لتظهر الحالة في لوحة الإدارة
  let botConfigSaved = false;
  try {
    const saved = await saveBotConfig({
      botToken: token,
      webhookSecret: derivedWebhookSecret(token),
      botUsername: me.username,
    });
    botConfigSaved = saved.ok;
  } catch {
    botConfigSaved = false;
  }

  // 5) انتظار قصير ثم عدّ المنشورات — التحديثات المعلّقة تصل عادة خلال ثوانٍ
  if (hook.ok && sourceOutcomes.some((s) => s.registered)) {
    await new Promise((r) => setTimeout(r, 4000));
    await countSourceItems(sourceOutcomes);
  }

  return NextResponse.json({
    ok: hook.ok,
    bot: { username: me.username, firstName: me.firstName },
    webhook: { ok: hook.ok, message: hook.message, url: `${origin}/api/telegram/webhook?b=***` },
    botConfigSaved,
    sources: sourceOutcomes.map((s) => ({
      chatId: s.chatId,
      title: s.title,
      username: s.username ? `@${s.username}` : "",
      sourceType: s.sourceType,
      registered: s.registered,
      created: s.created,
      ...(s.typeCorrected ? { typeCorrected: true, cleanedChatter: s.cleanedChatter ?? 0 } : {}),
      itemCount: s.itemCount,
      ...(s.recentTitles?.length ? { recentTitles: s.recentTitles } : {}),
      ...(s.error ? { error: s.error } : {}),
    })),
    message: hook.ok
      ? `البوت @${me.username} يعمل الآن — الربط الذاتي مفعّل${sourceOutcomes.length ? " والمحادثات المسجّلة تبدأ بالترتيب فوراً" : ""}. التحديثات المعلّقة ستُعالج خلال لحظات.`
      : `تحقق البوت @${me.username} لكن تعذّر تفعيل الربط (${hook.message}) — يعمل هذا من نطاق HTTPS عام (الإنتاج) لا من localhost.`,
  });
}
