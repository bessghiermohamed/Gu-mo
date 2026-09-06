/**
 * AI Study Chat API — «المساعد الذكي» (round 44 rewrite).
 *
 * r43 was a task-based single-shot endpoint whose "provider chain" existed
 * only in comments — a bad GROQ key 502'd every request. r44 turns this
 * into the backend of a ChatGPT-style conversation: multi-turn history in,
 * SSE token stream out, with a REAL provider chain (see lib/ai/providers.ts)
 * and automatic detection of the owner's Grok-key-in-Groq-slot mixup.
 *
 * CONTRACT:
 *   POST { messages: [{role:"user"|"assistant", content}], stream?: boolean }
 *     stream:true (default) → text/event-stream:
 *       data: {"type":"meta","provider":"groq","model":"llama-…"}  (once)
 *       data: {"type":"delta","text":"…"}                          (many)
 *       data: {"type":"error","message":"…","hint":?}              (on failure)
 *       data: [DONE]
 *     stream:false → { answer, provider, model } JSON (fallback path)
 *   No keys at all → 200 { needsConfig: true } (same convention as needsSchema).
 *
 * GUARDS: session auth required; ≤ 40 turns; ≤ 6000 chars/message; last
 * message must be from the user; in-memory per-USER cooldown + daily cap
 * (per-account is fairer than per-IP for a conversational tool on mobile).
 *
 * PRIVACY: chat history lives in the STUDENT's browser (localStorage) and
 * is sent to the provider for THIS request only — Gu-mo never stores it
 * (no DB row, no log of content).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { streamChat, chatComplete, isAiConfigured, ProviderError, type ChatMessage } from "@/lib/ai/providers";

export const maxDuration = 60; // provider chain + long streams need headroom

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 6000;
const MAX_TOTAL_CHARS = 24_000;
const MIN_GAP_MS = 3_000; // one request per 3s per user
const DAILY_CAP = 150; // messages per user per day (per instance, best-effort)

const SYSTEM_ROLE = [
  "أنت «المساعد الذكي»، رفيق دراسة لطالب جامعي جزائري في منصة طالب (Talib).",
  "أجب دائماً بالعربية الفصحى المبسطة بأسلوب ودود ودقيق، وبلا مقدمات زائدة وبلا إيموجي.",
  "نظّم إجاباتك بفقرات قصيرة، واستخدم عناوين وقوائم مختصرة عند الحاجة، ووضّح المصطلحات التقنية بالعربية مع إبقائها بالإنجليزية/الفرنسية بين قوسين إن كانت كذلك.",
  "إذا كان السؤال غامضاً فاسأل سؤالاً توضيحياً واحداً قبل الإجابة، وإذا كان خارج نطاق الدراسة فنبّه الطالب بلطف.",
  "إن لم تعرف الجواب بدقة فقل ذلك بصراحة ولا تخترع معلومات، وذكّر الطالب بلطف بمراجعة مصدره الدراسي عند الحديث العلمي الدقيق.",
].join(" ");

// ---------------------------------------------------------------------------
// Best-effort in-memory rate limiting (per serverless instance, per user)
// ---------------------------------------------------------------------------

const hits = new Map<string, { last: number; day: string; count: number }>();

function rateLimited(userId: number): string | null {
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(String(userId)) ?? { last: 0, day, count: 0 };
  if (rec.day !== day) {
    rec.day = day;
    rec.count = 0;
  }
  if (now - rec.last < MIN_GAP_MS) return "انتظر ثوانٍ قليلة بين كل رسالة ورسالة — المساعد يحتاج وقتاً للتفكير.";
  rec.count += 1;
  if (rec.count > DAILY_CAP) return "وصلت إلى حد الاستخدام اليومي للمساعد — جرّب غدًا.";
  rec.last = now;
  hits.set(String(userId), rec);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (now - v.last > 24 * 60 * 60 * 1000) hits.delete(k);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function parseMessages(raw: unknown): { messages?: ChatMessage[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "لا توجد رسائل في الطلب" };
  if (raw.length > MAX_MESSAGES) return { error: "المحادثة طويلة جداً — ابدأ محادثة جديدة" };

  const messages: ChatMessage[] = [];
  let total = 0;
  for (const item of raw) {
    const role = (item as { role?: unknown })?.role;
    const content = (item as { content?: unknown })?.content;
    if (role !== "user" && role !== "assistant") return { error: "رسالة بنوع غير معروف" };
    if (typeof content !== "string" || content.trim().length === 0) return { error: "هناك رسالة فارغة في المحادثة" };
    const text = content.trim().slice(0, MAX_MESSAGE_CHARS);
    total += text.length;
    if (total > MAX_TOTAL_CHARS) return { error: "المحادثة طويلة جداً — ابدأ محادثة جديدة" };
    messages.push({ role, content: text });
  }
  if (messages[messages.length - 1].role !== "user") return { error: "آخر رسالة يجب أن تكون سؤالك" };
  return { messages };
}

function arabicError(err: ProviderError, isOwner: boolean): { message: string; hint?: string } {
  const base: Record<ProviderError["kind"], string> = {
    auth: "خدمة المساعد غير متاحة حالياً — يجهّز فريق المنصة الإعدادات.",
    rate: "المساعد مشغول الآن أو تم تجاوز حد الاستخدام — انتظر قليلاً ثم أعد المحاولة.",
    server: "تعذّر الحصول على إجابة الآن — أعد المحاولة بعد قليل.",
    model: "تعذّر الحصول على إجابة الآن — أعد المحاولة بعد قليل.",
    network: "تعذّر الاتصال بخدمة المساعد — تحقق من الإنترنت ثم أعد المحاولة.",
    empty: "جاء الرد فارغاً من المزوّد — أعد المحاولة بعد قليل.",
  };
  if (!isOwner) return { message: base[err.kind] };
  const hints: Partial<Record<ProviderError["kind"], string>> = {
    auth: "كل المفاتيح المُعدّة رُفضت (401/403). تحقق: مفتاح Groq يبدأ بـ gsk_ من console.groq.com، ومفتاح Gemini بـ AIza من aistudio.google.com، ومفتاح Grok يبدأ بـ xai- ويوضع في XAI_API_KEY.",
    rate: "مزوّد واحد على الأقل تجاوز حصته المجانية (429). السلسلة جربت كل المزوّدين المعدّين.",
    model: "كل نماذج السلسلة رُفضت (404/400). جرّب ضبط GROQ_MODEL / GEMINI_MODEL / XAI_MODEL يدوياً.",
  };
  return { message: base[err.kind], hint: hints[err.kind] };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  }

  let body: { messages?: unknown; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const { messages, error } = parseMessages(body.messages);
  if (!messages || error) {
    return NextResponse.json({ error: error ?? "طلب غير صالح" }, { status: 400 });
  }

  // Rate limit ONLY valid requests (r43 probe lesson: validation before limiting).
  const limited = rateLimited(user.id);
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 });
  }

  if (!isAiConfigured()) {
    // Same UX convention as needsSchema — the client renders a setup card.
    return NextResponse.json({ needsConfig: true });
  }

  const isOwner = user.role === "OWNER";
  const wantStream = body.stream !== false;

  // ------------------------------------------------------------------
  // Non-streaming fallback
  // ------------------------------------------------------------------
  if (!wantStream) {
    try {
      const result = await chatComplete(SYSTEM_ROLE, messages);
      return NextResponse.json({ answer: result.answer, provider: result.provider, model: result.model });
    } catch (err) {
      const pe = err instanceof ProviderError ? err : new ProviderError("network", "unknown", 0, String(err));
      const { message, hint } = arabicError(pe, isOwner);
      return NextResponse.json({ error: message, hint: isOwner ? hint : undefined }, { status: 502 });
    }
  }

  // ------------------------------------------------------------------
  // SSE streaming
  // ------------------------------------------------------------------
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  const abortUpstream = () => upstream.abort();
  req.signal.addEventListener("abort", abortUpstream, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let closed = false;
      const safeClose = () => {
        if (!closed) {
          closed = true;
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };

      let full = "";
      try {
        await streamChat(
          SYSTEM_ROLE,
          messages,
          (delta) => {
            full += delta;
            send({ type: "delta", text: delta });
          },
          (meta) => send({ type: "meta", ...meta }),
          upstream.signal
        );
        if (!full.trim()) {
          const { message } = arabicError(new ProviderError("empty", "unknown", 0, "no text"), isOwner);
          send({ type: "error", message });
        }
      } catch (err) {
        if (upstream.signal.aborted) {
          // Client stopped generation (or navigated) — partial stays as-is.
        } else if (full.trim()) {
          // Partial answer was already streamed; tell the client it may be incomplete.
          send({ type: "error", message: "انقطع الرد قبل اكتماله — أعد المحاولة للحصول على إجابة كاملة." });
        } else {
          const pe = err instanceof ProviderError ? err : new ProviderError("network", "unknown", 0, String(err));
          const { message, hint } = arabicError(pe, isOwner);
          send({ type: "error", message, hint: isOwner ? hint : undefined });
        }
      } finally {
        req.signal.removeEventListener("abort", abortUpstream);
        safeClose();
      }
    },
    cancel() {
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
