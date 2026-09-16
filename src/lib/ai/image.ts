/**
 * Image generation provider chain (round 83) — «استوديو الصور».
 *
 * WHY THIS EXISTS: the owner asked for AI image generation inside the app
 * («توليد الصور»). The text assistant (lib/ai/providers.ts) proved the
 * pattern: a REAL provider chain with honest error classification, no
 * single-provider 502s, and zero SDK dependencies. Images need the same
 * discipline — a missing model name must fall through to the next model,
 * a rejected key must skip the whole provider, and the student must always
 * get an honest Arabic message.
 *
 * PROVIDERS (image-capable only — Groq has NO image API and is deliberately
 * absent from this chain):
 *   1. Gemini (generativelanguage.googleapis.com) — generateContent with
 *      responseModalities:["TEXT","IMAGE"], base64 PNG in inlineData.
 *      First because the owner's GEMINI_API_KEY is the one key verified
 *      live in production (r44/r71 probes).
 *   2. xAI Grok image (api.x.ai/v1/images/generations) — only if an
 *      xai- key exists (XAI_API_KEY, or a Grok key misplaced in
 *      GROQ_API_KEY — same auto-detect convention as providers.ts).
 *
 * ASPECT RATIOS: newer Gemini image models accept
 * generationConfig.imageConfig.aspectRatio. Some older ones 400 on it —
 * so a 400 triggers ONE same-model retry with imageConfig stripped before
 * the chain moves on. Grok images are fixed-size; the ratio is best-effort
 * there (never an error).
 *
 * PRIVACY: nothing is persisted — no DB row, no Supabase Storage, no log
 * of prompt content. The base64 image lives in the route response only;
 * the browser keeps it in memory (session gallery) until the student
 * downloads it or leaves.
 */

import { ProviderError } from "./providers";

export type ImageProviderId = "gemini" | "xai";

export interface GeneratedImage {
  /** data URL — `data:image/png;base64,…` (ready for <img> and downloads) */
  dataUrl: string;
  provider: ImageProviderId;
  model: string;
}

// ---------------------------------------------------------------------------
// Keys — same conventions as providers.ts (trimmed env, xai-in-Groq detect)
// ---------------------------------------------------------------------------

function detectKeys(): { gemini: string; xai: string } {
  const groqRaw = process.env.GROQ_API_KEY?.trim() || "";
  const misplacedXai = groqRaw.startsWith("xai-") ? groqRaw : "";
  return {
    gemini: process.env.GEMINI_API_KEY?.trim() || "",
    xai: process.env.XAI_API_KEY?.trim() || misplacedXai,
  };
}

export function isImageConfigured(): boolean {
  const k = detectKeys();
  return !!(k.gemini || k.xai);
}

// ---------------------------------------------------------------------------
// Model chains — env-overridable, 404/400 falls to the next model
// ---------------------------------------------------------------------------

function chainFor(provider: ImageProviderId): string[] {
  const override = (name: string) => process.env[name]?.trim() || "";
  if (provider === "gemini") {
    const m = override("GEMINI_IMAGE_MODEL");
    // r83b: production probe showed the owner's key 404s on the 2.5/2.0 image
    // names — its verified text model is 3.5-flash (r71), so the current-gen
    // image name leads; old names stay as fallbacks. 404 falls through cheaply.
    return m
      ? [m]
      : ["gemini-3.5-flash-image", "gemini-2.5-flash-image", "gemini-2.0-flash-exp-image-generation"];
  }
  const m = override("XAI_IMAGE_MODEL");
  return m ? [m] : ["grok-2-image-1212", "grok-2-image"];
}

