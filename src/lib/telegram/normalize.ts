/**
 * Arabic text normalization for search (round 7)
 *
 * Telegram posts come with tashkeel, alef variants, tatweel… Students
 * type queries without diacritics and with any alef/yaa variant, so we
 * build a normalized `search_text` at ingest time and normalize the
 * query the same way. This makes plain ILIKE search actually usable in
 * Arabic without any extension.
 */

/**
 * طبّع نصاً عربياً/لاتينياً للبحث:
 * - حذف التشكيل والتطويل
 * - توحيد الألف (أ إ آ ٱ → ا) والى→ي والة→ه
 * - توحيد الهمزات (ؤ→و، ئ→ي)
 * - lowercase للاتيني + دمج الفراغات
 */
export function normalizeArabic(input: string): string {
  if (!input) return "";
  return input
    // tashkeel (fathatan..sukun), superscript alef, tatweel
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** يبني نص البحث من العنوان + النص + اسم الملف (نسخة مُطبَّعة) */
export function buildSearchText(title: string, caption: string, fileName: string): string {
  return normalizeArabic([title, caption, fileName].filter(Boolean).join(" \n "));
}

/**
 * أول سطر/جملة قصيرة تصلح عنواناً مبدئياً قبل تصنيف Gemini.
 */
export function firstLineTitle(text: string, maxLen = 80): string {
  if (!text) return "";
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "";
  const cleaned = line.replace(/[#*`\[\]()_~>]+/g, "").trim();
  if (!cleaned) return "";
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen).trim()}…` : cleaned;
}

/** يحوّل اسم ملف إلى عنوان مقروء (شرطات/سطور سفلية → فراغات، بدون امتداد) */
export function fileNameToTitle(fileName: string, maxLen = 80): string {
  if (!fileName) return "";
  const noExt = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  const spaced = noExt.replace(/[_\-+.]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "";
  return spaced.length > maxLen ? `${spaced.slice(0, maxLen).trim()}…` : spaced;
}
