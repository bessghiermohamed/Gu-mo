/**
 * AI Image Studio API — «استوديو الصور» (round 83).
 *
 * CONTRACT (mirrors /api/ai):
 *   POST { prompt: string, aspect?: "1:1"|"4:3"|"3:4"|"16:9" }
 *     → 200 { image: dataUrl, provider, model, remainingToday?: number }
 *     → 200 { needsConfig: true }            — no image-capable key on the server
 *     → 400 { error }                        — empty/too-long/blocked prompt
 *     → 401 { error }                        — no session
 *     → 429 { error }                        — cooldown or daily cap
 *     → 502 { error, hint? }                 — provider chain failed (hint for owner)
 *
 * GUARDS: session auth; prompt 3..600 chars; per-user cooldown 10s + daily
 * cap 12 (images cost far more quota than chat tokens — the assistant's
 * 150/day would torch a free-tier image key in minutes).
 *
 * PROMPT PRIVACY: the prompt travels to the provider for THIS request only —
 * Gu-mo never stores it (no DB row, no log), same contract as the assistant.
 *
 * SECURITY BOUNDARY (owner's standing rule): AI features never touch
 * passwords or credentials — a prompt that tries to generate passwords,
 * cards or IDs is refused locally before any provider is called.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { ProviderError } from "@/lib/ai/providers";
import { generateImage, isImageConfigured, isImageAspect } from "@/lib/ai/image";

export const maxDuration = 60; // Vercel hobby cap — matches /api/ai

const MIN_PROMPT_CHARS = 3;
const MAX_PROMPT_CHARS = 600;
const MIN_GAP_MS = 10_000; // one image per 10s per user
const DAILY_CAP = 12; // images per user per day (per instance, best-effort)

/** Owner's standing boundary: the AI layer never handles credentials. */
const CREDENTIALS_RE =
  /(password|passwd|كلمة\s*السر|كلمة\s*المرور|الرقم\s*السري|بطاقة\s*ائتمان|بطاقة\s*بنكية|credit\s*card|carte\s*bancaire|رمز\s*التحقق|CVV|رقم\s*الضمان|رقم\s*البطاقة|مفاتيح\s*تشفير|private\s*key|api\s*key)/i;

// ---------------------------------------------------------------------------
// Best-effort in-memory rate limiting (per serverless instance, per user)
// ---------------------------------------------------------------------------

const hits = new Map<string, { last: number; day: string; count: number }>();

function remainingToday(userId: number): number {
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(String(userId));
  if (!rec || rec.day !== day) return DAILY_CAP;
  return Math.max(0, DAILY_CAP - rec.count);
}

function rateLimited(userId: number): string | null {
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(String(userId)) ?? { last: 0, day, count: 0 };
  if (rec.day !== day) {
    rec.day = day;
    rec.count = 0;
  }
  if (now - rec.last < MIN_GAP_MS) {
    return "انتظر قليلاً بين كل صورة وصورة — التوليد يحتاج وقته.";
  }
  if (rec.count >= DAILY_CAP) {
    return "وصلت إلى حد التوليد اليومي (١٢ صورة) — جرّب غداً.";
  }
  rec.count += 1;
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
// Honest Arabic errors (same voice as the assistant)
// ---------------------------------------------------------------------------

function arabicError(err: ProviderError, isOwner: boolean): { message: string; hint?: string } {
  if (err.kind === "empty") {
    // Safety refusal from the model itself — honest, actionable, no retry loop.
    return {
      message:
        "رفض النموذج توليد صورة لهذا الطلب (سياسة المحتوى) — أعد صياغة وصفك بشكل أبسط وأبعد عن أي حساسية.",
    };
  }
  const base: Record<ProviderError["kind"], string> = {
    auth: "خدمة توليد الصور غير متاحة حالياً — يجهّز فريق المنصة الإعدادات.",
    rate: "خدمة الصور مشغولة الآن أو تجاوزت حصة اللحظة — انتظر قليلاً ثم أعد المحاولة.",
    server: "تعذّر توليد الصورة الآن — أعد المحاولة بعد قليل.",
    model: "تعذّر توليد الصورة الآن — أعد المحاولة بعد قليل.",
    network: "تعذّر الاتصال بخدمة الصور — تحقق من الإنترنت ثم أعد المحاولة.",
    empty: "جاء الرد فارغاً من المزوّد — أعد المحاولة بعد قليل.",
  };
  if (!isOwner) return { message: base[err.kind] };
  const hints: Partial<Record<ProviderError["kind"], string>> = {
    auth: "مفتاح Gemini (يبدأ بـ AIza من aistudio.google.com) أو مفتاح Grok (xai- من console.x.ai) مرفوض. الصور تحتاج مفتاحاً صالحاً لأحدهما — مفاتيح Groq (gsk_) لا تولّد صوراً.",
    rate: "حصة المزوّد المجانية للصور استُهلكت (429). صور Gemini المجانية محدودة يومياً — انتظر أو أضف مفتاح Grok.",
    model: "كل نماذج الصور في السلسلة رُفضت (404/400). جرّب ضبط GEMINI_IMAGE_MODEL / XAI_IMAGE_MODEL يدوياً باسم نموذج صور متاح لمفتاحك.",
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

  let body: { prompt?: unknown; aspect?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";
  if (prompt.length < MIN_PROMPT_CHARS) {
    return NextResponse.json({ error: "اكتب وصفاً للصورة أولاً (٣ أحرف على الأقل)" }, { status: 400 });
  }
  if (CREDENTIALS_RE.test(prompt)) {
    return NextResponse.json(
      {
        error:
          "لا يولّد الاستوديو كلمات مرور أو أرقام بطاقات أو بيانات حساسة — هذه حدود محترمة في كل أدوات المنصة.",
      },
      { status: 400 }
    );
  }
  const aspect = isImageAspect(body.aspect) ? body.aspect : "1:1";

  // Rate limit ONLY valid requests (r43 lesson: validation before limiting).
  const limited = rateLimited(user.id);
  if (limited) {
    return NextResponse.json({ error: limited, remainingToday: remainingToday(user.id) }, { status: 429 });
  }

  const isOwner = user.role === "OWNER";

  if (!isImageConfigured()) {
    // Same UX convention as the assistant — the client renders a setup card.
    return NextResponse.json({ needsConfig: true });
  }

  try {
    const result = await generateImage(prompt, aspect);
    return NextResponse.json({
      image: result.dataUrl,
      provider: result.provider,
      model: result.model,
      remainingToday: remainingToday(user.id),
    });
  } catch (err) {
    const pe = err instanceof ProviderError ? err : new ProviderError("network", "unknown", 0, String(err));
    const { message, hint } = arabicError(pe, isOwner);
    return NextResponse.json(
      { error: message, hint: isOwner ? hint : undefined },
      { status: 502 }
    );
  }
}
