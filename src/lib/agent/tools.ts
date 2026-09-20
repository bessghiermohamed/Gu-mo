// ─── Murad's tools — what the agent can actually DO ──────────────────────────
// Free/open stack only: direct HTTP, DuckDuckGo search, node:vm sandbox,
// GitHub (gists/files/issues), Telegram, and its own memory.
// Every tool: pure function in, structured result out. Risky ones are gated.

import vm from 'node:vm';
import { createGist, createIssue, writeFile as ghWriteFile, dispatchWorkflow } from './github';
import { AGENT_CONFIG } from './config';

// ─── SSRF guard ──────────────────────────────────────────────────────────────
const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i;

function guardUrl(u: string): { url: URL | null; error?: string } {
  try {
    const url = new URL(String(u));
    if (!/^https?:$/.test(url.protocol)) return { url: null, error: 'only http/https allowed' };
    if (BLOCKED_HOST.test(url.hostname)) return { url: null, error: 'private network addresses are blocked' };
    return { url };
  } catch {
    return { url: null, error: 'invalid URL' };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function timedFetch(url: string, init: any, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── individual tools ────────────────────────────────────────────────────────

async function toolWebFetch(args: any): Promise<any> {
  const g = guardUrl(args?.url);
  if (!g.url) return { ok: false, error: g.error };
  try {
    const res = await timedFetch(
      g.url.toString(),
      { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MuradAgent/1.0)', accept: 'text/html,application/json,text/plain,*/*' } },
      14000
    );
    const ctype = res.headers.get('content-type') || '';
    const raw = await res.text();
    const text = ctype.includes('html') ? stripHtml(raw) : raw;
    return { ok: res.ok, status: res.status, url: g.url.toString(), content: text.slice(0, Number(args?.max_chars) || 7000) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

function decodeDdgHref(href: string): string {
  try {
    if (href.startsWith('//')) href = 'https:' + href;
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : u.toString();
  } catch {
    return href;
  }
}

async function toolWebSearch(args: any): Promise<any> {
  const q = String(args?.query || '').slice(0, 300);
  if (!q) return { ok: false, error: 'query required' };
  for (const endpoint of [
    { url: 'https://html.duckduckgo.com/html/', form: true },
    { url: 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q), form: false },
  ]) {
    try {
      const res = await timedFetch(
        endpoint.url,
        endpoint.form
          ? { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0' }, body: `q=${encodeURIComponent(q)}` }
          : { headers: { 'user-agent': 'Mozilla/5.0' } },
        12000
      );
      const html = await res.text();
      const results: any[] = [];
      if (endpoint.form) {
        const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) && results.length < 8) {
          results.push({ title: stripHtml(m[2]).slice(0, 120), url: decodeDdgHref(m[1]), snippet: m[3] ? stripHtml(m[3]).slice(0, 220) : '' });
        }
      } else {
        const re = /<a[^>]+href="(http[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) && results.length < 8) {
          if (/duckduckgo\.com/.test(m[1])) continue;
          results.push({ title: stripHtml(m[2]).slice(0, 120), url: decodeDdgHref(m[1]), snippet: '' });
        }
      }
      if (results.length) return { ok: true, query: q, results };
    } catch {
      /* try next endpoint */
    }
  }
  return { ok: false, error: 'search failed (both DuckDuckGo endpoints)' };
}

async function toolRunCode(args: any): Promise<any> {
  const code = String(args?.code || '');
  if (!code.trim()) return { ok: false, error: 'code required' };
  if (code.length > 8000) return { ok: false, error: 'code too long (max 8000 chars)' };
  const timeoutMs = Math.min(Number(args?.timeout_ms) || 6000, 6000);
  const logs: string[] = [];
  const sandbox: any = {
    console: {
      log: (...a: any[]) => logs.push(a.map((x) => safeStr(x)).join(' ').slice(0, 400)),
    },
    Math,
    JSON,
    Date,
    RegExp,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    Intl,
  };
  try {
    const result = vm.runInNewContext(code, sandbox, { timeout: timeoutMs, displayErrors: true });
    return { ok: true, result: safeStr(result).slice(0, 3000), logs: logs.slice(0, 20) };
  } catch (e: any) {
    return { ok: false, error: `${String(e?.message || e).slice(0, 300)}`, logs: logs.slice(0, 20) };
  }
}

function safeStr(x: any): string {
  try {
    if (typeof x === 'string') return x.slice(0, 500);
    if (x === undefined) return 'undefined';
    return JSON.stringify(x)?.slice(0, 500) ?? String(x);
  } catch {
    return String(x).slice(0, 200);
  }
}

async function toolHttpRequest(args: any): Promise<any> {
  const g = guardUrl(args?.url);
  if (!g.url) return { ok: false, error: g.error };
  const method = String(args?.method || 'GET').toUpperCase();
  try {
    const res = await timedFetch(
      g.url.toString(),
      {
        method,
        headers: { 'user-agent': 'MuradAgent/1.0', ...(args?.headers || {}) },
        body: args?.body != null ? (typeof args.body === 'string' ? args.body : JSON.stringify(args.body)) : undefined,
      },
      14000
    );
    const text = await res.text();
    return { ok: res.ok, status: res.status, content: text.slice(0, 6000) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

async function toolGithubOp(args: any): Promise<any> {
  const token = AGENT_CONFIG.ghToken;
  if (!token) return { ok: false, error: 'no AGENT_GH_TOKEN configured' };
  const op = String(args?.op || '');
  const memRepo = AGENT_CONFIG.memoryRepo;
  if (op === 'gist') {
    const files: Record<string, string> = {};
    for (const [name, content] of Object.entries(args?.files || {})) files[String(name).slice(0, 60)] = String(content).slice(0, 40000);
    if (!Object.keys(files).length) return { ok: false, error: 'files required' };
    const r = await createGist(token, files, String(args?.description || 'from Murad'), !!args?.public);
    return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.error };
  }
  if (op === 'write_file') {
    const repo = String(args?.repo || memRepo);
    if (!/\//.test(repo)) return { ok: false, error: 'repo must be owner/name' };
    return ghWriteFile(token, repo, String(args?.path || ''), String(args?.content || ''), `murad-agent: ${String(args?.message || 'write')}`);
  }
  if (op === 'issue') {
    const repo = String(args?.repo || 'bessghiermohamed/agent-loop');
    if (!/\//.test(repo)) return { ok: false, error: 'repo must be owner/name' };
    return createIssue(token, repo, String(args?.title || 'note'), String(args?.body || ''));
  }
  return { ok: false, error: `unknown github op: ${op} (use gist | write_file | issue)` };
}

async function toolDispatchTick(args: any): Promise<any> {
  const token = AGENT_CONFIG.ghToken;
  if (!token) return { ok: false, error: 'no AGENT_GH_TOKEN configured' };
  const r = await dispatchWorkflow(token, 'bessghiermohamed/agent-loop', 'agent-tick.yml', {
    source: String(args?.source || 'chain'),
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// ─── registry ────────────────────────────────────────────────────────────────
// `local` tools mutate memory and are executed by brain.ts (they need the
// memory bundle). Here: pure/external tools only.

export interface ToolCtx {
  ownerChatId: string;
  goalId?: string;
}

export interface ToolDef {
  name: string;
  desc: string;
  args: string; // compact schema hint for the prompt
  risky?: (args: any) => true | string; // true = always approve; string = reason
}

export const TOOLS: ToolDef[] = [
  { name: 'web_search', desc: 'Search the web (DuckDuckGo) and get titles/URLs/snippets.', args: '{query}' },
  { name: 'web_fetch', desc: 'Fetch a URL and get readable text (HTML stripped, JSON as-is).', args: '{url, max_chars?}' },
  {
    name: 'run_code',
    desc: 'Run pure JavaScript (node vm sandbox, no network/timers/fs) for math, parsing, text processing. Last expression is the result.',
    args: '{code, timeout_ms?}',
  },
  {
    name: 'http_request',
    desc: 'Raw HTTP request to any public API (GET is free to use; any other method needs owner approval).',
    args: '{method, url, headers?, body?}',
    risky: (a) => String(a?.method || 'GET').toUpperCase() !== 'GET' && 'non-GET request changes things on an external service',
  },
  {
    name: 'github_op',
    desc: 'GitHub actions: create a gist (share code/files), write a file into a repo (own memory repo by default; other repos need approval), open an issue.',
    args: "{op: 'gist'|'write_file'|'issue', files?|repo?+path?+content?, title?, body?}",
    risky: (a) =>
      (a?.op === 'write_file' && a?.repo && a.repo !== AGENT_CONFIG.memoryRepo && 'writing into a repo other than my memory') ||
      (a?.op === 'issue' && a?.repo && a.repo !== 'bessghiermohamed/agent-loop' && 'opening an issue on an external repo') ||
      (a?.op === 'gist' && a?.public && 'making content public on the internet'),
  },
  { name: 'send_message', desc: 'Send a Telegram message to the owner. Use for updates, questions, results, or just talking.', args: '{text}' },
  {
    name: 'request_approval',
    desc: 'Ask the owner to approve an action you consider risky or expensive. Work pauses until they decide.',
    args: '{tool, args(object), reason}',
  },
  { name: 'add_goal', desc: 'Adopt a new goal (from owner requests or your own initiative).', args: '{title, description?, subtasks?(string[])}' },
  {
    name: 'update_goal',
    desc: 'Update a goal: mark progress, tick a subtask done, add a note, or finish/fail/block it.',
    args: '{goal_id, status?(!active|!blocked|!waiting_approval|!done|!failed|!cancelled), check_subtask?(id), add_subtasks?(string[]), add_note?, result?}',
  },
  { name: 'remember', desc: 'Save a durable lesson or fact to long-term memory (survives restarts, shapes future behavior).', args: '{text}' },
  { name: 'schedule_task', desc: 'Schedule a future check (reminder, follow-up, monitoring). Fires on a later tick.', args: '{what, in_minutes?, at_iso?}' },
  { name: 'sleep', desc: 'Go idle for N minutes (end work period, wait for next scheduled wake).', args: '{minutes?}' },
];

export const TOOL_MAP: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Execute an external/pure tool. Local (memory-touching) ones return marker. */
export async function execTool(name: string, args: any, ctx: ToolCtx): Promise<any> {
  switch (name) {
    case 'web_search':
      return toolWebSearch(args);
    case 'web_fetch':
      return toolWebFetch(args);
    case 'run_code':
      return toolRunCode(args);
    case 'http_request':
      return toolHttpRequest(args);
    case 'github_op':
      return toolGithubOp(args);
    case 'dispatch_tick':
      return toolDispatchTick(args);
    case 'send_message': {
      const { sendTelegram } = await import('./telegram');
      const chatId = args?.chat_id || ctx.ownerChatId;
      if (!chatId) return { ok: false, error: 'no known chat to message (owner not pinned yet)' };
      const r = await sendTelegram(chatId, String(args?.text || '').slice(0, 3800));
      return r;
    }
    default:
      return { __local__: true }; // add_goal, update_goal, remember, schedule_task, sleep, request_approval
  }
}

/** Human-readable summary of tool args for logs/episodes. */
export function describeArgs(args: any): string {
  try {
    const s = JSON.stringify(args);
    return (s || '').length > 160 ? s.slice(0, 157) + '…' : s || '{}';
  } catch {
    return '{}';
  }
}
