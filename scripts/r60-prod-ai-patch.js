(() => {
  const PROD = "https://gu-mo.vercel.app";
  const COOKIE = "__PROD_COOKIE__";
  if (window.__prodAiPatched) return "already patched";
  window.__prodAiPatched = true;
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!url.includes("/api/ai")) return real(input, init);
    const target = PROD + url;
    const headers = { ...(init && init.headers ? Object.fromEntries(new Headers(init.headers)) : {}), cookie: COOKIE };
    return real(target, { ...init, headers, credentials: "omit" });
  };
  return "patched: /api/ai → production with real session";
})()
