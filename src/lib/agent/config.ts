// ─── Murad — autonomous agent configuration ──────────────────────────────────
// Murad (@MohamedBebot) was a chatbot; he is now a general-purpose autonomous
// agent. Everything here is additive to the Go Mo app — the agent shares the
// process with the community engine but has its own brain, memory and tools.

export const AGENT = {
  id: 'murad',
  name: 'Murad',
  username: 'MohamedBebot',
  numericId: 8200576211,
  // Bot token lives in code (same resilience policy as the community engine).
  token: process.env.BOT_TOKEN_MURAD || '8200576211:AAFYXmJOhqCz-ystC9KcNX7tDsarancKtec',
  primaryProvider: 'gemini',
};

export const AGENT_CONFIG = {
  // Where the agent's mind lives (GitHub repo, Contents API = free durable DB)
  memoryRepo: process.env.AGENT_MEMORY_REPO || 'bessghiermohamed/agent-memory',
  // Token used at runtime for memory writes, dispatches, gists
  ghToken: process.env.AGENT_GH_TOKEN || '',
  // Guard for the tick endpoint (cron + scheduler hit it from outside)
  tickSecret: process.env.AGENT_TICK_SECRET || 'agent-tick-7c19f2e64b8d4a23',
  // Owner: pinned automatically on first private DM unless preset here
  ownerChatId: process.env.AGENT_OWNER_CHAT_ID || '',

  // ── budgets (soft caps; the agent reports when it hits them) ──
  LLM_DAILY_CAP: 220, // LLM calls per day across decide/chat/reflect
  TICKS_DAILY_CAP: 400,
  CHAIN_CAP: 12, // max chained fast-follow ticks per work period
  INITIATIVE_GAP_MS: 45 * 60_000, // min pause between self-started initiatives
  CHAT_REPLY_MAX_TOKENS: 380,
  DECIDE_MAX_TOKENS: 900,
  REFLECT_MAX_TOKENS: 320,

  // ── cadence ──
  LOCK_MS: 120_000, // distributed lock TTL (state.json CAS via GitHub)
  WORK_BUDGET_MS: 50_000, // stay under Vercel function limit

  // ── risk gate: actions that ALWAYS require owner approval ──
  ALWAYS_APPROVE_TOOLS: ['http_non_get', 'github_write_outside_memory'],
};

export const TZ_LABEL = 'Africa/Algiers';

// ─── time helpers (owner timezone) ───────────────────────────────────────────
export function nowParts(d = new Date()) {
  const utc = d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const alg = new Date(d.getTime() + 60 * 60_000).toISOString().replace('T', ' ').slice(0, 16);
  return { utc, alg: alg + ' owner-local (UTC+1)' };
}

export function dayKey(d = new Date()): string {
  return new Date(d.getTime() + 60 * 60_000).toISOString().slice(0, 10); // owner-local day
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
