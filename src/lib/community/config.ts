// Bot registry loaded from environment (BOTS_JSON)
function parseBots(): any[] {
  try {
    const arr = JSON.parse(process.env.BOTS_JSON || '[]');
    return Array.isArray(arr) ? arr.filter((b: any) => b && b.token && b.id) : [];
  } catch (e: any) {
    console.error('[config] BOTS_JSON parse failed:', e?.message);
    return [];
  }
}

export const BOTS: any[] = parseBots();

export function getBot(slug: string): any {
  return BOTS.find((b: any) => b.id === slug) || null;
}

export function primaryBot(): any {
  return BOTS.find((b: any) => b.primary) || BOTS[0] || null;
}
