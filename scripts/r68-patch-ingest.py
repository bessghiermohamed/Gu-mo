#!/usr/bin/env python3
# r68 — patch src/lib/telegram/ingest.ts
# 1) buildDeepLink strips #N variant suffixes
# 2) loadSourcesByChatId (base + #N variants) — exported for the setup route
# 3) processTelegramUpdate ingests for EVERY binding row of the chat
# 4) deleteTelegramItemsByMessage — multi-binding cleanup for simulate

import io, sys

PATH = "src/lib/telegram/ingest.ts"
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


# ---------------------------------------------------------------- 1) deep link
BS = chr(92)  # explicit backslash — the tooling display swallows them (r64/r67 lesson)
# NOTE: the r66 committed code actually contains TWO backslashes here
# (/\\d+$/ — matches a literal backslash, so the :thread strip NEVER worked
# for private channels; public channels use the username path so it went
# unnoticed). We fix it to a real digit regex (\d) and add the #N strip.
old_dl = (
    '  const raw = source.tgChannelId.replace(/^-100/, "").replace(/:' + BS + BS + 'd+$/, "");\n'
    "  return `https://t.me/c/${raw}${topic}/${messageId}`;"
)
new_dl = (
    "  // r68: تُجرَّد لواحق الأقسام (:thread) والتنويعات (#N) — الرابط\n"
    "  // يبقى للمنشور الأصلي في القناة الفعلية دائماً.\n"
    '  const raw = source.tgChannelId.replace(/^-100/, "").replace(/:' + BS + 'd+$/, "").replace(/#' + BS + 'd+$/, "");\n'
    "  return `https://t.me/c/${raw}${topic}/${messageId}`;"
)
patch(old_dl, new_dl)

# ---------------------------------------------------------------- 2) loadSourcesByChatId
patch(
    '''  const s = await db.telegramSource.findUnique({ where: { tgChannelId: chatId } });
  if (!s) return null;
  return {
    id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
    sourceType: s.sourceType, specialtyId: s.specialtyId, yearId: s.yearId, semester: s.semester,
    moduleId: s.moduleId, cohortId: s.cohortId, isActive: s.isActive, lastUpdateId: s.lastUpdateId,
  };
}
''',
    '''  const s = await db.telegramSource.findUnique({ where: { tgChannelId: chatId } });
  if (!s) return null;
  return {
    id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
    sourceType: s.sourceType, specialtyId: s.specialtyId, yearId: s.yearId, semester: s.semester,
    moduleId: s.moduleId, cohortId: s.cohortId, isActive: s.isActive, lastUpdateId: s.lastUpdateId,
  };
}

/** r68: كل صفوف الربط لهذه القناة — الأساسي وتنويعاته «chatId#N» (ربط
 * متعدد بقواعد مختلفة). الأقسام المستقلة «chatId:threadId» تُستبعد (تُعالج
 * بمفتاحها الكامل). الترتيب: الأساسي أولاً ثم التنويعات بترتيب الإنشاء. */
export async function loadSourcesByChatId(chatId: string): Promise<SourceLite[]> {
  const rows: SourceLite[] = [];
  const isBinding = (id: string) => id === chatId || id.startsWith(`${chatId}#`);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("telegram_sources")
        .select("id, tg_channel_id, tg_username, title_ar, source_type, specialty_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
        .like("tg_channel_id", `${chatId}%`);
      for (const r of (data ?? []) as unknown[]) {
        const m = r as Record<string, unknown>;
        if (!isBinding(String(m.tg_channel_id ?? ""))) continue;
        rows.push({
          id: Number(m.id), tgChannelId: String(m.tg_channel_id), tgUsername: String(m.tg_username ?? ""),
          titleAr: String(m.title_ar ?? ""), sourceType: String(m.source_type ?? "channel"),
          specialtyId: Number(m.specialty_id ?? 1), yearId: m.year_id == null ? null : Number(m.year_id),
          semester: m.semester == null ? null : Number(m.semester), moduleId: m.module_id == null ? null : Number(m.module_id),
          cohortId: m.cohort_id == null ? null : Number(m.cohort_id),
          isActive: !!m.is_active, lastUpdateId: Number(m.last_update_id ?? 0),
        });
      }
    } else {
      const found = await db.telegramSource.findMany({ where: { tgChannelId: { startsWith: chatId } } });
      for (const s of found) {
        if (!isBinding(s.tgChannelId)) continue;
        rows.push({
          id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
          sourceType: s.sourceType, specialtyId: s.specialtyId, yearId: s.yearId, semester: s.semester,
          moduleId: s.moduleId, cohortId: s.cohortId, isActive: s.isActive, lastUpdateId: s.lastUpdateId,
        });
      }
    }
  } catch {
    return [];
  }
  rows.sort((a, b) =>
    a.tgChannelId === chatId ? -1 : b.tgChannelId === chatId ? 1 : a.id - b.id
  );
  return rows;
}
''',
)

