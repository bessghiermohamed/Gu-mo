// The v2 orchestrator — "behave like real members, never like a loop".
//
// Core principles (fixing v1's failures):
//  1. ALWAYS answer when addressed: @mention, reply-to-my-message, private
//     chat, or a command aimed at me. This is the behavior users trusted.
//  2. REAL bot-to-bot interaction: bots respond to each other's actual
//     Telegram messages (v1 ignored them and faked "relays", which felt like
//     loops). When another bot brings me in, I react to what IT said.
//  3. Hard anti-loop caps, enforced independently on every instance:
//       - a bot is never the 3rd consecutive community message
//       - 75s cooldown before rejoining another bot-led exchange
//       - replies to bot triggers NEVER mention other bots (chains die here)
//       - one deterministic election decides the single responder for
//         unaddressed chatter — no pile-ons, no cross-triggering
//  4. Spontaneous participation: the elected bot may freely join general
//     human chatter (question 70% / casual 55%), so the chat feels alive.

import { BOTS, botIndex, TUNING, type BotConfig } from './config';
import { chat, statsView } from './ai';
import { sendMessage, sendTyping } from './telegram';
import {
  addMessage,
  recent,
  canBotSpeak,
  markBotSpeak,
  trailingBotMessages,
  lastBotTriggeredReplyAt,
  markBotTriggeredReply,
} from './memory';
import { systemPrompt, taglineOf } from './personas';

const seenUpdates = new Set<any>();
const RESPONSE_BUDGET_MS = 22000;

function fnv(str: any): number {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0) || 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Deterministic election so every bot instance agrees on ONE responder
function elect(chatId: any, messageId: any): number {
  return fnv(`${chatId}:${messageId}`) % Math.max(BOTS.length, 1);
}

