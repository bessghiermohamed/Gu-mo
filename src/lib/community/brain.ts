// The orchestrator: decides who answers, generates replies, relays bot-to-bot
// chatter (Telegram hides bot-to-bot messages, so this is done server-side),
// and enforces anti-loop / anti-spam guards everywhere.

import { BOTS, primaryBot } from './config';
import { chat, statsView } from './ai';
import { sendMessage, sendTyping } from './telegram';
import { addMessage, recent, canBotSpeak, markBotSpeak } from './memory';
import { systemPrompt, taglineOf } from './personas';

const CHATTER_CHANCE = numEnv('CHATTER_CHANCE', 55); // % chance a generic group message gets a spontaneous reply
const RELAY_CHANCE = numEnv('RELAY_CHANCE', 35); // % chance a second bot chimes in after the first
const MAX_CHAIN = numEnv('MAX_CHAIN', 1); // extra bot replies after the first responder
const RESPONSE_BUDGET_MS = numEnv('RESPONSE_BUDGET_MS', 22000);

const seenUpdates = new Set<any>();

function numEnv(k: string, d: number): number {
  const n = parseInt(process.env[k] || '', 10);
  return Number.isFinite(n) ? n : d;
}

function fnv(str: any): number {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0) || 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Deterministic election so all webhook handlers agree on ONE responder
function elect(chatId: any, messageId: any): number {
  return fnv(`${chatId}:${messageId}`) % Math.max(BOTS.length, 1);
}

function truncate(t: any, n: number): string {
  t = String(t || '');
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  if (t.length > 700) t = t.slice(0, 699) + '…';
  return t || null;
}

export async function handleUpdate(bot: any, update: any): Promise<any> {
  if (isDupUpdate(update.update_id)) return { skipped: 'duplicate' };
  const msg = update.message;
  if (!msg || !msg.chat) return { skipped: 'not-a-message' };
  const text = (msg.text || msg.caption || '').trim();
  if (!text) return { skipped: 'no-text' };
  if (msg.from?.is_bot) return { skipped: 'from-bot' };

  // every bot instance records the human message -> shared context
  addMessage(msg.chat.id, { who: msg.from?.first_name || 'Human', text: truncate(text, 500), msgId: msg.message_id, fromBot: false });

  // 1:1 chat: always answer
  if (msg.chat.type === 'private') {
    return respondOnce(bot, msg, { force: true, chainDepth: 0, triggerText: text, allowRelay: false });
  }

  // ---- group chat ----
  const cmd = parseCommand(text);
  const uname = bot.username ? '@' + bot.username : null;
  const mentioned = !!(uname && text.includes(uname));
  const replyToBot = !!(msg.reply_to_message?.from?.username && msg.reply_to_message.from.username === bot.username);

  if (cmd) {
    if (cmd.forBot && cmd.forBot !== bot.username) return { skipped: 'command-for-other-bot' };
    if (cmd.forBot) return runCommand(bot, msg, cmd, text);
    // bare command: deterministic election so exactly one bot acts
    if (cmd.name === 'ask' || cmd.name === 'status') {
      if (primaryBot()?.id === bot.id) return runCommand(bot, msg, cmd, text);
      return { skipped: 'not-elected-for-command' };
    }
    if (elect(msg.chat.id, msg.message_id) !== BOTS.findIndex((b: any) => b.id === bot.id)) return { skipped: 'not-elected-for-command' };
    return runCommand(bot, msg, cmd, text);
  }

  if (mentioned || replyToBot) {
    return respondOnce(bot, msg, { force: true, chainDepth: 0, triggerText: text.replace(uname || '␀', '').trim(), allowRelay: true });
  }

  // generic chatter: one elected bot replies with CHATTER_CHANCE probability
  if (elect(msg.chat.id, msg.message_id) !== BOTS.findIndex((b: any) => b.id === bot.id)) return { skipped: 'not-elected' };
  if (fnv(`chance:${msg.chat.id}:${msg.message_id}`) % 100 >= CHATTER_CHANCE) return { skipped: 'chance-gate' };
  if (!canBotSpeak(msg.chat.id, bot.id)) return { skipped: 'rate-limited' };
  return respondOnce(bot, msg, { force: false, chainDepth: 0, triggerText: text, allowRelay: true });
}

