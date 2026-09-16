/**
 * دفتر طالب API — /api/ai/notebook (الجولة 87).
 *
 * خلفية «دفتر طالب» بأسلوب NotebookLM: حديث مُسنَد بمقتطفات مصادر الطالب
 * (باستشهاد [م1] صادق) + مخرجات دراسية مولَّدة (ملخّص، دليل، اختبار، بطاقات،
 * خط زمني، أسئلة شائعة، نص صوتي حواري، خريطة ذهنية Mermaid).
 *
 * CONTRACT:
 *   POST { action: "chat", question, history[], excerpts[] , stream? }
 *     → SSE بنفس عقد /api/ai: meta → delta → [DONE] (أو JSON عند stream:false)
 *   POST { action: <artifact>, corpus[] }   (الأفعال الثمانية في ARTIFACT_CATALOG)
 *     → { kind, data, provider, model } JSON
 *   لا مفاتيح على الخادم → 200 { needsConfig: true } (عُرف r44 نفسه).
 *
 * PRIVACY: المصادر تعيش في متصفح الطالب؛ التقطيع والاسترجاع محليان
 * (src/lib/ai/notebook.ts نفسها تعمل في العميل) — الخادم يستقبل لهذا
 * الطلب فقط مقتطفات مختارة أو مُجلَّداً مُقتطعاً بحد أقصى، ولا يخزّن شيئاً.
 *
 * GUARDS: جلسة مطلوبة؛ حدود مستقلة في الذاكرة لكل مستخدم: الحديث 4ث/80
 * يومياً، المخرجات 12ث/30 يومياً (بركة واحدة لكل الأفعال الثمانية) —
 * نفس منهج /api/ai وبوت تيليجرام.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import {
  streamChat,
  chatComplete,
  isAiConfigured,
  ProviderError,
  type ChatMessage,
} from "@/lib/ai/providers";
import {
  buildChatSystem,
  buildChatMessages,
  buildArtifactSystem,
  buildArtifactMessages,
  buildStudyCorpus,
  parseArtifact,
  validateNotebookRequest,
  createNotebookLimiter,
  CHAT_LIMIT,
  ARTIFACT_LIMIT,
  CHAT_GAP_MESSAGE,
  CHAT_CAP_MESSAGE,
  ARTIFACT_GAP_MESSAGE,
  ARTIFACT_CAP_MESSAGE,
} from "@/lib/ai/notebook";

export const maxDuration = 60; // سلسلة المزوّدين + بث طويل تحتاج مساحة

const chatLimiter = createNotebookLimiter(
  CHAT_LIMIT.gapMs,
  CHAT_LIMIT.dailyCap,
  CHAT_GAP_MESSAGE,
  CHAT_CAP_MESSAGE
);
const artifactLimiter = createNotebookLimiter(
  ARTIFACT_LIMIT.gapMs,
  ARTIFACT_LIMIT.dailyCap,
  ARTIFACT_GAP_MESSAGE,
  ARTIFACT_CAP_MESSAGE
);

function arabicError(err: ProviderError, isOwner: boolean): { message: string; hint?: string } {
  const base: Record<ProviderError["kind"], string> = {
    auth: "خدمة الدفتر غير متاحة حالياً — يجهّز فريق المنصة الإعدادات.",
    rate: "الدفتر مشغول الآن أو تم تجاوز حد المزوّد — انتظر قليلاً ثم أعد المحاولة.",
    server: "تعذّر إتمام العملية الآن — أعد المحاولة بعد قليل.",
    model: "تعذّر إتمام العملية الآن — أعد المحاولة بعد قليل.",
    network: "تعذّر الاتصال بخدمة الدفتر — تحقق من الإنترنت ثم أعد المحاولة.",
    empty: "جاء الرد فارغاً من المزوّد — أعد المحاولة بعد قليل.",
  };
  if (!isOwner) return { message: base[err.kind] };
  const hints: Partial<Record<ProviderError["kind"], string>> = {
    auth: "كل المفاتيح المُعدّة رُفضت (401/403). تحقق: Groq يبدأ gsk_، Gemini بـ AIza، Grok بـ xai-.",
    rate: "مزوّد واحد على الأقل تجاوز حصته المجانية (429) — السلسلة جربت الجميع.",
    model: "كل نماذج السلسلة رُفضت (404/400) — راجع GROQ_MODEL / GEMINI_MODEL / XAI_MODEL.",
  };
  return { message: base[err.kind], hint: hints[err.kind] };
}

function errResponse(err: unknown, isOwner: boolean, status = 502): NextResponse {
  const pe = err instanceof ProviderError ? err : new ProviderError("network", "unknown", 0, String(err));
  const { message, hint } = arabicError(pe, isOwner);
  return NextResponse.json({ error: message, hint: isOwner ? hint : undefined }, { status });
}

function parseErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "تعذّر توليد المخرج — أعد المحاولة.";
}

// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const parsed = validateNotebookRequest(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.body;
  const isOwner = user.role === "OWNER";

  // الحصص بعد التحقق فقط (درس r43: لا نعاقب على طلبات فاسدة)
  const limited =
    body.action === "chat" ? chatLimiter.check(user.id) : artifactLimiter.check(user.id);
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json({ needsConfig: true });
  }

  // ------------------------------------------------------------------
  // الحديث المُسنَد — بث SSE كما في /api/ai
  // ------------------------------------------------------------------
  if (body.action === "chat") {
    const messages = buildChatMessages(body.question, body.history, body.excerpts);
    const wantStream = (raw as { stream?: boolean })?.stream !== false;

    if (!wantStream) {
      try {
        const r = await chatComplete(buildChatSystem(), messages);
        return NextResponse.json({ answer: r.answer, provider: r.provider, model: r.model });
      } catch (err) {
        return errResponse(err, isOwner);
      }
    }

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
            buildChatSystem(),
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
            // الطالب أوقف أو غادر — الجزء المتوصل يبقى كما هو
          } else if (full.trim()) {
            send({ type: "error", message: "انقطع الرد قبل اكتماله — أعد السؤال للحصول على إجابة كاملة." });
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

  // ------------------------------------------------------------------
  // المخرجات المولَّدة — نداء واحد، مدقّق، بلا حلقات إعادة
  // ------------------------------------------------------------------
  try {
    const corpus = buildStudyCorpus(body.corpus);
    if (corpus.parts.length === 0) {
      return NextResponse.json({ error: "لا يوجد محتوى كافٍ في المصادر المُفعَّلة" }, { status: 400 });
    }
    const r = await chatComplete(
      buildArtifactSystem(body.action),
      buildArtifactMessages(body.action, corpus),
      undefined,
      body.action === "mindmap" || body.action === "audio-script"
        ? { maxTokens: 4096, temperature: 0.4 }
        : { maxTokens: 3072, temperature: 0.35 }
    );
    const result = parseArtifact(body.action, r.answer);
    return NextResponse.json({
      kind: result.kind,
      data: result.data,
      provider: r.provider,
      model: r.model,
    });
  } catch (err) {
    // أخطاء المدقّق رسائل عربية صادقة منّا وليست أعطال مزوّد
    if (err instanceof Error && !(err instanceof ProviderError)) {
      return NextResponse.json({ error: parseErrorMessage(err) }, { status: 502 });
    }
    return errResponse(err, isOwner);
  }
}
