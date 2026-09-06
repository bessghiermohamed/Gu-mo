/**
 * Round 43 — local functional probe for /api/ai (against `bun dev` server).
 * 1. anonymous POST → expect 401
 * 2. signup throwaway student → POST /api/ai → expect { needsConfig: true }
 *    (no GROQ_API_KEY locally)
 * 3. delete the throwaway account (self-service)
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const stamp = Date.now().toString(36);
const studentName = `طالب اختبار ${stamp}`;
const email = `r43probe-${stamp}@test.dz`;
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
  try { body = await res.json(); } catch { /* html */ }
  return { status: res.status, body };
}

async function main() {
  // 1. anonymous → 401
  const anon = await api("/api/ai", { method: "POST", body: JSON.stringify({ task: "summarize", text: "x" }) });
  console.log("anonymous POST /api/ai →", anon.status, JSON.stringify(anon.body));
  if (anon.status !== 401) throw new Error("expected 401 for anonymous");

  // 2. authenticated → needsConfig (no local key)
  const su = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: studentName, email }) });
  console.log("signup →", su.status);
  const ai = await api("/api/ai", {
    method: "POST",
    body: JSON.stringify({ task: "summarize", text: "النحو هو علم يبحث في أحوال أخر الكلمة." }),
  });
  console.log("authed POST /api/ai →", ai.status, JSON.stringify(ai.body));
  if (!ai.body.needsConfig) throw new Error("expected needsConfig:true without local key");

  // 3. validation guard: task=ask without question → 400
  const noQ = await api("/api/ai", { method: "POST", body: JSON.stringify({ task: "ask", question: "" }) });
  console.log("ask without question →", noQ.status, JSON.stringify(noQ.body));
  if (noQ.status !== 400) throw new Error("expected 400 validation");

  // 4. cleanup
  const del = await api("/api/auth/delete", { method: "POST" });
  console.log("cleanup throwaway account →", del.status, JSON.stringify(del.body));
  console.log("\n=== R43 API PROBE: ALL PASS ===");
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });
