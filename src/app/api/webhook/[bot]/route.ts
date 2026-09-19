// One endpoint for every bot: /api/webhook/<bot-id>
// Telegram AI Community engine v2 — real interaction, hard anti-loop caps.
import { NextResponse } from 'next/server';
import { getBot, WEBHOOK_SECRET } from '@/lib/community/config';
import { handleUpdate } from '@/lib/community/brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request, ctx: any) {
  const { bot } = await ctx.params;
  return NextResponse.json({ ok: true, service: 'telegram-ai-community', version: 2, bot: bot || null, time: new Date().toISOString() });
}

export async function POST(req: Request, ctx: any) {
  const { bot: slug } = await ctx.params;

  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: 'bad-secret' }, { status: 401 });
  }

  const bot = getBot(slug);
  if (!bot) {
    return NextResponse.json({ ok: true, skipped: 'unknown-bot' });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const result = await handleUpdate(bot, body);
    return NextResponse.json({ ok: true, bot: slug, ...(result || {}) });
  } catch (e: any) {
    console.error('[webhook] unhandled', slug, e?.message);
    return NextResponse.json({ ok: true, error: 'internal' });
  }
}
