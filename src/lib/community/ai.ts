// Universal OpenAI-compatible caller for 9 providers (incl. keyless Pollinations) with automatic fallback.
// If a bot's primary provider fails (rate limit, dead key, timeout), the next
// provider in the chain answers instead — bots never go silent.
// AI keys are provided via Vercel environment variables (never in code).

const PROVIDERS: Record<string, any> = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyEnv: 'GEMINI_API_KEY',
    model: 'gemini-flash-latest',
  },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', keyEnv: 'GROQ_API_KEY', model: 'llama-3.3-70b-versatile' },
  grok: { url: 'https://api.x.ai/v1/chat/completions', keyEnv: 'GROK_API_KEY', model: 'grok-3-mini' },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    model: 'meta-llama/llama-3.3-70b-instruct',
    extraHeaders: { 'HTTP-Referer': 'https://gu-mo.vercel.app', 'X-Title': 'Telegram AI Community' },
  },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', keyEnv: 'MISTRAL_API_KEY', model: 'ministral-8b-latest' },
  huggingface: { url: 'https://router.huggingface.co/v1/chat/completions', keyEnv: 'HF_API_KEY', model: 'meta-llama/Llama-3.3-70B-Instruct' },
  cohere: { url: 'https://api.cohere.ai/compatibility/v1/chat/completions', keyEnv: 'COHERE_API_KEY', model: 'command-r7b-12-2024' },
  cloudflare: {
    url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID || ''}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    keyEnv: 'CF_API_TOKEN',
    model: '@cf/meta/llama-3.1-8b-instruct',
    unwrap: 'result',
  },
  pollinations: {
    // Keyless community endpoint (GPT4Free-style) — no API key needed.
    url: 'https://text.pollinations.ai/openai',
    keyEnv: '',
    model: 'openai-fast',
  },
};

// Global fallback order (verified-working providers first)
const CHAIN = ['gemini', 'openrouter', 'mistral', 'huggingface', 'cohere', 'cloudflare', 'pollinations', 'grok', 'groq'];

const stats = new Map<string, any>();

function modelFor(name: string): string {
  return process.env[`MODEL_${name.toUpperCase()}`] || PROVIDERS[name].model;
}

function bump(name: string, ok: boolean, err?: string): void {
  const s = stats.get(name) || { ok: 0, fail: 0, lastError: null as string | null };
  if (ok) s.ok++;
  else {
    s.fail++;
    s.lastError = String(err || '').slice(0, 120);
  }
  stats.set(name, s);
}

export function statsView(): Record<string, any> {
  return Object.fromEntries([...stats.entries()].map(([k, v]) => [k, { ...v }]));
}

async function callOne(name: string, messages: any[], opts: { maxTokens: number; temperature: number }): Promise<string> {
  const cfg = PROVIDERS[name];
  const key = cfg.keyEnv ? process.env[cfg.keyEnv] : 'keyless';
  if (!key) throw new Error('missing API key env: ' + cfg.keyEnv);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.keyEnv ? { authorization: `Bearer ${key}` } : {}),
        ...(cfg.extraHeaders || {}),
      },
      body: JSON.stringify({ model: modelFor(name), messages, max_tokens: opts.maxTokens, temperature: opts.temperature }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).replace(/\s+/g, ' ').slice(0, 140)}`);
    const j: any = await res.json();
    const body = cfg.unwrap && j[cfg.unwrap] ? j[cfg.unwrap] : j;
    const txt = body.choices?.[0]?.message?.content;
    if (!txt) throw new Error('empty completion');
    return txt;
  } finally {
    clearTimeout(t);
  }
}

export async function chat(provider: string, messages: any[], opts: any = {}): Promise<string> {
  const maxTokens = opts.maxTokens ?? 220;
  const temperature = opts.temperature ?? 0.9;
  const budgetMs = opts.budgetMs ?? 24000;
  const t0 = Date.now();
  const order = [provider, ...CHAIN.filter((p) => p !== provider)];
  let lastErr: any = new Error('no provider configured');
  for (const p of order) {
    if (!PROVIDERS[p]) continue;
    if (Date.now() - t0 > budgetMs) break;
    try {
      const out = await callOne(p, messages, { maxTokens, temperature });
      bump(p, true);
      return out;
    } catch (e: any) {
      bump(p, false, e?.message);
      lastErr = e;
      console.error(`[ai] ${p} failed:`, e?.message);
    }
  }
  throw lastErr;
}
