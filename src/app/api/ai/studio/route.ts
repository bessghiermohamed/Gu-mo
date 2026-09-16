/**
 * استوديو المولّدات API — /api/ai/studio (الجولة 89).
 *
 * نسخة الويب من خدمات التوليد التي عاش المالك يبحث عنها في التطبيق: ثماني
 * أدوات على سلسلة المزوّدين القائمة نفسها (Groq ← Gemini ← xAI) بلا أي
 * مفتاح جديد ولا خدمة خارجية ولا تخزين — ستٌّ منها تعيد استخدام ممرات البوت
 * المُجرَّبة (r85/r86) حرفياً، وتضيف اثنتين: بحث موسّع (خطّان بأمانة معلنة)
 * وقارن النماذج (مزوّدان بالتوازي عبر chatWithProvider).
 *
 * CONTRACT: POST { action, ...payload } → JSON
 *   research  → { outline: string[], report, note, provider, model }
 *   arena     → { answers: Array<{ provider, providerLabel, model?, answer?, error? }>, ok }
 *   diagram   → { code, typeLabel, corrected, provider, model }
 *   translate → { translation, targetLabel, autoDetected, provider, model }
 *   arabic    → { analysis, provider, model }
 *   detect    → { verdict: { probability, verdict, signals, advice }, provider, model }
 *   review    → { review, provider, model }
 *   html      → { html, title, archetypeLabel, refined, provider, model }
 *   لا مفاتيح على الخادم → 200 { needsConfig: true } (عُرف r44).
 *
 * GUARDS: جلسة مطلوبة؛ الحرس الأمني قبل أي مزوّد وأي حصة (نفس البوت)؛
 * خمس برك حصص مستقلة في الذاكرة (research/arena/diagram/html/light) بنفس
 * حدود البوت المعلنة؛ التحقق قبل الحصص (درس r43).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import {
  chatComplete,
  chatWithProvider,
  isAiConfigured,
  configuredProviders,
  ProviderError,
  type ChatMessage,
  type ChatCompleteOptions,
  type ProviderId,
} from "@/lib/ai/providers";
import {
  validateStudioRequest,
  createStudioPoolLimiter,
  studioGuard,
  findStudioAction,
  buildResearchOutlineSystem,
  buildResearchOutlineMessages,
  parseResearchOutline,
  outlineError,
  buildResearchReportSystem,
  buildResearchReportMessages,
  validateResearchReport,
  RESEARCH_OUTLINE_TIMEOUT_MS,
  RESEARCH_REPORT_TIMEOUT_MS,
  RESEARCH_HONESTY_NOTE,
  buildArenaSystem,
  buildArenaMessages,
  pickArenaProviders,
  arenaSingleProviderError,
  ARENA_TIMEOUT_MS,
  providerDisplayName,
  type StudioPool,
} from "@/lib/ai/studio";
import {
  findDiagramType,
  runDiagramStudio,
  runTranslateStudio,
  runAnalyzeStudio,
  runDetectStudio,
  runReviewStudio,
  findLang,
} from "@/lib/ai/study-tools";
import { findArchetype, DEFAULT_ARCHETYPE_ID, runHtmlStudio } from "@/lib/ai/html-studio";

export const maxDuration = 60; // استوديو HTML وحده يعشق 52ث — السقف يحمي الجميع

const limiters: Record<StudioPool, ReturnType<typeof createStudioPoolLimiter>> = {
  research: createStudioPoolLimiter("research"),
  arena: createStudioPoolLimiter("arena"),
  diagram: createStudioPoolLimiter("diagram"),
  html: createStudioPoolLimiter("html"),
  light: createStudioPoolLimiter("light"),
};

function arabicError(err: ProviderError, isOwner: boolean): { message: string; hint?: string } {
  const base: Record<ProviderError["kind"], string> = {
    auth: "خدمة الاستوديو غير متاحة حالياً — يجهّز فريق المنصة الإعدادات.",
    rate: "الاستوديو مشغول الآن أو تم تجاوز حد المزوّد — انتظر قليلاً ثم أعد المحاولة.",
    server: "تعذّر إتمام العملية الآن — أعد المحاولة بعد قليل.",
    model: "تعذّر إتمام العملية الآن — أعد المحاولة بعد قليل.",
    network: "تعذّر الاتصال بخدمة الاستوديو — تحقق من الإنترنت ثم أعد المحاولة.",
    empty: "جاء الرد فارغاً من المزوّد — أعد المحاولة بعد قليل.",
  };
  if (!isOwner) return { message: base[err.kind] };
  const hints: Partial<Record<ProviderError["kind"], string>> = {
    auth: "كل المفاتيح المُعدّة رُفضت (401/403). Groq يبدأ gsk_، Gemini بـ AIza، Grok بـ xai-.",
    rate: "مزوّد واحد على الأقل تجاوز حصته المجانية (429) — السلسلة جربت الجميع.",
    model: "كل نماذج السلسلة رُفضت (404/400) — راجع GROQ_MODEL / GEMINI_MODEL / XAI_MODEL.",
  };
  return { message: base[err.kind], hint: hints[err.kind] };
}

function errResponse(err: unknown, isOwner: boolean): NextResponse {
  const pe = err instanceof ProviderError ? err : new ProviderError("network", "unknown", 0, String(err));
  const { message, hint } = arabicError(pe, isOwner);
  return NextResponse.json({ error: message, hint: isOwner ? hint : undefined }, { status: 502 });
}

function chatCompleteAny(
  system: string,
  messages: ChatMessage[],
  timeoutMs: number,
  opts?: ChatCompleteOptions
) {
  return chatComplete(system, messages, AbortSignal.timeout(timeoutMs), opts);
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

  const parsed = validateStudioRequest(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.body;
  const spec = findStudioAction(body.action)!;
  const isOwner = user.role === "OWNER";

  // الحرس الأمني قبل أي مزوّد وقبل احتساب أي حصة (نفس منطق البوت)
  const refused = studioGuard(body);
  if (refused) {
    return NextResponse.json({ error: refused }, { status: 422 });
  }

  // الحصص بعد التحقق فقط (درس r43)
  const limited = limiters[spec.pool].check(user.id);
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json({ needsConfig: true });
  }

  const deadlineMs = Date.now() + 52_000; // داخل سقف maxDuration بامتياز

  try {
    switch (body.action) {
      // --------------------------------------------------------------
      // بحث موسّع — خطّان: مخطط ← تقرير، بأمانة معلنة
      // --------------------------------------------------------------
      case "research": {
        const outlineAns = await chatCompleteAny(
          buildResearchOutlineSystem(),
          buildResearchOutlineMessages(body.topic),
          RESEARCH_OUTLINE_TIMEOUT_MS,
          { maxTokens: 1024, temperature: 0.3 }
        );
        const outline = parseResearchOutline(outlineAns.answer);
        if (outline.length < 3) {
          return NextResponse.json({ error: outlineError() }, { status: 502 });
        }
        const report = await chatCompleteAny(
          buildResearchReportSystem(),
          buildResearchReportMessages(body.topic, outline),
          RESEARCH_REPORT_TIMEOUT_MS,
          { maxTokens: 4096, temperature: 0.4 }
        );
        const invalid = validateResearchReport(report.answer);
        if (invalid) {
          return NextResponse.json({ error: invalid }, { status: 502 });
        }
        return NextResponse.json({
          outline,
          report: report.answer,
          note: RESEARCH_HONESTY_NOTE,
          provider: report.provider,
          model: report.model,
        });
      }

      // --------------------------------------------------------------
      // قارن النماذج — نفس السؤال لمزوّدين بالتوازي، والنتيجة صادقة
      // --------------------------------------------------------------
      case "arena": {
        const configured = configuredProviders();
        const pair = pickArenaProviders(configured);
        if (!pair) {
          return NextResponse.json({ error: arenaSingleProviderError(configured) }, { status: 400 });
        }
        const system = buildArenaSystem();
        const messages = buildArenaMessages(body.question);
        const ask = (p: ProviderId) =>
          chatWithProvider(p, system, messages, AbortSignal.timeout(ARENA_TIMEOUT_MS), {
            maxTokens: 2048,
            temperature: 0.5,
          });
        const [ra, rb] = await Promise.allSettled([ask(pair.a), ask(pair.b)]);
        const answers = [ra, rb].map((r, i) => {
          const pid = i === 0 ? pair.a : pair.b;
          if (r.status === "fulfilled") {
            return {
              provider: pid,
              providerLabel: providerDisplayName(pid),
              model: r.value.model,
              answer: r.value.answer,
            };
          }
          const pe = r.reason instanceof ProviderError ? r.reason : null;
          return {
            provider: pid,
            providerLabel: providerDisplayName(pid),
            error: pe
              ? arabicError(pe, isOwner).message
              : "تعذّر الحصول على إجابة من هذا المزوّد — أعد المحاولة.",
          };
        });
        const okCount = answers.filter((a) => !("error" in a)).length;
        if (okCount === 0) {
          return errResponse(new ProviderError("server", pair.a, 0, "both arena legs failed"), isOwner);
        }
        return NextResponse.json({ answers, ok: okCount });
      }

      // --------------------------------------------------------------
      // أدوات البوت الستّ — نفس الممرات المُجرَّبة حرفياً
      // --------------------------------------------------------------
      case "diagram": {
        const type = body.typeId ? findDiagramType(body.typeId) : null;
        const r = await runDiagramStudio({ prompt: body.prompt, type, deadlineMs });
        return NextResponse.json({
          code: r.code,
          typeLabel: r.typeLabel,
          corrected: r.corrected,
          provider: r.provider,
          model: r.model,
        });
      }
      case "translate": {
        const explicit = body.lang ? findLang(body.lang) : null;
        const r = await runTranslateStudio(body.text, explicit);
        return NextResponse.json({
          translation: r.translation,
          targetLabel: r.targetLabel,
          autoDetected: r.autoDetected,
          provider: r.provider,
          model: r.model,
        });
      }
      case "arabic": {
        const r = await runAnalyzeStudio(body.text);
        return NextResponse.json({ analysis: r.analysis, provider: r.provider, model: r.model });
      }
      case "detect": {
        const r = await runDetectStudio(body.text);
        return NextResponse.json({ verdict: r.verdict, provider: r.provider, model: r.model });
      }
      case "review": {
        const r = await runReviewStudio(body.code, body.note ?? "");
        return NextResponse.json({ review: r.review, provider: r.provider, model: r.model });
      }
      case "html": {
        const archetype =
          (body.archetypeId ? findArchetype(body.archetypeId) : null) ??
          findArchetype(DEFAULT_ARCHETYPE_ID)!; // الافتراضي مضمون الوجود في الكتالوج
        const r = await runHtmlStudio({ prompt: body.prompt, archetype, deadlineMs });
        return NextResponse.json({
          html: r.html,
          title: r.title,
          archetypeLabel: r.archetypeLabel,
          refined: r.refined,
          provider: r.provider,
          model: r.model,
        });
      }
    }
  } catch (err) {
    if (err instanceof ProviderError) return errResponse(err, isOwner);
    // أخطاء الممرّات رسائل عربية صادقة منها وليست أعطالاً
    const msg = err instanceof Error && err.message ? err.message : "تعذّر إتمام العملية — أعد المحاولة.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