# ---------------------------------------------------------------- 3) multi-binding cleanup helper
patch(
    '''    await db.telegramItem.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
''',
    '''    await db.telegramItem.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/** r68: يحذف كل نسخ منشورٍ عبر كل روابط القناة — يستعمله «فحص
 * الاستيراد» لأن المحاكاة متعددة الروابط تنشئ نسخة لكل ربط. */
export async function deleteTelegramItemsByMessage(sourceIds: number[], tgMessageId: number): Promise<number> {
  if (sourceIds.length === 0) return 0;
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("telegram_items")
        .delete()
        .in("source_id", sourceIds)
        .eq("tg_message_id", tgMessageId);
      if (error) return 0;
      return sourceIds.length;
    }
    const r = await db.telegramItem.deleteMany({
      where: { sourceId: { in: sourceIds }, tgMessageId },
    });
    return r.count;
  } catch {
    return 0;
  }
}
''',
)

# ---------------------------------------------------------------- 4) processTelegramUpdate → per-binding loop
start = '''    // r66: الأقسام المستقلة (المسار البديل بلا جدول مواضيع) — منشور داخل
    // موضوع يُبحث عنه أولاً بمُعرّفه المركّب "chat:thread"؛ إن وُجد قسم
    // مربوط فربطه (مقياس/سنة) يحكم منشوراته حتمياً، وإلا يُستوى مستوى
    // القناة كما كان. نفس منطق روابط المواضيع تماماً (r65).
'''
end_boundary = '''  } catch {
    return "ignored";
  }
}

/** عنوان مبدئي (يستعمله fallback التصنيف عند غياب المفتاح) */'''
i = src.find(start)
j = src.find(end_boundary)
if i < 0 or j < 0 or j <= i:
    print("FAIL: processTelegramUpdate anchors not found/ordered")
    sys.exit(1)
if src.count(start) != 1 or src.count(end_boundary) != 1:
    print("FAIL: processTelegramUpdate anchors not unique")
    sys.exit(1)

