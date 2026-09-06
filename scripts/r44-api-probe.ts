/**
 * Round 44 — local functional probe for the rewritten /api/ai (chat mode).
 *
 * 1. anonymous POST {messages}          → expect 401
 * 2. signup throwaway student
 * 3. empty messages array               → expect 400
 * 4. last message from assistant        → expect 400 (must end with user)
 * 5. valid messages → two possible PASS states, reported explicitly:
 *      a. JSON { needsConfig: true }   → server booted WITHOUT provider keys
 *      b. SSE stream ending in an error event → server booted WITH (dummy)
 *         keys: the chain must walk both providers, swallow their auth
 *         failures, and degrade to a graceful Arabic error event.
 * 6. delete the throwaway account (self-service)
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const stamp = Date.now().toString(36);
const studentName = `طالب اختبار ${stamp}`;
const email = `r44probe-${stamp}@test.dz`;
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
  let body: Record<string, unknown> = {};
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try { body = await res.json(); } catch { /* malformed json */ }
  }
  return { status: res.status, body, contentType: ct, res };
}

async function readSse(res: Response): Promise<Array<Record<string, unknown>>> {
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

async function main() {
  // 1. anonymous → 401
  const anon = await api("/api/ai", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "مرحبا" }] }),
  });
  console.log("anonymous POST /api/ai →", anon.status, JSON.stringify(anon.body));
  if (anon.status !== 401) throw new Error("expected 401 for anonymous");

  // 2. signup throwaway student
  const su = await api("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ fullName: studentName, email }),
  });
  console.log("signup →", su.status);
  if (su.status !== 200 && su.status !== 201) throw new Error("signup failed: " + JSON.stringify(su.body));

  // 3. empty messages → 400
  const empty = await api("/api/ai", { method: "POST", body: JSON.stringify({ messages: [] }) });
  console.log("empty messages →", empty.status, JSON.stringify(empty.body));
  if (empty.status !== 400) throw new Error("expected 400 for empty messages");

  // 4. last message from assistant → 400
  const badRole = await api("/api/ai", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { role: "user", content: "مرحبا" },
        { role: "assistant", content: "أهلاً بك" },
      ],
    }),
  });
  console.log("assistant-last messages →", badRole.status, JSON.stringify(badRole.body));
  if (badRole.status !== 400) throw new Error("expected 400 for assistant-last messages");

  // 5. valid messages — needsConfig (no keys) OR graceful SSE error (dummy keys)
  const valid = await api("/api/ai", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "ما هي أصغر وحدة في الكائن الحي؟" }] }),
  });
  if (valid.body.needsConfig) {
    console.log("valid, no keys →", valid.status, "needsConfig:true  ✓ (no-keys mode)");
  } else if (valid.contentType.includes("text/event-stream")) {
    const events = await readSse(valid.res);
    const types = events.map((e) => e.type).join(",");
    const errEvent = events.find((e) => e.type === "error");
    console.log("valid, dummy keys → SSE events:", types, "| error:", JSON.stringify(errEvent));
    if (!errEvent) throw new Error("expected a graceful error event from the dummy-key chain");
    const msg = String(errEvent.message ?? "");
    if (!/[\u0600-\u06FF]/.test(msg)) throw new Error("error event must carry an Arabic message");
    console.log("chain walked and degraded gracefully  ✓ (dummy-keys mode)");
  } else {
    throw new Error("unexpected response: " + valid.status + " " + valid.contentType);
  }

  // 6. cleanup
  const del = await api("/api/auth/delete", { method: "POST" });
  console.log("cleanup throwaway account →", del.status, JSON.stringify(del.body));
  console.log("\n=== R44 API PROBE: ALL PASS ===");
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });
