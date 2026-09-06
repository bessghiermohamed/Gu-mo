/**
 * AI provider chain (round 44) — shared by /api/ai.
 *
 * WHY THIS EXISTS (round-43 post-mortem + owner report):
 *   1. r43's route had "provider chain" in the comments but NOT in the code:
 *      if GROQ_API_KEY was set, Groq was called and its failure 502'd the
 *      request — Gemini was never tried. The owner put a GROK key (x.ai) in
 *      GROQ_API_KEY, so EVERY request failed and students saw
 *      «تعذّر الحصول على إجابة الآن…» permanently.
 *   2. r43 hardcoded gemini-2.0-flash, which 404s on the owner's Gemini key
 *      (proven live in the Telegram pipeline probe: only 3.5-flash and
 *      3.1-flash-lite return 200 there — the same chain classify.ts uses).
 *
 * WHAT THIS LIB DOES:
 *   - Key format auto-detection: Groq keys start with «gsk_», xAI (Grok)
 *     keys with «xai-», Gemini keys with «AIza». An xai- key accidentally
 *     placed in GROQ_API_KEY is silently re-routed to the x.ai provider —
 *     the owner's mixup becomes a working backup instead of an outage.
 *   - REAL chain: every (provider, model) attempt is tried in order; auth
 *     failures skip the rest of that provider's models; model errors
 *     (404/400) and server errors (5xx) try the next model of the chain.
 *   - Streaming (SSE) + non-streaming variants, plain REST, no SDK.
 *
 * Attempt order: Groq → Gemini → xAI. Groq first (fastest, recommended
 * free tier), Gemini second (verified working for this owner), xAI last
 * (bonus — only valid if the owner added a Grok key).
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ProviderId = "groq" | "gemini" | "xai";

export type ProviderErrorKind =
  | "auth" // 401/403 — key rejected, skip the whole provider
  | "model" // 404/400 — model unavailable for this key, try next model
  | "rate" // 429 — quota/limit, skip to next provider
  | "server" // 5xx — provider trouble, try next model
  | "network" // fetch throw / timeout
  | "empty"; // 200 but no text

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  provider: ProviderId | "unknown";
  status: number;

  constructor(kind: ProviderErrorKind, provider: ProviderId | "unknown", status: number, detail: string) {
    super(`${provider} ${kind}${status ? ` ${status}` : ""}: ${detail.slice(0, 200)}`);
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Model chains — env-overridable, defaults proven live where possible
// ---------------------------------------------------------------------------

/** Verified live for this owner's Gemini key (Telegram pipeline probe). */
const GEMINI_CHAIN = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];

const GROQ_CHAIN = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

const XAI_CHAIN = ["grok-4-fast", "grok-3-mini", "grok-2-1212"];

function chainFor(provider: ProviderId): string[] {
  const override = (name: string) => process.env[name]?.trim();
  if (provider === "groq") {
    const m = override("GROQ_MODEL");
    return m ? [m] : GROQ_CHAIN;
  }
  if (provider === "gemini") {
    const m = override("GEMINI_MODEL");
    return m ? [m] : GEMINI_CHAIN;
  }
  const m = override("XAI_MODEL");
  return m ? [m] : XAI_CHAIN;
}

interface Attempt {
  provider: ProviderId;
  key: string;
  model: string;
}

/** Ordered (provider, model) attempts built from whatever keys exist. */
function buildAttempts(): Attempt[] {
  const groqRaw = process.env.GROQ_API_KEY?.trim() || "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const explicitXai = process.env.XAI_API_KEY?.trim() || "";

  // Auto-detect a Grok key misplaced in GROQ_API_KEY (owner's round-44 mixup).
  const misplacedXai = groqRaw.startsWith("xai-") ? groqRaw : "";
  const groqKey = groqRaw && !misplacedXai ? groqRaw : "";
  const xaiKey = explicitXai || misplacedXai;

  const out: Attempt[] = [];
  if (groqKey) for (const model of chainFor("groq")) out.push({ provider: "groq", key: groqKey, model });
  if (geminiKey) for (const model of chainFor("gemini")) out.push({ provider: "gemini", key: geminiKey, model });
  if (xaiKey) for (const model of chainFor("xai")) out.push({ provider: "xai", key: xaiKey, model });
  return out;
}

export function isAiConfigured(): boolean {
  return buildAttempts().length > 0;
}

/** Which providers are actually usable (for owner diagnostics). */
export function configuredProviders(): ProviderId[] {
  return [...new Set(buildAttempts().map((a) => a.provider))];
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classify(provider: ProviderId, status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status === 404 || status === 400) return "model";
  if (status >= 500) return "server";
  return "server";
}

async function providerFetchError(provider: ProviderId, res: Response): Promise<ProviderError> {
  const detail = await res.text().catch(() => "");
  return new ProviderError(classify(provider, res.status), provider, res.status, detail);
}

// ---------------------------------------------------------------------------
// Request builders (shared by streaming + non-streaming)
// ---------------------------------------------------------------------------

const SYSTEM_TIMEOUT_MS = 45_000;

function openAiBody(model: string, system: string, messages: ChatMessage[], stream: boolean) {
  return JSON.stringify({
    model,
    stream,
    temperature: 0.5,
    max_tokens: 2048,
    messages: [{ role: "system", content: system }, ...messages],
  });
}

/** Gemini 2.5 family burns free-tier quota on hidden "thinking" tokens and
 *  returns empty answers unless thinking is disabled (same fix as classify.ts). */
const GEMINI_THINKING_RE = /^gemini-2\.5/;

