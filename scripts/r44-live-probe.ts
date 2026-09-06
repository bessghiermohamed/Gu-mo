/**
 * Round 44 — LIVE production probe of the redesigned /api/ai (gu-mo.vercel.app).
 * Self-cleaning: registers a throwaway student → sends one chat message with
 * stream:true → reports which provider answered and whether tokens streamed
 * → sends a second turn (multi-turn check) → deletes the account.
 *
 * PASS = at least one turn produced a meta event + non-empty streamed text.
 */
const BASE = process.env.BASE ?? "https://gu-mo.vercel.app";
const stamp = Date.now().toString(36);
const email = `r44live-${stamp}@test.dz`;
const jar = { cookie: "" };

async function api(path: string, init: RequestInit = {}) {
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

async function readSse(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<Record<string, unknown>> = [];
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

async function chat(messages: Array<{ role: string; content: string }>) {
  const res = await api("/api/ai", {
    method: "POST",
    body: JSON.stringify({ messages, stream: true }),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await res.json().catch(() => ({}));
    return { kind: "json" as const, status: res.status, body };
  }
  const events = await readSse(res);
  const meta = events.find((e) => e.type === "meta");
  const text = events.filter((e) => e.type === "delta").map((e) => String(e.text ?? "")).join("");
  const error = events.find((e) => e.type === "error");
  return { kind: "sse" as const, status: res.status, meta, text, error, eventCount: events.length };
}

async function main() {
  const anon = await api("/api/ai", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "مرحبا" }] }) });
  console.log("anon →", anon.status);
  if (anon.status !== 401) throw new Error("expected 401");

  const su = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: "طالب اختبار مباشر", email }) });
  console.log("signup →", su.status);
  if (su.status !== 200 && su.status !== 201) throw new Error("signup failed");

  // Turn 1 — the decisive test: does ANY provider answer now?
  const t1 = await chat([{ role: "user", content: "بجملة واحدة فقط: ما هي الخلية؟" }]);
  if (t1.kind === "json") {
    console.log("turn1 → JSON", t1.status, JSON.stringify(t1.body).slice(0, 200));
    if (!(t1.body as { needsConfig?: boolean }).needsConfig) throw new Error("unexpected JSON response");
    throw new Error("providers returned needsConfig — keys missing in Vercel?");
  }
  console.log("turn1 → SSE, events:", t1.eventCount, "| meta:", JSON.stringify(t1.meta));
  console.log("turn1 answer (first 200 chars):", t1.text.slice(0, 200).replace(/\n/g, " "));
  if (t1.error) throw new Error("stream carried an error event: " + JSON.stringify(t1.error));
  if (!t1.meta) throw new Error("no meta event — provider never answered");
  if (t1.text.trim().length < 10) throw new Error("answer too short — streaming broken?");
  console.log("✓ TURN 1 STREAMED FROM:", (t1.meta as { provider?: string }).provider, "/", (t1.meta as { model?: string }).model);

  // Turn 2 — multi-turn context check
  const t2 = await chat([
    { role: "user", content: "بجملة واحدة فقط: ما هي الخلية؟" },
    { role: "assistant", content: t1.text },
    { role: "user", content: "والنسيج؟" },
  ]);
  if (t2.kind !== "sse") throw new Error("turn2 unexpected: " + JSON.stringify(t2));
  console.log("turn2 → meta:", JSON.stringify(t2.meta), "| answer:", t2.text.slice(0, 120).replace(/\n/g, " "));
  if (t2.error || !t2.text.trim()) throw new Error("turn2 failed: " + JSON.stringify(t2.error));
  console.log("✓ TURN 2 (multi-turn) OK");

  const del = await api("/api/auth/delete", { method: "POST" });
  console.log("cleanup →", del.status);
  console.log("\n=== R44 LIVE PROBE: ALL PASS ===");
}

main().catch((e) => { console.error("LIVE PROBE FAILED:", e.message); process.exit(1); });
