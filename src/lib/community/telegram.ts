// Thin Telegram Bot API helpers (zero dependencies)
export async function tg(token: string, method: string, params: any = {}, timeoutMs = 15000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    const j: any = await res.json().catch(() => ({}));
    if (!j.ok) throw new Error(`tg.${method} -> ${j.error_code || res.status} ${j.description || ''}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

export async function sendMessage(token: string, chatId: any, text: string, opts: { replyTo?: number } = {}): Promise<any> {
  try {
    const params: any = { chat_id: chatId, text: String(text).slice(0, 3800), disable_web_page_preview: true };
    if (opts.replyTo) params.reply_parameters = { message_id: opts.replyTo, allow_sending_without_reply: true };
    return await tg(token, 'sendMessage', params);
  } catch (e: any) {
    console.error('[tg] sendMessage failed:', e?.message);
    return null;
  }
}

export async function sendTyping(token: string, chatId: any): Promise<void> {
  try {
    await tg(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  } catch {
    /* non-critical */
  }
}
