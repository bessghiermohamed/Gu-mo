// ─── Telegram AI Community — central configuration ──────────────────────────
// This file is the single source of truth. Edit it on GitHub and the community
// auto-redeploys (sync workflow pushes it into the hosting app).

export interface BotConfig {
  id: string; // webhook slug: /api/webhook/<id>
  token: string;
  numericId: number; // Telegram bot user id (self-detection)
  username: string; // without @
  name: string; // shown in chat
  persona: string; // key in personas.ts
  provider: string; // primary AI provider (fallback chain in ai.ts)
}

// Tokens live in code so the bots can never go silent because of a lost env
// var. Environment variables with the same names still take priority.
// NOTE: murad's token moved to src/lib/agent/config.ts — @MohamedBebot was
// upgraded from chatbot to autonomous agent (see agent/README section).
const TOKENS = {
  reader: process.env.BOT_TOKEN_READER || '8625428136:AAFyplAzqgkM9VtpWSbOdY2ey_2xTHiOjls',
  guyu: process.env.BOT_TOKEN_GUYU || '8816607490:AAFn3_Ir56J0quiMx_LEwnLOwcQhLcDEFS4',
};

export const BOTS: BotConfig[] = [
  {
    id: 'reader',
    token: TOKENS.reader,
    numericId: 8625428136,
    username: 'ens_reader_bot',
    name: 'By Me',
    persona: 'witty',
    provider: 'mistral',
  },
  {
    id: 'guyu',
    token: TOKENS.guyu,
    numericId: 8816607490,
    username: 'Gu_Yu_bot',
    name: 'Gu Yu',
    persona: 'chill',
    provider: 'huggingface',
  },
];

export const WEBHOOK_SECRET: string =
  process.env.WEBHOOK_SECRET || 'aad87fd9ecf4423fc8670fdb9f32bba1022e28eca18a1875';

export function getBot(slug: string): BotConfig | null {
  return BOTS.find((b) => b.id === slug) || null;
}

export function botIndex(id: string): number {
  return BOTS.findIndex((b) => b.id === id);
}

// ─── Behavior tuning ─────────────────────────────────────────────────────────
export const TUNING = {
  CHATTER_CHANCE: 55, // % chance a casual (non-question) human message gets a spontaneous reply
  QUESTION_CHANCE: 70, // % chance a general human question gets answered by the elected bot
  BOT_TRIGGER_COOLDOWN_MS: 75_000, // min pause before the same bot joins another bot-led exchange
  TRAILING_BOT_CAP: 2, // never be the 3rd consecutive bot message in a row (loop killer)
  MAX_REPLY_CHARS: 700,
  HISTORY_MESSAGES: 12,
  OWN_COOLDOWN_MS: 5_000,
  FLOOD_WINDOW_MS: 60_000,
  FLOOD_MAX: 10,
};
