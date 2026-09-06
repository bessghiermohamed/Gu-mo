/**
 * AI Study Assistant API — «المساعد الذكي» (round 43).
 *
 * A task-based study helper for students: summarize a lesson, explain a
 * concept simply, generate self-quiz questions, or ask a free question.
 * Arabic-first by design — prompts and system role are Arabic.
 *
 * PROVIDER CHAIN (both are plain REST — no SDK dependency, nothing client-side):
 *   1. GROQ_API_KEY  → Groq (llama-3.3-70b-versatile)  — free tier, very fast
 *   2. GEMINI_API_KEY → Google Gemini (gemini-2.0-flash) — free tier fallback
 *   3. neither       → 200 { needsConfig: true }        — same convention as the
 *      library route's needsSchema: the UI renders a setup card instead of an error.
 *
 * GUARDS: session auth required; text ≤ 8000 chars; question ≤ 500 chars;
 * in-memory per-IP cooldown + daily cap (best-effort on serverless — each
 * instance keeps its own counter; still stops accidental loops and abuse bursts).
 *
 * PRIVACY: the pasted lesson text is sent to the provider for THIS request
 * only and is never stored anywhere by Gu-mo (no DB row, no log of content).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";

type AiTask = "summarize" | "explain" | "quiz" | "ask";

const MAX_TEXT = 8000;
const MAX_QUESTION = 500;
const MIN_GAP_MS = 5_000; // one request per 5s per IP
const DAILY_CAP = 60; // requests per IP per day (per instance, best-effort)

const TASK_PROMPTS: Record<AiTask, string> = {
  summarize:
    "لخّص النص التالي في نقاط قصيرة واضحة بالعربية (٥ نقاط كحد أقصى)، مع سطر أول يذكر الموضوع العام. احفظ المصطلحات المهمة كما هي دون ترجمة.",
  explain:
    "اشرح النص/المفهوم التالي بلغة عربية بسيطة يفهمها طالب جامعي، كأنك تشرح لزميل خلف الصف. استخدم مثالاً واحداً على الأقل، وقسّم الشرح إلى فقرات قصيرة. احفظ المصطلحات التقنية كما هي.",
  quiz:
    "بناءً على النص التالي، أنشئ ٥ أسئلة مراجعة قصيرة بالعربية (نوعها متنوع: سؤال مباشر، أكمل، علّل). اكتب الأسئلة مرقمة أولاً، ثم أضف في النهاية قسمًا بعنوان «الإجابات» يحوي إجابة موجبة لكل سؤال مرقم بنفس الترتيب.",
  ask: "أنت مساعد دراسي لطالب جامعي جزائري. أجب على سؤاله بالعربية الفصحى المبسطة، بإجابة مباشرة ومركزة، وبدقة علمية. إن كان السؤال يحتاج سياقًا من النص المرفق فاعتمد عليه أولًا. إن لم تعرف الجواب بدقة فقل ذلك بصراحة ولا تخترع معلومات.",
};

const SYSTEM_ROLE =
  "أنت «المساعد الذكي» في منصة طالب (Talib) التعليمية الجزائرية. تجيب دائمًا بالعربية الفصحى المبسطة بأسلوب ودقيق ومحترم، بلا مقدمات زائدة وبلا إيموجي. تنبه الطالب بلطف إن كان السؤال خارج نطاق الدراسة.";

// ---------------------------------------------------------------------------
// Best-effort in-memory rate limiting (per serverless instance)
// ---------------------------------------------------------------------------

const hits = new Map<string, { last: number; day: string; count: number }>();

function rateLimited(ip: string): string | null {
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const rec = hits.get(ip) ?? { last: 0, day, count: 0 };
  if (rec.day !== day) {
    rec.day = day;
    rec.count = 0;
  }
  if (now - rec.last < MIN_GAP_MS) return "انتظر قليلاً بين كل طلب وآخر — المساعد يحتاج بضع ثوانٍ للتفكير.";
  rec.count += 1;
  if (rec.count > DAILY_CAP) return "وصلت إلى حد الاستخدام اليومي للمساعد — جرّب غدًا.";
  rec.last = now;
  hits.set(ip, rec);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (now - v.last > 24 * 60 * 60 * 1000) hits.delete(k);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Providers (plain fetch, OpenAI-compatible then Gemini)
// ---------------------------------------------------------------------------

async function callGroq(system: string, user: string, key: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`groq ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("groq: empty answer");
  return answer;
}

async function callGemini(system: string, user: string, key: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!answer) throw new Error("gemini: empty answer");
  return answer;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let body: { task?: string; text?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const task = body.task as AiTask;
  if (!task || !(task in TASK_PROMPTS)) {
    return NextResponse.json({ error: "نوع المهمة غير معروف" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  const question = (body.question ?? "").trim();
  if (text.length > MAX_TEXT) {
    return NextResponse.json(
      { error: `النص طويل جداً — الحد ${MAX_TEXT} حرف تقريباً` },
      { status: 400 }
    );
  }
  if (question.length > MAX_QUESTION) {
    return NextResponse.json(
      { error: `السؤال طويل جداً — الحد ${MAX_QUESTION} حرف` },
      { status: 400 }
    );
  }
  if (task === "ask" && !question) {
    return NextResponse.json({ error: "اكتب سؤالك أولاً" }, { status: 400 });
  }
  if (task !== "ask" && !text) {
    return NextResponse.json({ error: "الصق النص أو الدرس أولاً" }, { status: 400 });
  }

  // Rate limit ONLY valid requests — invalid ones must not burn the cooldown
  // (found by the r43 probe: a validation 400 came back as 429 otherwise).
  const limited = rateLimited(ip);
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 });
  }

  // Compose the user message for the model.
  let userMessage: string;
  if (task === "ask") {
    userMessage = text
      ? `النص/السياق:\n"""\n${text}\n"""\n\nالسؤال: ${question}`
      : `السؤال: ${question}`;
  } else {
    userMessage = `${TASK_PROMPTS[task]}\n\nالنص:\n"""\n${text}\n"""`;
  }
  const system = SYSTEM_ROLE;

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey && !geminiKey) {
    // Same UX convention as needsSchema — the client renders a setup card.
    return NextResponse.json({ needsConfig: true });
  }

  try {
    const answer = groqKey
      ? await callGroq(system, userMessage, groqKey)
      : await callGemini(system, userMessage, geminiKey as string);
    return NextResponse.json({ answer });
  } catch {
    // Provider quota/network issues → honest Arabic error, no content logged.
    return NextResponse.json(
      { error: "تعذّر الحصول على إجابة الآن — الخدمة مشغولة أو تجاوزت الحد. أعد المحاولة بعد قليل." },
      { status: 502 }
    );
  }
}
