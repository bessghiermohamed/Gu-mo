/**
 * Round 59 — LIVE production probe of «المساعد الذكي» answer QUALITY.
 *
 * The owner's report: the assistant needs improvement — "try talking to it
 * and asking it a scientific question". This probe does exactly that against
 * gu-mo.vercel.app: three real scientific questions (physics with a
 * calculation, chemistry definition, biology), capturing provider/model,
 * full text, latency, and formatting signals (LaTeX/markdown/emoji) so we
 * can see what a student actually receives. Self-cleaning account.
 */
const BASE = process.env.BASE ?? "https://gu-mo.vercel.app";
const stamp = Date.now().toString(36);
const email = `r59probe-${stamp}@test.dz`;
const jar = { cookie: "" };

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(jar.cookie ? { cookie: jar.cookie } : {}), ...(init.headers ?? {}) },
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const v = c.split(";")[0];
    if (v.startsWith("talib_session=")) jar.cookie = v;
  }
  return res;
}

async function readSse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try { events.push(JSON.parse(payload)); } catch { /* partial */ }
    }
  }
  return events;
}

async function chat(messages) {
  const t0 = Date.now();
  const res = await api("/api/ai", { method: "POST", body: JSON.stringify({ messages, stream: true }) });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await res.json().catch(() => ({}));
    return { kind: "json", status: res.status, body, ms: Date.now() - t0 };
  }
  const events = await readSse(res);
  const meta = events.find((e) => e.type === "meta");
  const text = events.filter((e) => e.type === "delta").map((e) => String(e.text ?? "")).join("");
  const error = events.find((e) => e.type === "error");
  return { kind: "sse", status: res.status, meta, text, error, ms: Date.now() - t0 };
}

const QUESTIONS = [
  {
    label: "physics-with-calculation",
    content: "شرح لي قانون نيوتن الثاني بكيفية مبسطة، وأعطني مثالاً عملياً بحساب القوة",
  },
  {
    label: "chemistry-definition",
    content: "ما هو الفرق بين الحمض والقاعدة؟",
  },
  {
    label: "biology-explain",
    content: "اشرح لي باختصار مراحل الانقسام المتساوي للخلية",
  },
];

function formatSignals(text) {
  return {
    chars: text.length,
    hasLatexDollar: /\$[^$]+\$/u.test(text),
    hasLatexParen: /\\[([(]/u.test(text),
    latexFragments: (text.match(/\\[a-zA-Z]+/gu) ?? []).slice(0, 8),
    hasMarkdownHeadings: /^#{1,6}\s/mu.test(text),
    hasMarkdownBullets: /^\s*[-*•]\s/mu.test(text),
    hasMarkdownTable: /\|.*\|/u.test(text),
    hasEmoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text),
    asteriskBold: /\*\*[^*]+\*\*/u.test(text),
  };
}

async function main() {
  console.log("BASE =", BASE);
  const su = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: "طالب اختبار المساعد", email }) });
  console.log("signup →", su.status);
  if (su.status !== 200 && su.status !== 201) throw new Error("signup failed: " + (await su.text()).slice(0, 200));

  for (const q of QUESTIONS) {
    console.log("\n══════════════════════════════════════════");
    console.log("Q [" + q.label + "]:", q.content);
    const r = await chat([{ role: "user", content: q.content }]);
    if (r.kind === "json") {
      console.log("→ JSON response:", r.status, JSON.stringify(r.body).slice(0, 300));
      continue;
    }
    console.log("→ provider:", r.meta?.provider, "| model:", r.meta?.model, "|", r.ms + "ms");
    if (r.error) console.log("→ ERROR EVENT:", JSON.stringify(r.error));
    console.log("→ signals:", JSON.stringify(formatSignals(r.text)));
    console.log("→ FULL ANSWER:\n" + (r.text || "(empty)"));
  }

  const del = await api("/api/auth/delete", { method: "POST" });
  console.log("\ncleanup →", del.status);
}

main().catch((e) => { console.error("R59 PROBE FAILED:", e.message); process.exit(1); });
