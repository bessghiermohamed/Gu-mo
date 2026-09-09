#!/usr/bin/env python3
# r68 — patch src/app/api/telegram/setup/route.ts
# simulate must (1) post to the BASE chat id (strip #N/:thread suffixes) so
# multi-binding lookup finds the rows, and (2) clean up EVERY binding's copy.

import io, sys

PATH = "src/app/api/telegram/setup/route.ts"
src = io.open(PATH, encoding="utf-8").read()
orig_len = len(src)
applied = 0


def patch(anchor: str, replacement: str, count: int = 1):
    global src, applied
    n = src.count(anchor)
    if n != count:
        print(f"FAIL: anchor found {n}x (expected {count}). Head:\n{anchor[:100]!r}")
        sys.exit(1)
    src = src.replace(anchor, replacement)
    applied += 1


BS = chr(92)

# 1) imports
patch(
    '''  findTelegramItem,
  deleteTelegramItemById,
  processTelegramUpdate,
} from "@/lib/telegram/ingest";''',
    '''  findTelegramItem,
  deleteTelegramItemById,
  loadSourcesByChatId,
  deleteTelegramItemsByMessage,
  processTelegramUpdate,
} from "@/lib/telegram/ingest";''',
)

# 2) base chat id in the simulated update
patch(
    "        id: Number(source.tgChannelId) || 0,",
    "        // r68: القناة قد تكون ربطاً متعدداً (chatId#N) أو قسماً (chat:thread) —"
    " المحاكاة"
    "        // تُرسل دائماً إلى معرّف القناة الأساسي كي تجد كل روابطها"
    "        id: Number(source.tgChannelId.replace(/[:#][^#:]*/, \"\")) || 0,",
)

# 3) multi-binding cleanup
patch(
    '''  const item = await findTelegramItem(source.id, messageId);
  let cleaned = true;
  if (item) cleaned = await deleteTelegramItemById(item.id);''',
    '''  const item = await findTelegramItem(source.id, messageId);
  // r68: المحاكاة متعددة الروابط تنشئ نسخة لكل ربط — تُنظَّف كلها
  // (روابط القناة الأساسية + صف المصدر نفسه إن كان قسماً مستقلاً)
  const baseChatId = source.tgChannelId.replace(/[:#][^#:]*/, "");
  const bindingRows = await loadSourcesByChatId(baseChatId);
  const allSourceIds = Array.from(new Set([...bindingRows.map((s) => s.id), source.id]));
  let cleaned = true;
  if (allSourceIds.length > 0) {
    cleaned = (await deleteTelegramItemsByMessage(allSourceIds, messageId)) > 0;
  } else if (item) {
    cleaned = await deleteTelegramItemById(item.id);
  }''',
)

io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — {applied} patches applied. {orig_len} → {len(src)} chars")