function parseCommand(text: string): any {
  const m = /^\/([a-zA-Z0-9_]+)(?:@([A-Za-z0-9_]+))?\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  return { name: m[1].toLowerCase(), forBot: m[2] || null, args: (m[3] || '').trim() };
}

async function runCommand(bot: any, msg: any, cmd: any, rawText: string): Promise<any> {
  const chatId = msg.chat.id;
  switch (cmd.name) {
    case 'start':
    case 'help': {
      const squad = BOTS.map((b: any) => `• ${b.name} — ${taglineOf(b)}${b.primary ? ' (captain)' : ''}`).join('\n');
      const t = [
        '🤖 Welcome to the AI Community',
        squad,
        '',
        '• Just chat — we jump in on our own, or @mention one of us',
        '• /ask <question> — the captain answers',
        '• /debate <topic> — we argue it out for you',
        '• /status — system health · /ping — am I alive?',
        'Tip: if a command gets no answer in a group, use the /ask@BotUsername form.',
      ].join('\n');
      await sendMessage(bot.token, chatId, t, { replyTo: msg.message_id });
      return { ok: 'help' };
    }
    case 'ping': {
      await sendMessage(bot.token, chatId, `pong ✅ ${bot.name} is alive`, { replyTo: msg.message_id });
      return { ok: 'ping' };
    }
    case 'ask': {
      const trigger = cmd.args || 'Say hi to the group in one sentence and tell them they can /ask you anything.';
      return respondOnce(bot, msg, { force: true, chainDepth: 0, triggerText: trigger, allowRelay: false, commandMode: true });
    }
    case 'status': {
      const sv = statsView();
      const prov = Object.entries(sv).map(([p, s]: [string, any]) => `${p} ✓${s.ok}/✗${s.fail}`).join(' · ') || 'no AI calls yet on this instance';
      const t = [
        '📊 Community status',
        `• Bots online: ${BOTS.length} — ${BOTS.map((b: any) => b.name).join(', ')}`,
        `• Providers: ${prov}`,
        `• Chatter chance: ${CHATTER_CHANCE}% · relay: ${RELAY_CHANCE}% · max chain: ${MAX_CHAIN}`,
        '• This reply is proof the webhook pipeline works.',
      ].join('\n');
      await sendMessage(bot.token, chatId, t, { replyTo: msg.message_id });
      return { ok: 'status' };
    }
    case 'debate':
      return debate(bot, msg, cmd.args || 'Is pineapple on pizza acceptable? Settle it once and for all.');
    default:
      // unknown command -> treat like a normal mention
      return respondOnce(bot, msg, { force: true, chainDepth: 0, triggerText: rawText, allowRelay: true });
  }
}

async function respondOnce(bot: any, msg: any, opts: any): Promise<any> {
  const { force, chainDepth, triggerText, allowRelay, commandMode } = opts;
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type !== 'private';
  const started = Date.now();
  if (!force && !canBotSpeak(chatId, bot.id)) return { skipped: 'rate-limited' };

  sendTyping(bot.token, chatId);
  let raw: string;
  try {
    raw = await generate(bot, msg, triggerText, { relay: chainDepth > 0, commandMode });
  } catch (e: any) {
    console.error('[brain] generate failed for', bot.id, e?.message);
    if (chainDepth === 0) await sendMessage(bot.token, chatId, '😵 my brain glitched for a second — try again', { replyTo: msg.message_id });
    return { error: 'generate-failed' };
  }
  const text = sanitize(raw, bot);
  if (!text) return { skipped: 'empty-reply' };
  const recentBotMsgs = recent(chatId, 4).filter((m: any) => m.fromBot);
  if (recentBotMsgs.some((m: any) => m.text.trim() === text.trim())) return { skipped: 'duplicate-reply' };

  const sent = await sendMessage(bot.token, chatId, text, { replyTo: isGroup ? msg.message_id : undefined });
  markBotSpeak(chatId, bot.id);
  addMessage(chatId, { who: bot.name, text, msgId: sent?.result?.message_id, fromBot: true, botId: bot.id });

  // relay: another bot may naturally chime in (bounded by MAX_CHAIN)
  if (isGroup && allowRelay && chainDepth < MAX_CHAIN && Date.now() - started < RESPONSE_BUDGET_MS && Math.random() * 100 < RELAY_CHANCE) {
    const others = BOTS.filter((b: any) => b.id !== bot.id && canBotSpeak(chatId, b.id));
    if (others.length > 0) {
      const next = others[Math.floor(Math.random() * others.length)];
      await sleep(400 + Math.floor(Math.random() * 700));
      await respondOnce(next, msg, { force: true, chainDepth: chainDepth + 1, triggerText, allowRelay: true });
    }
  }
  return { ok: true, bot: bot.id, chars: text.length };
}

async function generate(bot: any, msg: any, triggerText: string, modeInfo: { relay: boolean; commandMode?: boolean }): Promise<string> {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type !== 'private';
  const others = BOTS.filter((b: any) => b.id !== bot.id).map((b: any) => b.name).join(', ');
  const hist = recent(chatId, 12)
    .map((m: any) => `${m.fromBot ? `${m.who} [bot]` : `${m.who} [human]`}: ${truncate(m.text, 300)}`)
    .join('\n');
  const replyHint = msg.reply_to_message?.text ? `\n(The human is replying to: "${truncate(msg.reply_to_message.text, 150)}")` : '';

  let user = `Recent conversation:\n${hist || '(empty)'}\n${replyHint}\n\n`;
  if (modeInfo.relay) {
    user += 'Nobody addressed you directly — you are naturally jumping into the conversation on your own. React to the latest messages: agree, joke, add a take or playfully disagree. Keep it to 1-2 short sentences.';
  } else if (modeInfo.commandMode) {
    user += `You were triggered by a command. Respond to this request: "${truncate(triggerText, 500)}"`;
  } else {
    user += `The latest message is directed at you (or you were chosen to reply). It says: "${truncate(triggerText, 500)}". Respond to it directly and naturally.`;
  }
  user += `\n\nNow reply as ${bot.name}. Output ONLY the reply text, nothing else.`;

  return chat(
    bot.provider,
    [
      { role: 'system', content: systemPrompt(bot, others, isGroup) },
      { role: 'user', content: user },
    ],
    { maxTokens: 220, temperature: 0.9 }
  );
}

async function debate(bot: any, msg: any, topic: string): Promise<any> {
  const chatId = msg.chat.id;
  const started = Date.now();
  const panel = [bot, ...BOTS.filter((b: any) => b.id !== bot.id)].slice(0, 3);
  await sendMessage(bot.token, chatId, `⚔️ Debate night: "${topic}"\nPanel: ${panel.map((b: any) => b.name).join(' vs ')}`);
  addMessage(chatId, { who: 'System', text: `A debate started. Topic: ${topic}`, fromBot: false });

  for (let i = 0; i < panel.length; i++) {
    const b = panel[i];
    if (Date.now() - started > RESPONSE_BUDGET_MS - 6000) break;
    sendTyping(b.token, chatId);
    const hist = recent(chatId, 12)
      .map((m: any) => `${m.fromBot ? `${m.who} [bot]` : `${m.who} [human]`}: ${truncate(m.text, 250)}`)
      .join('\n');
    const others = BOTS.filter((x: any) => x.id !== b.id).map((x: any) => x.name).join(', ');
    const sys = systemPrompt(b, others, true) + '\nYou are on a friendly debate panel. Stay sharp but good-humored.';
    const user = `Debate topic: ${topic}\n\nConversation so far:\n${hist || '(nothing yet)'}\n\nGive your take in max 3 sentences. ${
      i === 0 ? 'Open the debate with your strongest point.' : 'Respond to the previous arguments — push back, tease, and add your own point.'
    } Output only your reply text.`;
    try {
      const raw = await chat(b.provider, [{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 200, temperature: 0.95 });
      const text = sanitize(raw, b);
      if (!text) continue;
      const sent = await sendMessage(b.token, chatId, text);
      markBotSpeak(chatId, b.id);
      addMessage(chatId, { who: b.name, text, msgId: sent?.result?.message_id, fromBot: true, botId: b.id });
    } catch (e: any) {
      console.error('[brain] debate turn failed', b.id, e?.message);
    }
  }
  return { ok: 'debate' };
}