new_body = '''    // r66/r68: القسم المستقل (chat:thread) يحكم موضوعه حصراً متى وُجد؛
    // وإلا فالقناة قد تكون مربوطة عدة مرات بقواعد مختلفة (r68 — الربط
    // المتعدد: تخصص/ملمح/سنة/مقياس/فوج): يُستورد المنشور لكل ربط على
    // حدة، فتظهر لكل نطاقٍ نسخته الخاصة وفق قواعده.
    const sectionKey =
      msg.is_topic_message && msg.message_thread_id != null
        ? `${msg.chat.id}:${msg.message_thread_id}`
        : null;
    const sectionSource = sectionKey ? await loadSourceByChatId(sectionKey) : null;
    const channelSources = await loadSourcesByChatId(String(msg.chat.id));
    const targets = (sectionSource ? [sectionSource] : channelSources).filter((s) => s.isActive);
    if (targets.length === 0) return "ignored";

    const content = parseMessageContent(msg);
    if (!content.kind) return "ignored";

    // تنزيل الصور يحتاج توكن بوت — الصريح (?b=) أولاً ثم الفعّال.
    // r68: تنزيل واحد يشاركه كل ربط (التحليل يعتمد المحتوى وحده).
    const downloadToken = explicitToken || (await resolveBotCredentials()).token;
    const threadId = msg.is_topic_message ? msg.message_thread_id : undefined;

    const wantsVision =
      content.kind === "image" && !!content.fileId && isGeminiConfigured() && !!downloadToken && content.sizeBytes <= MAX_VISION_BYTES;
    let vision: { base64: string; mime: string } | null = null;
    if (wantsVision) {
      const dl = await downloadFileBase64With(downloadToken, content.fileId);
      if (dl) vision = { base64: dl.base64, mime: dl.mime };
    }

    // r68: دمج حالات الروابط — إدراج أي ربط يفوز، ثم تحديث، ثم تخطٍّ
    let outcome: UpdateStatus = "ignored";
    for (const source of targets) {
      const st = await ingestForBinding(source, { msg, update, content, threadId, vision });
      if (st === "inserted") outcome = "inserted";
      else if (st === "updated" && outcome !== "inserted") outcome = "updated";
      else if (st === "skipped" && outcome === "ignored") outcome = "skipped";
    }
    return outcome;
  } catch {
    return "ignored";
  }
}

/** r68: استيراد المنشور وفق قواعد ربط واحد — جسم processTelegramUpdate
 * القديم نفسه (روابط مواضيع هذا الربط + بوابة المحتوى + upsert محمي
 * التنقيح)، يُنفَّذ مرة لكل صف ربط للقناة. */
async function ingestForBinding(
  source: SourceLite,
  ctx: {
    msg: TgMessage;
    update: TgUpdate;
    content: ParsedContent;
    threadId: number | undefined;
    vision: { base64: string; mime: string } | null;
  }
): Promise<"inserted" | "updated" | "skipped" | "ignored"> {
  try {
    const { msg, update, content, threadId, vision } = ctx;

    // r63: مصادر المجموعات/المنتديات — نقاش «العام» لا يُستورد (إلا وسائط)،
    // أما مواضيع المنتدى فمحتوى بالعادة (مصادر، دروس، امتحانات…)
    // r67: مساحة الفوج المشتركة استثناء — وعد الشاشة «ما ينشر في مجموعة
    // الفوج يظهر هنا تلقائياً»: كل محتوى (نص/رابط/ملف) يُستورد إليها،
    // وفلترة الدردشة تبقى لمصادر المكتبة (منتديات مثل ENS) فقط.
    const hasMedia = !!(msg.photo?.length || msg.document || msg.video || msg.audio);
    if (source.sourceType === "group" && source.cohortId == null && !isGroupContentWorthy(msg, hasMedia)) {
      return "ignored";
    }

    const link = buildDeepLink(source, msg.message_id, threadId);
    const postedAt = new Date(msg.date * 1000).toISOString();
    const postedBy = msg.from ? (msg.from.first_name || msg.from.username || "") : "";

    // --- r65: روابط المواضيع — خريطة المشرف لمواضيع القناة ---
    // الموضوع المربوط بمقياس يفرضه حتمياً على كل منشوراته، والمربوط
    // بسنة يضيّق مقاييس الترشيح عليها، والموضوع «عام» ليس محتوى دراسياً
    // أصلاً فلا يُضاف شيئاً من منشوراته.
    const bindings = await loadTopicBindings(source.id);
    const binding = threadId != null ? bindings.find((b) => b.tgThreadId === threadId) : undefined;
    if (binding?.isGeneral) return "skipped";
    const bindingModuleId = binding?.moduleId ?? null;

    // --- هل المنشور موجود سابقاً؟ (upsert idempotent) ---
    let existingId: number | null = null;
    let existingTitle = "";
    let existingModuleId: number | null = null;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase
        .from("telegram_items")
        .select("id, title_ar, module_id")
        .eq("source_id", source.id)
        .eq("tg_message_id", msg.message_id)
        .maybeSingle();
      if (existing) {
        existingId = Number(existing.id);
        existingTitle = String(existing.title_ar ?? "");
        existingModuleId = existing.module_id == null ? null : Number(existing.module_id);
      }
    } else {
      const existing = await db.telegramItem.findUnique({
        where: { sourceId_tgMessageId: { sourceId: source.id, tgMessageId: msg.message_id } },
        select: { id: true, titleAr: true, moduleId: true },
      });
      if (existing) {
        existingId = existing.id;
        existingTitle = existing.titleAr;
        existingModuleId = existing.moduleId;
      }
    }

    // --- التصنيف (Gemini ثم fallback محلي) ---
    const imageBase64 = vision?.base64;
    const imageMime = vision?.mime;
    const topicName = binding?.titleAr || topicNameFor(String(msg.chat.id), threadId);
    const context = `القناة: ${source.titleAr}${source.moduleId ? ` — المقياس: ${await getModuleName(source.moduleId)}` : ""}${bindingModuleId ? ` — المقياس (ربط الموضوع): ${await getModuleName(bindingModuleId)}` : ""}${topicName ? ` — الموضوع (Topic): ${topicName}` : ""}${msg.is_topic_message ? " — منشور داخل موضوع منتدى" : ""}`;
    // r64: مقاييس التخصص المرشحة للربط الذكي — يختار النموذج المقياس
    // المطابق لكل منشور. المصدر أو الموضوع المربوط بمقياس (قرار
    // إداري) يفوز دائماً، والموضوع المربوط بسنة يضيّق المرشحين (r65).
    const moduleCandidates = source.moduleId == null && bindingModuleId == null
      ? await loadModuleCandidates(source.specialtyId, binding?.yearId ?? source.yearId)
      : [];
    const classifyInput = {
      kind: content.kind, caption: content.caption, fileName: content.fileName,
      ...(imageBase64 ? { imageBase64, imageMimeType: imageMime } : {}),
      ...(moduleCandidates.length ? { moduleCandidates } : {}),
      context,
    };
    const cls = await classifyItem(classifyInput);
    const captionPlusOcr = [content.caption, cls.extractedText].filter(Boolean).join("\\n");

    // --- r65: بوابة المحتوى الدراسي ---
    // منشور جديد في مصدر مكتبة (ليس مساحة فوج) بلا ربط إداري بمقياس:
    // لا يُضاف إلا إن كان محتوى دراسيّاً يطابق مقياساً فعلاً — فلا تدخل
    // المكتبةَ رسالة ترحيب ولا نقاش عام ولا ذِكر عرضي لمقياس
    // («لدينا 10 مقاييس لكن ليست الهندسة المعمارية»).
    const boundModuleId = source.moduleId ?? bindingModuleId;
    if (existingId == null && source.cohortId == null && boundModuleId == null) {
      if (!cls.isCourse || cls.moduleMatch == null) return "skipped";
    }

    // --- الكتابة (upsert مع حماية حقول التنقيح) ---
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      if (existingId == null) {
        const { error } = await supabase.from("telegram_items").insert({
          source_id: source.id,
          tg_message_id: msg.message_id,
          media_group_id: content.mediaGroupId,
          kind: content.kind,
          title_ar: cls.title,
          caption_text: captionPlusOcr,
          search_text: buildSearchText(cls.title, captionPlusOcr, content.fileName),
          file_name: content.fileName,
          mime_type: content.mimeType,
          file_id: content.fileId,
          file_unique_id: content.fileUniqueId,
          size_bytes: content.sizeBytes,
          link,
          specialty_id: source.specialtyId,
          module_id: boundModuleId ?? cls.moduleMatch?.id ?? null,
          item_type: cls.itemType,
          origin: "telegram",
          posted_by: postedBy,
          cohort_id: source.cohortId,
          is_hidden: false,
          is_featured: false,
          ai_classified: cls.aiClassified,
          posted_at: postedAt,
        });
        if (error) return "ignored";
      } else {
        // تحديث المنشور (تعديل أصحاب القناة أو إعادة إرسال): نحدّث
        // المحتوى والرابط فقط — التنقيح الإداري محمي.
        const patch: Record<string, unknown> = {
          caption_text: captionPlusOcr,
          search_text: buildSearchText(existingTitle || cls.title, captionPlusOcr, content.fileName),
          file_name: content.fileName,
          mime_type: content.mimeType,
          file_id: content.fileId,
          file_unique_id: content.fileUniqueId,
          size_bytes: content.sizeBytes,
          media_group_id: content.mediaGroupId,
          link,
          posted_at: postedAt,
          ai_classified: cls.aiClassified,
        };
        if (!existingTitle.trim()) patch.title_ar = cls.title;
        // r64/r65: املأ المقياس حين يكون فارغاً فقط — ربط الموضوع
        // الإداري أولاً ثم مطابقة التصنيف؛ الربط اليدوي محمي دائماً.
        if (existingModuleId == null) {
          const fill = bindingModuleId ?? (source.moduleId == null && cls.moduleMatch ? cls.moduleMatch.id : null);
          if (fill != null) patch.module_id = fill;
        }
        await supabase.from("telegram_items").update(patch).eq("id", existingId);
      }
      if (update.update_id > source.lastUpdateId) {
        await supabase.from("telegram_sources").update({ last_update_id: update.update_id }).eq("id", source.id);
      }
      return existingId != null ? "updated" : "inserted";
    }

    // --- Prisma (محلي) ---
    if (existingId == null) {
      await db.telegramItem.create({
        data: {
          sourceId: source.id, tgMessageId: msg.message_id, mediaGroupId: content.mediaGroupId,
          kind: content.kind, titleAr: cls.title, captionText: captionPlusOcr,
          searchText: buildSearchText(cls.title, captionPlusOcr, content.fileName),
          fileName: content.fileName, mimeType: content.mimeType, fileId: content.fileId,
          fileUniqueId: content.fileUniqueId, sizeBytes: content.sizeBytes, link,
          specialtyId: source.specialtyId, moduleId: boundModuleId ?? cls.moduleMatch?.id ?? null, itemType: cls.itemType,
          origin: "telegram", postedBy, cohortId: source.cohortId,
          isHidden: false, isFeatured: false, aiClassified: cls.aiClassified,
          postedAt: new Date(postedAt),
        },
      });
    } else {
      await db.telegramItem.update({
        where: { id: existingId },
        data: {
          captionText: captionPlusOcr,
          searchText: buildSearchText(existingTitle || cls.title, captionPlusOcr, content.fileName),
          fileName: content.fileName, mimeType: content.mimeType, fileId: content.fileId,
          fileUniqueId: content.fileUniqueId, sizeBytes: content.sizeBytes,
          mediaGroupId: content.mediaGroupId, link, postedAt: new Date(postedAt),
          aiClassified: cls.aiClassified,
          ...(existingTitle ? {} : { titleAr: cls.title }),
          ...(existingModuleId == null && (bindingModuleId != null || (source.moduleId == null && cls.moduleMatch))
            ? { moduleId: bindingModuleId ?? cls.moduleMatch!.id }
            : {}),
        },
      });
    }
    if (update.update_id > source.lastUpdateId) {
      await db.telegramSource.update({ where: { id: source.id }, data: { lastUpdateId: update.update_id } });
    }
    return existingId != null ? "updated" : "inserted";
  } catch {
    return "ignored";
  }
}

'''
src = src[:i] + new_body + src[j + len("  } catch {\n    return \"ignored\";\n  }\n}\n\n"):]

io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — {applied + 1} patches applied. {orig_len} → {len(src)} chars")