export const IMAGE_ASPECTS = ["1:1", "4:3", "3:4", "16:9"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export function isImageAspect(v: unknown): v is ImageAspect {
  return typeof v === "string" && (IMAGE_ASPECTS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Error classification (mirrors providers.ts taxonomy + one image-specific
// kind: "content" — the model refused the prompt for safety reasons)
// ---------------------------------------------------------------------------

function classifyStatus(status: number, body: string): ProviderError["kind"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status >= 500) return "server";
  // 400/404: distinguish key rejection / content-policy refusal / bad model.
  if (status === 400 || status === 404) {
    // Google returns 400 (not 401) for an invalid API key on
    // generativelanguage — classify it as auth so the chain drops the
    // provider instead of pointlessly retrying its other models.
    if (/api key not valid|invalid api key|api_key_invalid|key.*invalid|unauthenticated/i.test(body)) {
      return "auth";
    }
    if (
      /safety|prohibited|blocked|content.*polic|policy.*content|image_safety|SAFETY/i.test(body)
    ) {
      return "empty"; // honest refusal — do NOT retry other models with the same doomed prompt
    }
    return "model";
  }
  return "server";
}

async function fetchError(provider: ImageProviderId, res: Response): Promise<ProviderError> {
  const detail = await res.text().catch(() => "");
  return new ProviderError(classifyStatus(res.status, detail), provider, res.status, detail);
}

// ---------------------------------------------------------------------------
// Gemini image call
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
}

async function geminiImage(
  key: string,
  model: string,
  prompt: string,
  aspect: ImageAspect,
  allowAspectConfig: boolean
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const generationConfig: Record<string, unknown> = { responseModalities: ["TEXT", "IMAGE"] };
  if (allowAspectConfig && aspect !== "1:1") {
    generationConfig.imageConfig = { aspectRatio: aspect };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw await fetchError("gemini", res);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) throw new ProviderError("empty", "gemini", 200, "no inlineData part");
  return imagePart.inlineData.data;
}

// ---------------------------------------------------------------------------
// xAI image call (OpenAI-compatible images API)
// ---------------------------------------------------------------------------

async function xaiImage(key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, n: 1, response_format: "b64_json" }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw await fetchError("xai", res);
  const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError("empty", "xai", 200, "no b64_json");
  return b64;
}

// ---------------------------------------------------------------------------
// Chain walker
// ---------------------------------------------------------------------------

/**
 * Generate one image. Walks Gemini models → xAI models. Auth failures drop
 * the whole provider; model errors try the next model; a safety refusal
 * (kind "empty") is honest and terminal — retrying the same prompt on a
 * different model wastes quota on the same refusal.
 */
export async function generateImage(
  prompt: string,
  aspect: ImageAspect
): Promise<GeneratedImage> {
  const keys = detectKeys();
  const attempts: Array<{
    provider: ImageProviderId;
    key: string;
    model: string;
  }> = [];
  if (keys.gemini) for (const model of chainFor("gemini")) attempts.push({ provider: "gemini", key: keys.gemini, model });
  if (keys.xai) for (const model of chainFor("xai")) attempts.push({ provider: "xai", key: keys.xai, model });

  if (attempts.length === 0) {
    throw new ProviderError("server", "unknown", 0, "no image-capable keys configured");
  }

  let lastError: ProviderError | null = null;
  let aspectStripped = false; // ONE aspect-config retry for the whole chain — never loops

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      let b64: string;
      if (attempt.provider === "gemini") {
        try {
          b64 = await geminiImage(attempt.key, attempt.model, prompt, aspect, true);
        } catch (err) {
          // Older Gemini image models 400 on imageConfig — retry once without it.
          if (
            err instanceof ProviderError &&
            err.kind === "model" &&
            !aspectStripped &&
            aspect !== "1:1"
          ) {
            aspectStripped = true;
            b64 = await geminiImage(attempt.key, attempt.model, prompt, aspect, false);
          } else {
            throw err;
          }
        }
      } else {
        b64 = await xaiImage(attempt.key, attempt.model, prompt);
      }
      return { dataUrl: `data:image/png;base64,${b64}`, provider: attempt.provider, model: attempt.model };
    } catch (err) {
      lastError =
        err instanceof ProviderError
          ? err
          : new ProviderError("network", attempt.provider, 0, err instanceof Error ? err.message : String(err));
      // Auth failure → drop every remaining attempt of that provider.
      if (lastError.kind === "auth") {
        for (let j = attempts.length - 1; j >= 0; j--) {
          if (attempts[j].provider === lastError.provider) attempts.splice(j, 1);
        }
        i--; // compensate for the loop increment over the mutated array
      }
      // Safety refusal ("empty") → stop the whole chain honestly.
      if (lastError.kind === "empty") throw lastError;
    }
  }

  throw lastError ?? new ProviderError("server", "unknown", 0, "no attempts left");
}
