// Warm in-memory conversation store + rate limiting.
// Context survives while the serverless instance is warm; on cold starts the
// bot still has the triggering message + reply chain, so nothing breaks.
const chats = new Map<string, any>();
const MAX_HISTORY = 24;

function state(chatId: any): any {
  let st = chats.get(chatId);
  if (!st) {
    st = { history: [], botMsgTimes: [], botLast: {} };
    chats.set(chatId, st);
  }
  return st;
}

export function addMessage(chatId: any, m: any): void {
  const st = state(chatId);
  st.history.push({ ...m, ts: Date.now() });
  if (st.history.length > MAX_HISTORY) st.history.splice(0, st.history.length - MAX_HISTORY);
}

export function recent(chatId: any, n = 12): any[] {
  return state(chatId).history.slice(-n);
}

// per-bot cooldown: 5s; per-chat flood cap: 10 bot messages / minute
export function canBotSpeak(chatId: any, botId: string): boolean {
  const st = state(chatId);
  const now = Date.now();
  if (now - (st.botLast[botId] || 0) < 5000) return false;
  return st.botMsgTimes.filter((t: number) => now - t < 60000).length < 10;
}

export function markBotSpeak(chatId: any, botId: string): void {
  const st = state(chatId);
  const now = Date.now();
  st.botLast[botId] = now;
  st.botMsgTimes.push(now);
  st.botMsgTimes = st.botMsgTimes.filter((t: number) => now - t < 60000);
}
