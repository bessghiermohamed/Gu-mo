// Round 37 — sanity test for abbreviateOrgName (run: bun scripts/test-abbreviate.ts)
import { abbreviateOrgName } from "../src/lib/abbreviate";

const cases: Array<[string, string]> = [
  // Short names pass through untouched
  ["ثانوية بوزريعة", "ثانوية بوزريعة"],
  ["ENS Bouzaréah", "ENS Bouzaréah"],
  ["", ""],
  // Arabic: type initial + distinctive last name
  ["ثانوية الشهيد محمد بوصوف", "ث. بوصوف"],
  ["مدرسة الأخوة بوعلام بوزريعة", "م. بوزريعة"],
  ["المدرسة العليا للأساتذة بوزريعة", "م. بوزريعة"],
  ["متوسطة الشهيد كمال بوزريعة", "م. بوزريعة"],
  // Parenthesised suffix never becomes the last name
  ["ثانوية دالي إبراهيم (القرار 105)", "ث. إبراهيم"],
  // Latin: initials + last name
  ["Lycée Frères Bousouf", "L.F. Bousouf"],
  ["École Normale Supérieure de Bouzaréah", "ENSD Bouzaréah"],
  // Mixed script but SHORT → passes through untouched
  ["ENS بوزريعة", "ENS بوزريعة"],
  // Very long Latin falls back to tight initials
  ["International Baccalaureate Organization Office Amsterdam", "IBOO Amsterdam"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = abbreviateOrgName(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} | ${JSON.stringify(input)} → ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
