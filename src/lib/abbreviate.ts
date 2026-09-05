/**
 * Round 37 — compact display for long organization names.
 *
 * The حسابي screen shows the institution in a small 2-column cell where a
 * long official name («ثانوية الشهيد محمد بوصوف بوزريعة») collapses into a
 * CSS «…» that cuts mid-word and hides the one part people actually
 * recognize: the distinctive last name. The owner asked for the name to be
 * abbreviated «to the last name», and for the same abbreviation to work
 * when the name is written in English letters.
 *
 * Rules (a name short enough is returned untouched):
 * - Arabic script  → initial of the leading word (its type: ثانوية/مدرسة/…)
 *                    + the last meaningful word:  ثانوية الشهيد محمد بوصوف → ث. بوصوف
 * - Latin script   → initials of the leading words + the last name:
 *                    Lycée Frères Bousouf → L.F. Bousouf (fallback LFB Bousouf)
 * - Mixed / other  → treated like Arabic (first-letter initial + last word).
 * The «ال» definitional prefix is ignored when taking an Arabic initial
 * (المدرسة → م، الثانوية → ث) and parenthesised suffixes are never chosen
 * as the distinctive word.
 *
 * The FULL name stays available in the UI through the cell's title
 * attribute — abbreviation is a display concern only.
 */

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

/** Initial letter of a word, ignoring a leading «ال» on Arabic words and
 *  normalizing Latin accents (École → E). */
function firstLetter(word: string): string {
  const stripped = ARABIC.test(word) ? word.replace(/^ال/, "") : word;
  for (const ch of stripped) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      return ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "")[0] ?? ch;
    }
  }
  return word.charAt(0);
}

export function abbreviateOrgName(name: string, max = 16): string {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean || clean.length <= max) return clean;

  // Parenthesised administrative suffixes («(القرار 105)») are never the
  // distinctive name — drop them; if that alone makes it short, done.
  const base = clean.replace(/\s*\([^)]*\)/g, "").trim().replace(/\s+/g, " ");
  if (!base) return clean;
  if (base.length <= max) return base;

  const words = base.split(" ").filter(Boolean);
  // The distinctive word = last word that actually contains a letter/digit
  // (a stray dash or symbol is never picked).
  let lastIdx = words.length - 1;
  while (lastIdx > 0 && !HAS_WORD_CHAR.test(words[lastIdx])) lastIdx--;
  if (lastIdx === 0) return base; // single meaningful word — nothing to trim
  const last = words[lastIdx];
  const head = words.slice(0, lastIdx);

  if (LATIN.test(base) && !ARABIC.test(base)) {
    const spaced = `${head.map((w) => `${firstLetter(w).toUpperCase()}.`).join("")} ${last}`;
    if (spaced.length <= max) return spaced;
    const tight = `${head.map((w) => firstLetter(w).toUpperCase()).join("")} ${last}`;
    return tight.length <= max ? tight : tight.slice(0, max).trimEnd();
  }

  // Arabic (and mixed-script) names: type initial + distinctive last name.
  return `${firstLetter(head[0])}. ${last}`;
}