function truncate(t: any, n: number): string {
  t = String(t || '');
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

function isDupUpdate(id: any): boolean {
  if (id == null) return false;
  if (seenUpdates.has(id)) return true;
  seenUpdates.add(id);
  if (seenUpdates.size > 1000) {
    let i = 0;
    for (const v of seenUpdates) {
      seenUpdates.delete(v);
      if (++i >= 500) break;
    }
  }
  return false;
}

function sanitize(raw: any, bot: any): string | null {
  let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const esc = bot.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  t = t.replace(new RegExp(`^${esc}\\s*[:\\-—]\\s*`, 'i'), '');
  t = t.replace(/\*\*/g, '').replace(/^#{1,4}\s*/gm, '').replace(/`{1,3}/g, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > TUNING.MAX_REPLY_CHARS) t = t.slice(0, TUNING.MAX_REPLY_CHARS - 1) + '…';
  return t || null;
}

// ─── mention helpers ─────────────────────────────────────────────────────────
function indexOfBotMention(text: string, username: string): number {
  return text.toLowerCase().indexOf('@' + username.toLowerCase());
}

// all bots mentioned in the text, ordered by first appearance
function mentionedBots(text: string): BotConfig[] {
  return BOTS.map((b) => ({ b, pos: indexOfBotMention(text, b.username) }))
    .filter((x) => x.pos >= 0)
    .sort((x, y) => x.pos - y.pos)
    .map((x) => x.b);
}

function isReplyToMe(msg: any, bot: BotConfig): boolean {
  const r = msg.reply_to_message?.from;
  if (!r) return false;
  return r.id === bot.numericId || (!!r.username && r.username.toLowerCase() === bot.username.toLowerCase());
}

// Enforce the mention budget:
//  - never mention myself
//  - replying to a bot trigger -> strip ALL bot mentions (chain killer)
//  - replying to a human -> at most ONE bot mention, extras become names
function enforceMentionBudget(text: string, bot: BotConfig, botTriggered: boolean): string | null {
  let t = text;
  const ownRe = new RegExp(`@${bot.username}\\b`, 'gi');
  t = t.replace(ownRe, bot.name);
  const others = BOTS.filter((b) => b.id !== bot.id);
  let kept = 0;
  // replace mentions one by one, earliest first
  const found = others
    .map((b) => ({ b, pos: indexOfBotMention(t, b.username) }))
    .filter((x) => x.pos >= 0)
    .sort((x, y) => x.pos - y.pos);
  let delta = 0;
  for (const f of found) {
    const at = f.pos + delta;
    const tag = '@' + f.b.username;
    const allow = !botTriggered && kept < 1;
    if (allow) {
      kept++;
      delta += 0; // mention stays
      continue;
    }
    t = t.slice(0, at) + f.b.name + t.slice(at + tag.length);
    delta += f.b.name.length - tag.length;
  }
  t = t.trim();
  if (!t) return null;
  return t;
}

// ─── main entry ──────────────────────────────────────────────────────────────
export async function handleUpdate(bot: BotConfig, update: any): Promise<any> {
  // update_ids are assigned PER BOT by Telegram, and all webhook routes share
  // one Node process — so the dedupe key must include the bot id, otherwise
  // one bot's update would silently swallow another bot's update.
  if (isDupUpdate(`${bot.id}:${update.update_id}`)) return { skipped: 'duplicate' };
  const msg = update.message;
  if (!msg || !msg.chat) return { skipped: 'not-a-message' };
  const text = (msg.text || msg.caption || '').trim();
  if (!text) return { skipped: 'no-text' };
  const from = msg.from || {};
  if (from.id === bot.numericId) return { skipped: 'self' };
  // stale-update guard: never react to messages older than 10 minutes
  if (msg.date && Date.now() / 1000 - msg.date > 600) return { skipped: 'stale' };

  const chatId = msg.chat.id;
  const isGroup = msg.chat.type !== 'private';
  const fromBot = !!from.is_bot;

  // every instance records every message it can see -> shared context
  addMessage(chatId, {
    who: from.first_name || from.username || (fromBot ? 'Bot' : 'Human'),
    text: truncate(text, 500),
    msgId: msg.message_id,
    fromBot,
    botId: from.username || undefined,
  });

  // ── bot-originated message: real interaction, heavily capped ──
  if (fromBot) {
    if (!isGroup) return { skipped: 'bot-in-private' };
    const addressedToMe = mentionedBots(text).some((b) => b.id === bot.id) || isReplyToMe(msg, bot);
    if (!addressedToMe) return { skipped: 'bot-not-addressed' };
    if (trailingBotMessages(chatId) >= TUNING.TRAILING_BOT_CAP) return { skipped: 'chain-cap' };
    if (Date.now() - lastBotTriggeredReplyAt(chatId, bot.id) < TUNING.BOT_TRIGGER_COOLDOWN_MS)
      return { skipped: 'bot-trigger-cooldown' };
    return respond(bot, msg, { botTriggered: true, force: true });
  }

  // ── human message ──
  if (!isGroup) {
    const cmd = parseCommand(text);
    if (cmd) return runCommand(bot, msg, cmd, text);
    return respond(bot, msg, { botTriggered: false, force: true });
  }

  const uname = '@' + bot.username;
  const mentioned = text.toLowerCase().includes(uname.toLowerCase());
  const replyToMe = isReplyToMe(msg, bot);

  const cmd = parseCommand(text);
  if (cmd) {
    if (cmd.forBot && cmd.forBot.toLowerCase() !== bot.username.toLowerCase())
      return { skipped: 'command-for-other-bot' };
    if (cmd.forBot) return runCommand(bot, msg, cmd, text);
    // bare command: deterministic election so exactly one bot acts
    if ((cmd.name === 'ask' || cmd.name === 'status') && botIndex(bot.id) !== 0)
      return { skipped: 'not-elected-for-command' };
    if (cmd.name !== 'ask' && cmd.name !== 'status' && elect(chatId, msg.message_id) !== botIndex(bot.id))
      return { skipped: 'not-elected-for-command' };
    return runCommand(bot, msg, cmd, text);
  }

  if (mentioned || replyToMe) {
    // if several bots are mentioned, only the FIRST one answers (no pile-on)
    const mb = mentionedBots(text);
    if (mb.length > 1 && mb[0].id !== bot.id) return { skipped: 'another-bot-mentioned-first' };
    return respond(bot, msg, { botTriggered: false, force: true });
  }

  // ── spontaneous participation (elected bot only) ──
  if (elect(chatId, msg.message_id) !== botIndex(bot.id)) return { skipped: 'not-elected' };
  const isQuestion = /\?|؟|？/.test(text);
  const chance = isQuestion ? TUNING.QUESTION_CHANCE : TUNING.CHATTER_CHANCE;
  if (fnv(`chance:${chatId}:${msg.message_id}`) % 100 >= chance) return { skipped: 'chance-gate' };
  if (!canBotSpeak(chatId, bot.id)) return { skipped: 'rate-limited' };
  return respond(bot, msg, { botTriggered: false, force: false, spontaneous: true });
}

// ─── reply generation ────────────────────────────────────────────────────────
async function respond(
  bot: BotConfig,
  msg: any,
  opts: { botTriggered: boolean; force: boolean; spontaneous?: boolean; triggerOverride?: string }
): Promise<any> {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type !== 'private';
  const text = (opts.triggerOverride || msg.text || msg.caption || '').trim();
  if (!opts.force && !canBotSpeak(chatId, bot.id)) return { skipped: 'rate-limited' };

  sendTyping(bot.token, chatId);
  let raw: string;
  try {
    raw = await generate(bot, msg, text, { botTriggered: opts.botTriggered, spontaneous: !!opts.spontaneous });
  } catch (e: any) {
    console.error('[brain] generate failed for', bot.id, e?.message);
    if (!opts.botTriggered && isGroup)
      await sendMessage(bot.token, chatId, 'my brain glitched for a second — say that again?', { replyTo: msg.message_id });
    return { error: 'generate-failed' };
  }
  let out = sanitize(raw, bot);
  if (out) out = enforceMentionBudget(out, bot, opts.botTriggered);
  if (!out) return { skipped: 'empty-reply' };

  const recentMsgs = recent(chatId, 4);
  if (recentMsgs.some((m: any) => m.text.trim() === out.trim())) return { skipped: 'duplicate-reply' };

  const sent = await sendMessage(bot.token, chatId, out, { replyTo: isGroup ? msg.message_id : undefined });
  markBotSpeak(chatId, bot.id);
  addMessage(chatId, { who: bot.name, text: out, msgId: sent?.result?.message_id, fromBot: true, botId: bot.username });
  if (opts.botTriggered) markBotTriggeredReply(chatId, bot.id);
  return { ok: true, bot: bot.id, mode: opts.botTriggered ? 'bot-to-bot' : opts.spontaneous ? 'spontaneous' : 'addressed', chars: out.length };
}

async function generate(
  bot: BotConfig,
  msg: any,
  triggerText: string,
  mode: { botTriggered: boolean; spontaneous: boolean }
): Promise<string> {
  const others = BOTS.filter((b: any) => b.id !== bot.id);
  const otherList = others.map((b: any) => `@${b.username} (${b.name})`).join(', ');
  const hist = recent(msg.chat.id, TUNING.HISTORY_MESSAGES)
    .map((m: any) => `${m.fromBot ? `${m.who} [bot]` : `${m.who} [human]`}: ${truncate(m.text, 300)}`)
    .join('\n');
  const replyHint = msg.reply_to_message?.text
    ? `\n(Replying to: "${truncate(msg.reply_to_message.text, 150)}")`
    : '';

  let user = `Recent conversation:\n${hist || '(empty)'}\n${replyHint}\n\n`;
  if (mode.botTriggered) {
    user += `Another member (${msg.from?.first_name || 'a bot'}, a bot) just brought you into this by mentioning or replying to you. React to what THEY actually said: answer it, agree, push back or tease — naturally, like a real group member. Keep it to 1-2 short sentences. Do NOT address the whole group and do NOT drag anyone else in: do not mention other bots by @username in this reply.`;
  } else if (mode.spontaneous) {
    user += `Nobody addressed you directly — you are freely and spontaneously joining the conversation on your own. React to the latest messages: a quick take, a fun fact, a joke, honest agreement or disagreement. Keep it to 1-2 short sentences. Only mention another member by @username if it is genuinely relevant (available: ${otherList}).`;
  } else {
    user += `The latest message is directed at you. It says: "${truncate(triggerText, 500)}". Respond to it directly, helpfully and naturally — understand what the person actually needs and deliver it. If — and only if — another member is genuinely the better fit for part of the answer, you may bring in ONE of them by @username (${otherList}); otherwise mention nobody.`;
  }
  user += `\n\nNow reply as ${bot.name}. Output ONLY the reply text, nothing else.`;

  return chat(
    bot.provider,
    [
      { role: 'system', content: systemPrompt(bot, otherList, msg.chat.type !== 'private') },
      { role: 'user', content: user },
    ],
    { maxTokens: 220, temperature: 0.9 }
  );
}

// ─── commands ────────────────────────────────────────────────────────────────
function parseCommand(text: string): any {
  const m = /^\/([a-zA-Z0-9_]+)(?:@([A-Za-z0-9_]+))?\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  return { name: m[1].toLowerCase(), forBot: m[2] || null, args: (m[3] || '').trim() };
}

async function runCommand(bot: BotConfig, msg: any, cmd: any, rawText: string): Promise<any> {
  const chatId = msg.chat.id;
  switch (cmd.name) {
    case 'start':
    case 'help': {
      const squad = BOTS.map((b) => `• ${b.name} (@${b.username}) — ${taglineOf(b)}`).join('\n');
      const t = [
        'Welcome to the AI Community',
        squad,
        '',
        'Just chat — we answer when addressed and often join in on our own.',
        '• Mention @botname or reply to any of us -> that bot answers you.',
        '• /ask <question> — the go-to bot answers',
        '• /debate <topic> — the bots argue it out for you',
        '• /status — system health · /ping — am I alive?',
        'Tip: in groups, use /ask@BotUsername form if a bare command gets no answer.',
      ].join('\n');
      await sendMessage(bot.token, chatId, t, { replyTo: msg.message_id });
      return { ok: 'help' };
    }
    case 'ping': {
      await sendMessage(bot.token, chatId, `pong — ${bot.name} is alive`, { replyTo: msg.message_id });
      return { ok: 'ping' };
    }
    case 'ask': {
      const trigger = cmd.args || 'Introduce yourself to the group in one sentence.';
      return respond(bot, msg, { botTriggered: false, force: true, spontaneous: false, triggerOverride: trigger });
    }
    case 'status': {
      const sv = statsView();
      const prov =
        Object.entries(sv)
          .map(([p, s]: [string, any]) => `${p}: ok${s.ok}/fail${s.fail}`)
          .join(' · ') || 'no AI calls yet on this instance';
      const t = [
        'Community status',
        `• Bots online: ${BOTS.length} — ${BOTS.map((b) => b.name).join(', ')}`,
        `• AI providers (this instance): ${prov}`,
        `• Anti-loop: chain cap ${TUNING.TRAILING_BOT_CAP}, bot-trigger cooldown ${Math.round(TUNING.BOT_TRIGGER_COOLDOWN_MS / 1000)}s`,
      ].join('\n');
      await sendMessage(bot.token, chatId, t, { replyTo: msg.message_id });
      return { ok: 'status' };
    }
    case 'debate':
      return debate(bot, msg, cmd.args || 'Is pineapple on pizza acceptable? Settle it once and for all.');
    default:
      // unknown command -> treat like a normal mention
      return respond(bot, msg, { botTriggered: false, force: true });
  }
}

async function debate(bot: BotConfig, msg: any, topic: string): Promise<any> {
  const chatId = msg.chat.id;
  const started = Date.now();
  const panel = [bot, ...BOTS.filter((b) => b.id !== bot.id)].slice(0, 3);
  await sendMessage(bot.token, chatId, `Debate: "${topic}" — panel: ${panel.map((b) => b.name).join(' vs ')}`);
  addMessage(chatId, { who: 'System', text: `A debate started. Topic: ${topic}`, fromBot: false, msgId: 0 });

  for (let i = 0; i < panel.length; i++) {
    const b = panel[i];
    if (Date.now() - started > RESPONSE_BUDGET_MS - 6000) break;
    sendTyping(b.token, chatId);
    const hist = recent(chatId, TUNING.HISTORY_MESSAGES)
      .map((m: any) => `${m.fromBot ? `${m.who} [bot]` : `${m.who} [human]`}: ${truncate(m.text, 250)}`)
      .join('\n');
    const others = BOTS.filter((x) => x.id !== b.id).map((x) => x.name).join(', ');
    const sys = systemPrompt(b, others, true) + '\nYou are on a friendly debate panel. Stay sharp but good-humored.';
    const user = `Debate topic: ${topic}\n\nConversation so far:\n${hist || '(nothing yet)'}\n\nGive your take in max 3 sentences. ${
      i === 0 ? 'Open the debate with your strongest point.' : 'Respond to the previous arguments — push back, tease, and add your own point.'
    } Output only your reply text.`;
    try {
      const raw = await chat(b.provider, [{ role: 'system', content: sys }, { role: 'user', content: user }], {
        maxTokens: 200,
        temperature: 0.95,
      });
      const text = sanitize(raw, b);
      if (!text) continue;
      const sent = await sendMessage(b.token, chatId, text);
      markBotSpeak(chatId, b.id);
      addMessage(chatId, { who: b.name, text, msgId: sent?.result?.message_id, fromBot: true, botId: b.username });
    } catch (e: any) {
      console.error('[brain] debate turn failed', b.id, e?.message);
    }
  }
  return { ok: 'debate' };
}
