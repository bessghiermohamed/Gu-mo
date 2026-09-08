/**
 * r60 diagnostics — local CORS-safe proxy for the PRODUCTION /api/ai.
 * The browser (localhost:3000, production build) forwards /api/ai here;
 * we relay to gu-mo.vercel.app with the real prod session cookie and add
 * permissive CORS + SSE passthrough. This isolates my earlier cross-origin
 * fetch artifact (preflight failure → fake «تعذّر الاتصال» bubble).
 */
const http = require("http");
const PROD = "https://gu-mo.vercel.app";
const COOKIE = JSON.parse(require("fs").readFileSync(__dirname + "/.r60-prod-cookie.txt", "utf8")).cookie;

http
  .createServer(async (req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, cookie",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.method !== "POST" || !req.url.startsWith("/api/ai")) {
      res.writeHead(404, cors);
      return res.end("not found");
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const upstream = await fetch(PROD + req.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: COOKIE },
        body: Buffer.concat(chunks),
      });
      const headers = {
        ...cors,
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-cache",
      };
      res.writeHead(upstream.status, headers);
      if (upstream.body) {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (e) {
      res.writeHead(502, cors);
      res.end(JSON.stringify({ error: "proxy error: " + e.message }));
    }
  })
  .listen(8787, () => console.log("ai proxy on :8787"));
