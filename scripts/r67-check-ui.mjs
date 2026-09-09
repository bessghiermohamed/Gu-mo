/**
 * r67 — UI text cleanup verification against the PRODUCTION BUILD output
 * (no screenshots, per owner's request).
 *
 *   G1: the long sources subtitle next to «ربط قناة» is GONE from chunks
 *   G2: the new cohort select label («أو الفوج — مساحة مشتركة») is PRESENT
 *   G3: the shortened bot hint («البوت مشرف في القناة أولاً») is PRESENT
 *   G4: the old long hint («لإضافة قسم منفصل من قناة مربوطة، الصق») is GONE
 *   G5: trimmed status-card badText («التوكن مرفوض من تيليجرام») is PRESENT
 *   G6: the old long badText («انسخه كاملاً من BotFather») is GONE
 *   G7: the edit dialog cohort label («الفوج — مساحة مشتركة») is PRESENT
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CHUNKS_DIR = "/home/z/my-project/gu-mo/.next/static/chunks";

function collectFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...collectFiles(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

const files = collectFiles(CHUNKS_DIR);
let blob = "";
for (const f of files) blob += readFileSync(f, "utf-8");
console.log(`scanned ${files.length} chunks (${Math.round(blob.length / 1024)} KB)`);

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

check("G1 حُذف نص الشرح الطويل بجانب «ربط قناة»", !blob.includes("كل قناة مرتبطة بمقياس (أو فوج للمساحة المشتركة)"));
check("G2 حقل «أو الفوج — مساحة مشتركة» موجود", blob.includes("أو الفوج — مساحة مشتركة"));
check("G3 التلميح المختصر للبوت موجود", blob.includes("البوت مشرف في القناة أولاً"));
check("G4 حُذف التلميح الطويل القديم", !blob.includes("لإضافة قسم منفصل من قناة مربوطة، الصق رابط القسم"));
check("G5 حالة البوت المختصرة موجودة", blob.includes("التوكن مرفوض من تيليجرام"));
check("G6 حُذف نص الحالة الطويل القديم", !blob.includes("انسخه كاملاً من BotFather"));
check("G7 حقل فوج التعديل موجود", blob.includes("الفوج — مساحة مشتركة"));

console.log(`\nUI-CHUNK RESULT: ${passed} ✅ / ${failed} ❌`);
if (failed > 0) process.exit(1);