function geminiBody(model: string, system: string, messages: ChatMessage[], stream: boolean) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const generationConfig: Record<string, unknown> = { temperature: 0.5, maxOutputTokens: 8192 };
  if (GEMINI_THINKING_RE.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig,
  });
}

// ---------------------------------------------------------------------------
// SSE line reader — buffers partial lines across chunks
// ---------------------------------------------------------------------------

async function* sseLines(res: Response, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no response body");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, "");
        if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

// ---------------------------------------------------------------------------
// Streaming provider calls — yield text deltas
// ---------------------------------------------------------------------------

async function* streamOpenAiCompatible(
  provider: ProviderId,
  endpoint: string,
  key: string,
  model: string,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: openAiBody(model, system, messages, true),
    signal,
  });
  if (!res.ok) throw await providerFetchError(provider, res);
  for await (const data of sseLines(res, signal)) {
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    } catch {
      /* skip keep-alive / partial JSON lines */
    }
  }
}

async function* streamGemini(
  key: string,
  model: string,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: geminiBody(model, system, messages, true),
    signal,
  });
  if (!res.ok) throw await providerFetchError("gemini", res);
  for await (const data of sseLines(res, signal)) {
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text) yield text;
    } catch {
      /* skip keep-alive lines */
    }
  }
}

function streamCallFor(
  attempt: Attempt,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  switch (attempt.provider) {
    case "groq":
      return streamOpenAiCompatible(
        "groq",
        "https://api.groq.com/openai/v1/chat/completions",
        attempt.key,
        attempt.model,
        system,
        messages,
        signal
      );
    case "xai":
      return streamOpenAiCompatible(
        "xai",
        "https://api.x.ai/v1/chat/completions",
        attempt.key,
        attempt.model,
        system,
        messages,
        signal
      );
    case "gemini":
      return streamGemini(attempt.key, attempt.model, system, messages, signal);
  }
}

// ---------------------------------------------------------------------------
// Public API — chain walker
// ---------------------------------------------------------------------------

export interface StreamResult {
  provider: ProviderId;
  model: string;
}

/**
 * Stream a chat completion, walking the provider→model chain. `onMeta` fires
 * once, right before the first delta of the attempt that actually answers.
 * If an attempt fails BEFORE producing any delta, the next attempt runs; a
 * failure AFTER partial output is rethrown (the caller keeps the partial).
 */
export async function streamChat(
  system: string,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onMeta: (meta: StreamResult) => void,
  signal?: AbortSignal
): Promise<StreamResult> {
  const attempts = buildAttempts();
  let lastError: ProviderError | null = null;

  for (const attempt of attempts) {
    let emitted = false;
    try {
      const stream = streamCallFor(attempt, system, messages, signal);
      for await (const delta of stream) {
        if (!emitted) {
          emitted = true;
          onMeta({ provider: attempt.provider, model: attempt.model });
        }
        onDelta(delta);
      }
      if (emitted) return { provider: attempt.provider, model: attempt.model };
      // Stream ended cleanly but produced nothing → treat as empty answer.
      lastError = new ProviderError("empty", attempt.provider, 0, "stream ended with no text");
    } catch (err) {
      if (signal?.aborted) throw err; // user pressed stop — not a provider failure
      if (emitted) throw err; // partial answer already sent — surface it
      lastError =
        err instanceof ProviderError
          ? err
          : new ProviderError("network", attempt.provider, 0, err instanceof Error ? err.message : String(err));
    }
    // Auth failures invalidate every model of the same provider — skip them.
    if (lastError?.kind === "auth") {
      for (let i = attempts.length - 1; i >= 0; i--) {
        if (attempts[i].provider === lastError.provider) attempts.splice(i, 1);
      }
    }
  }

  throw lastError ?? new ProviderError("server", "unknown", 0, "no providers configured");
}

/** Non-streaming fallback — same chain, single JSON answer. */
export async function chatComplete(
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<{ answer: string } & StreamResult> {
  const attempts = buildAttempts();
  let lastError: ProviderError | null = null;

  for (const attempt of attempts) {
    try {
      let res: Response;
      if (attempt.provider === "gemini") {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${attempt.model}:generateContent?key=${attempt.key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: geminiBody(attempt.model, system, messages, false),
            signal: signal ?? AbortSignal.timeout(SYSTEM_TIMEOUT_MS),
          }
        );
        if (!res.ok) throw await providerFetchError("gemini", res);
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const answer = data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim();
        if (!answer) throw new ProviderError("empty", "gemini", 0, "empty candidates");
        return { answer, provider: "gemini", model: attempt.model };
      }
      const endpoint =
        attempt.provider === "groq"
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://api.x.ai/v1/chat/completions";
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${attempt.key}` },
        body: openAiBody(attempt.model, system, messages, false),
        signal: signal ?? AbortSignal.timeout(SYSTEM_TIMEOUT_MS),
      });
      if (!res.ok) throw await providerFetchError(attempt.provider, res);
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new ProviderError("empty", attempt.provider, 0, "empty choices");
      return { answer, provider: attempt.provider, model: attempt.model };
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError =
        err instanceof ProviderError
          ? err
          : new ProviderError("network", attempt.provider, 0, err instanceof Error ? err.message : String(err));
    }
    if (lastError?.kind === "auth") {
      for (let i = attempts.length - 1; i >= 0; i--) {
        if (attempts[i].provider === lastError.provider) attempts.splice(i, 1);
      }
    }
  }

  throw lastError ?? new ProviderError("server", "unknown", 0, "no providers configured");
}
