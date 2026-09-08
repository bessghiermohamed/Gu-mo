(() => {
  const answer = `قانون نيوتن الثاني (Newton's Second Law / Deuxième loi de Newton) هو أحد القواعد الأساسية في علم الحركة، ويربط بين القوة المؤثرة على جسم ما، وكتلته، والتسارع الناتج عن هذه القوة.

### الشرح المبسط للقانون

ببساطة، يخبرنا هذا القانون بوجود علاقة مباشرة بين القوة والتسارع:
* كلما دفعت أو سحبت جسماً بقوة أكبر، زاد تسارعه.
* كلما كانت كتلة الجسم أكبر، احتجت إلى قوة أكبر لتحريكه (القصور الذاتي / Inertia).

### الصيغة الرياضية

$$F = m \\times a$$

حيث:
* **$F$**: القوة (Force) وتقاس بوحدة النيوتن (N).
* **$m$**: الكتلة (Mass) وتقاس بالكيلوغرام (kg).
* **$a$**: التسارع (Acceleration) ويقاس بالمتر في الثانية المربعة ($m/s^2$).

### مثال عملي لحساب القوة

**المسألة:**
عربة تسوق كتلتها 20 كيلوغراماً ($m = 20 \\text{ kg}$)، وتريد تحريكها بتسارع 2 متر في الثانية المربعة ($a = 2 \\text{ m/s}^2$). ما القوة اللازمة؟

**الحل:**
نعوض بالقيم في القانون مباشرة:
$$F = 20 \\text{ kg} \\times 2 \\text{ m/s}^2 = 40 \\text{ N}$$

إذن، القوة اللازمة لدفع العربة هي **40 نيوتن**.`;
  if (window.__aiPatched) return "already patched";
  window.__aiPatched = true;
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!url.includes("/api/ai")) return real(input, init);
    const enc = new TextEncoder();
    const parts = [];
    parts.push('data: {"type":"meta","provider":"gemini","model":"gemini-3.5-flash"}\n\n');
    const step = 24;
    for (let i = 0; i < answer.length; i += step) {
      parts.push("data: " + JSON.stringify({ type: "delta", text: answer.slice(i, i + step) }) + "\n\n");
    }
    parts.push("data: [DONE]\n\n");
    let idx = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        if (idx >= parts.length) { controller.close(); return; }
        controller.enqueue(enc.encode(parts[idx]));
        idx += 1;
        await new Promise((r) => setTimeout(r, 8));
      },
    });
    return Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
      })
    );
  };
  return "patched: /api/ai streams the canned physics answer (" + answer.length + " chars)";
})()
