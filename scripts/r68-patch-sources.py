#!/usr/bin/env python3
# r68 — patch src/app/api/telegram/sources/route.ts
# Multi-link (same channel N times w/ different rules) + specialty/track selection + GET badges + PATCH track.
# Every patch asserts exactly-one anchor occurrence before writing.

import io, sys

PATH = "src/app/api/telegram/sources/route.ts"
src = io.open(PATH, encoding="utf-8").read()
orig_len = len(src)
applied = 0


def patch(anchor: str, replacement: str, count: int = 1):
    global src, applied
    n = src.count(anchor)
    if n != count:
        print(f"FAIL: anchor found {n}x (expected {count}). Head of anchor:\n{anchor[:100]!r}")
        sys.exit(1)
    src = src.replace(anchor, replacement)
    applied += 1


# ---------------------------------------------------------------- 1) helpers
patch(
    '''function sectionChannelId(chatId: string, threadId: number): string {
  return `${chatId}:${threadId}`;
}
''',
    '''function sectionChannelId(chatId: string, threadId: number): string {
  return `${chatId}:${threadId}`;
}

/** r68: كل صفوف الربط لهذه القناة — الصف الأساسي (المعرّف المجرد) ثم
 * التنويعات «chatId#N» (نفس القناة مربوطة مرات عدة بقواعد مختلفة —
 * تخصص/ملمح/سنة/مقياس/فوج). الأقسام المستقلة «chatId:threadId» ليست
 * منها لأنها تُعالج بمفتاحها الكامل (r66). الترتيب: الأساسي أولاً. */
async function findChannelBindings(chatId: string): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  const isBinding = (id: string) => id === chatId || id.startsWith(`${chatId}#`);
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("telegram_sources")
      .select("id, tg_channel_id, tg_username, title_ar, source_type, kind, specialty_id, track_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
      .like("tg_channel_id", `${chatId}%`);
    for (const r of (data ?? []) as unknown[]) {
      const row = mapVercelSourceRow(r);
      if (isBinding(row.tgChannelId)) rows.push(row);
    }
  } else {
    const found = await db.telegramSource.findMany({ where: { tgChannelId: { startsWith: chatId } } });
    for (const s of found) if (isBinding(s.tgChannelId)) rows.push(s);
  }
  rows.sort((a, b) =>
    a.tgChannelId === chatId ? -1 : b.tgChannelId === chatId ? 1 : a.id - b.id
  );
  return rows;
}

/** r68: أول لاحقة تنويعة غير مستعملة لهذه القناة (#2، #3…) — عمود
 * tg_channel_id نصي فريد فتعمل التنويعات بلا أي تغيير هيكلي. */
function nextVariantSuffix(bindings: SourceRow[], chatId: string): number {
  const used = new Set<number>();
  for (const b of bindings) {
    if (b.tgChannelId.startsWith(`${chatId}#`)) {
      const n = parseInt(b.tgChannelId.slice(chatId.length + 1), 10);
      if (Number.isFinite(n) && n > 0) used.add(n);
    }
  }
  let n = 2;
  while (used.has(n)) n += 1;
  return n;
}
''',
)

# ---------------------------------------------------------------- 2) GET badges + fixed attribution
patch(
    '''    // r66: المسار البديل — الأقسام المستقلة (مركّبة "chat:thread") تُحتسب
    // لقناتها الأم فتظهر «أقسام مرتبطة» حتى بلا جدول مواضيع
    const idByChat: Record<string, number> = {};
    for (const s of sources) if (!s.tgChannelId.includes(":")) idByChat[s.tgChannelId] = s.id;
    const sectionCounts: Record<number, number> = {};
    for (const s of sources) {
      const i = s.tgChannelId.indexOf(":");
      if (i > 0) {
        const pid = idByChat[s.tgChannelId.slice(0, i)];
        if (pid != null) sectionCounts[pid] = (sectionCounts[pid] ?? 0) + 1;
      }
    }
''',
    '''    // r68: أسماء التخصصات والملامح لشارات قائمة المصادر (الربط المتعدد)
    let specialtyNames: Record<number, string> = {};
    let trackNames: Record<number, string> = {};
    try {
      const specIds = Array.from(new Set(sources.map((s) => s.specialtyId)));
      const trackIds = Array.from(new Set(sources.map((s) => s.trackId).filter((x): x is number => x != null)));
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        if (specIds.length > 0) {
          const { data: specs } = await supabase.from("specialties").select("id, name_ar").in("id", specIds);
          for (const sp of specs ?? []) specialtyNames[Number((sp as Record<string, unknown>).id)] = String((sp as Record<string, unknown>).name_ar ?? "");
        }
        if (trackIds.length > 0) {
          const { data: trs } = await supabase.from("academic_tracks").select("id, track_name_ar").in("id", trackIds);
          for (const tr of trs ?? []) trackNames[Number((tr as Record<string, unknown>).id)] = String((tr as Record<string, unknown>).track_name_ar ?? "");
        }
      } else {
        for (const id of specIds) {
          const sp = await db.specialty.findUnique({ where: { id }, select: { nameAr: true } });
          if (sp) specialtyNames[id] = sp.nameAr;
        }
        for (const id of trackIds) {
          const tr = await db.academicTrack.findUnique({ where: { id }, select: { trackNameAr: true } });
          if (tr) trackNames[id] = tr.trackNameAr;
        }
      }
    } catch { /* الشارات تحسينية — بلا أسماء عند غياب الأعمدة */ }

    // r68: معرّف القناة مجرّداً من لواحق التنويعات (#N) والأقسام (:thread)
    const baseChat = (id: string) => id.replace(/:\\d+$/, "").replace(/#\\d+$/, "");
    // r66: المسار البديل — الأقسام المستقلة (مركّبة "chat:thread") تُحتسب
    // لقناتها الأم؛ r68: الصف الأساسي (بلا لاحقة #) هو الأم المعتمد
    const idByChat: Record<string, number> = {};
    for (const s of sources) {
      if (s.tgChannelId.includes(":")) continue;
      const base = baseChat(s.tgChannelId);
      if (!(base in idByChat) || !s.tgChannelId.includes("#")) idByChat[base] = s.id;
    }
    const sectionCounts: Record<number, number> = {};
    for (const s of sources) {
      const i = s.tgChannelId.indexOf(":");
      if (i > 0) {
        const pid = idByChat[baseChat(s.tgChannelId.slice(0, i))];
        if (pid != null) sectionCounts[pid] = (sectionCounts[pid] ?? 0) + 1;
      }
    }
    // r68: عدد روابط القناة الواحدة — الربط المتعدد بقواعد مختلفة
    const linkCounts: Record<number, number> = {};
    {
      const byBase: Record<string, number> = {};
      for (const s of sources) {
        if (s.tgChannelId.includes(":")) continue;
        const base = baseChat(s.tgChannelId);
        byBase[base] = (byBase[base] ?? 0) + 1;
      }
      for (const s of sources) {
        if (s.tgChannelId.includes(":")) continue;
        linkCounts[s.id] = byBase[baseChat(s.tgChannelId)] ?? 1;
      }
    }
''',
)

# response rows gain specialtyName/trackName/linkCount
patch(
    '''        topicCount: (topicCounts[s.id] ?? 0) + (sectionCounts[s.id] ?? 0),
        isSection: s.tgChannelId.includes(":"),
      })),
''',
    '''        topicCount: (topicCounts[s.id] ?? 0) + (sectionCounts[s.id] ?? 0),
        isSection: s.tgChannelId.includes(":"),
        specialtyName: specialtyNames[s.specialtyId] ?? null,
        trackName: s.trackId != null ? trackNames[s.trackId] ?? null : null,
        linkCount: linkCounts[s.id] ?? 1,
      })),
''',
)

# ---------------------------------------------------------------- 3) POST specialty + track selection
patch(
    '''    const specialtyId = user.assignedSpecialtyId;
    const targetError = await assertTargetsInSpecialty(specialtyId, moduleId, cohortId);
''',
    '''    // r68: التخصص الهدف للربط — المالك يستطيع ربط القناة لتخصص آخر
    // (تنويعة مستقلة لنفس القناة تظهر لطلبة ذلك التخصص)، وبقية الأدوار
    // مقيّدة بتخصصهم دائماً كما كان.
    let specialtyId = user.assignedSpecialtyId;
    if (body.specialtyId != null && Number(body.specialtyId) > 0) {
      if (user.role !== "OWNER") {
        return NextResponse.json({ error: "اختيار تخصص آخر متاح للمالك فقط — أنت مقيّد بتخصصك" }, { status: 403 });
      }
      const sid = Number(body.specialtyId);
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: spec } = await supabase.from("specialties").select("id").eq("id", sid).maybeSingle();
        if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 400 });
      } else {
        const spec = await db.specialty.findUnique({ where: { id: sid }, select: { id: true } });
        if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 400 });
      }
      specialtyId = sid;
    }
    // r68: الممح/الشعبة — الربط يظهر لطلبة هذا الممح فقط (اختياري)،
    // ويجب أن يتبع التخصص المختار
    let trackId = body.trackId != null && Number(body.trackId) > 0 ? Number(body.trackId) : null;
    if (trackId != null) {
      const trackOk = await (async () => {
        try {
          if (isVercel) {
            const supabase = await createSupabaseServerClient();
            const { data: tr } = await supabase.from("academic_tracks").select("id").eq("id", trackId).eq("specialty_id", specialtyId).maybeSingle();
            return !!tr;
          }
          const tr = await db.academicTrack.findFirst({ where: { id: trackId, specialtyId }, select: { id: true } });
          return !!tr;
        } catch {
          return false;
        }
      })();
      if (!trackOk) return NextResponse.json({ error: "الملمح المختار لا يتبع التخصص المحدد" }, { status: 400 });
    }
    const targetError = await assertTargetsInSpecialty(specialtyId, moduleId, cohortId);
''',
)

# ---------------------------------------------------------------- 4) POST Vercel branch — multi-link
start4 = '''    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase
        .from("telegram_sources")
        .select("id, tg_channel_id, tg_username, title_ar, source_type, kind, specialty_id, track_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
        .eq("tg_channel_id", tgChannelId)
        .maybeSingle();
'''
# the old Vercel branch tail = final return + closing brace, then the Prisma branch starts
tail4 = '''      return NextResponse.json({ source: data });
    }
'''
boundary4 = tail4 + '''    const dup = await db.telegramSource.findUnique({ where: { tgChannelId } });
'''
i4 = src.find(start4)
b4 = src.find(boundary4)
if i4 < 0 or b4 < 0 or b4 <= i4:
    print("FAIL: Vercel POST anchors not found/ordered")
    sys.exit(1)
if src.count(start4) != 1 or src.count(boundary4) != 1:
    print("FAIL: Vercel POST anchors not unique")
    sys.exit(1)

new_vercel = '''    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // r68: كل روابط هذه القناة — الأساسية والتنويعات (#N)
      const bindings = await findChannelBindings(tgChannelId);

      // r66: رابط قسم داخل قناة مربوطة → القسم يُضاف تحت الربط الأساسي
      if (threadId != null && sourceType === "channel" && bindings.length > 0) {
        const parent = bindings[0];
        if (user.role !== "OWNER" && parent.specialtyId !== specialtyId) {
          return NextResponse.json({ error: "هذه القناة مربوطة لتخصص آخر — اطلب من المالك نقلها أو اربط قسماً ضمن تخصصك" }, { status: 403 });
        }
        const parentTitle = parent.titleAr || titleAr;
        const res = await upsertTopicBinding(parent.id, threadId, topicTitle, handle, yearId, moduleId);
        if (!res.ok) {
          // r66: جدول المواضيع غير منشأ (الإنتاج بلا DDL) — القسم يعمل
          // مصدراً مستقلاً بمُعرّف مركّب "chat:thread" تحت القناة نفسها
          if (res.reason === "missing-table") {
            const sec = await upsertSectionSource({
              chatId: tgChannelId, threadId, title: topicTitle, yearId, moduleId,
              parent: {
                tgUsername: parent.tgUsername || tgUsername,
                titleAr: parentTitle,
                sourceType: parent.sourceType || sourceType,
                kind: parent.kind || kind,
                specialtyId: parent.specialtyId,
                trackId: parent.trackId,
                semester: parent.semester,
              },
            });
            if (!sec.ok) return NextResponse.json({ error: sec.error }, { status: 500 });
            return NextResponse.json({
              source: sec.sectionSource,
              topicAdded: true,
              created: sec.created,
              message: sec.created
                ? `أُضيف «${topicTitle}» قسماً منفصلاً تحت «${parentTitle}» — يظهر في قائمة المصادر قسماً مستقلاً، ومنشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه ولا تظهر لغيره`
                : `حدُّث ربط القسم «${topicTitle}» تحت «${parentTitle}» (قسم مستقل في المصادر)`,
            });
          }
          return NextResponse.json({ error: res.error }, { status: 500 });
        }
        invalidateTopicCache(parent.id);
        return NextResponse.json({
          source: parent,
          topicAdded: true,
          created: res.created,
          message: res.created
            ? `أُضيف «${topicTitle}» قسماً منفصلاً تحت القناة الموجودة — منشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه ولا تظهر لغيره`
            : `حدُّث ربط القسم «${topicTitle}» تحت القناة الموجودة`,
        });
      }

      // r68: الربط المتعدد — نفس القناة بقواعد مختلفة (تخصص/ملمح/سنة/
      // سداسي/مقياس/فوج). نفس القواعد تماماً = رفض؛ أي اختلاف = ربط إضافي.
      const semesterVal = body.semester === 2 ? 2 : body.semester === 1 ? 1 : null;
      const sameRule = bindings.find(
        (b) =>
          b.sourceType === sourceType &&
          b.specialtyId === specialtyId &&
          (b.trackId ?? null) === (trackId ?? null) &&
          (b.yearId ?? null) === (yearId ?? null) &&
          (b.semester ?? null) === (semesterVal ?? null) &&
          (b.moduleId ?? null) === (moduleId ?? null) &&
          (b.cohortId ?? null) === (cohortId ?? null)
      );
      if (sameRule) {
        return NextResponse.json(
          { error: "هذه القناة مربوطة مسبقاً بهذه القواعد نفسها — لتكرار ربطها غيّر قاعدة واحدة على الأقل (التخصص أو الممح أو السنة/السداسي/المقياس/الفوج)" },
          { status: 409 }
        );
      }
      const rowChannelId = bindings.length === 0 ? tgChannelId : `${tgChannelId}#${nextVariantSuffix(bindings, tgChannelId)}`;

      const { data, error } = await supabase
        .from("telegram_sources")
        .insert({
          tg_channel_id: rowChannelId, tg_username: tgUsername, title_ar: titleAr,
          source_type: sourceType, kind, specialty_id: specialtyId,
          track_id: trackId,
          year_id: yearId, semester: semesterVal,
          module_id: moduleId, cohort_id: cohortId, is_active: true,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // r66: قناة جديدة برابط قسم → أنشئ رابط القسم فوراً تحتها
      if (threadId != null && sourceType === "channel" && data) {
        const newId = Number((data as Record<string, unknown>).id);
        const res = await upsertTopicBinding(newId, threadId, topicTitle, handle, yearId, moduleId);
        if (res.ok) {
          return NextResponse.json({
            source: data,
            topicAdded: true,
            created: true,
            message: `رُبطت القناة وأُضيف «${topicTitle}» قسماً منفصلاً فيها — منشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه`,
          });
        }
        // r66: جدول المواضيع غائب — المسار البديل: قسم مستقل مركّب
        if (res.reason === "missing-table") {
          const sec = await upsertSectionSource({
            chatId: tgChannelId, threadId, title: topicTitle, yearId, moduleId,
            parent: { tgUsername, titleAr, sourceType, kind, specialtyId, trackId, semester: semesterVal },
          });
          if (sec.ok) {
            return NextResponse.json({
              source: data,
              topicAdded: true,
              created: true,
              message: `رُبطت القناة وأُضيف «${topicTitle}» قسماً منفصلاً فيها (قسم مستقل في المصادر) — منشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه`,
            });
          }
          return NextResponse.json({ source: data, topicAdded: false, warning: sec.error });
        }
        // فشل آخر — نجاح جزئي مع توضيح
        return NextResponse.json({ source: data, topicAdded: false, warning: res.error });
      }
      // r68: رسالة تفرّق بين الربط الأول والتنويعات الإضافية
      return NextResponse.json({
        source: data,
        linkedVariations: bindings.length + 1,
        message:
          bindings.length === 0
            ? cohortId
              ? "تم الربط — كل ما يُنشر فيها سيظهر في مساحة الفوج المشتركة تلقائياً (تأكد أن البوت مشرف)"
              : "تم ربط القناة — منشوراتها الجديدة ستُستورد وتُصنّف تلقائياً (البوت مشرف فيها)"
            : `رُبطت القناة بتنويعة إضافية (الربط رقم ${bindings.length + 1} لها) — منشوراتها ستُصنَّف وفق قواعد هذا الربط وتظهر لمن تنطبق عليه فقط`,
      });
    }
'''
# consume [i4, b4 + len(tail4)) — the old branch incl. its final return + closing brace
src = src[:i4] + new_vercel + src[b4 + len(tail4):]
applied += 1

# ---------------------------------------------------------------- 5) POST Prisma branch — multi-link
start5 = '''    const dup = await db.telegramSource.findUnique({ where: { tgChannelId } });
'''
tail5 = '''    return NextResponse.json({ source: created });
'''
i5 = src.find(start5)
b5 = src.find(tail5)
if i5 < 0 or b5 < 0 or b5 <= i5:
    print("FAIL: Prisma POST anchors not found/ordered")
    sys.exit(1)
if src.count(start5) != 1:
    print("FAIL: Prisma POST start anchor not unique")
    sys.exit(1)

new_prisma = '''    const bindings = await findChannelBindings(tgChannelId);

    // r66: رابط قسم داخل قناة مربوطة → القسم يُضاف تحت الربط الأساسي
    if (threadId != null && sourceType === "channel" && bindings.length > 0) {
      const parent = bindings[0];
      if (user.role !== "OWNER" && parent.specialtyId !== specialtyId) {
        return NextResponse.json({ error: "هذه القناة مربوطة لتخصص آخر — اطلب من المالك نقلها أو اربط قسماً ضمن تخصصك" }, { status: 403 });
      }
      const res = await upsertTopicBinding(parent.id, threadId, topicTitle, handle, yearId, moduleId);
      if (!res.ok) {
        // r66: المسار البديل عند غياب جدول المواضيع — قسم مستقل مركّب
        if (res.reason === "missing-table") {
          const sec = await upsertSectionSource({
            chatId: tgChannelId, threadId, title: topicTitle, yearId, moduleId,
            parent: {
              tgUsername: parent.tgUsername, titleAr: parent.titleAr, sourceType: parent.sourceType,
              kind: parent.kind, specialtyId: parent.specialtyId, trackId: parent.trackId, semester: parent.semester,
            },
          });
          if (!sec.ok) return NextResponse.json({ error: sec.error }, { status: 500 });
          return NextResponse.json({
            source: sec.sectionSource,
            topicAdded: true,
            created: sec.created,
            message: sec.created
              ? `أُضيف «${topicTitle}» قسماً منفصلاً تحت «${parent.titleAr}» — يظهر في قائمة المصادر قسماً مستقلاً، ومنشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه ولا تظهر لغيره`
              : `حدُّث ربط القسم «${topicTitle}» تحت «${parent.titleAr}» (قسم مستقل في المصادر)`,
          });
        }
        return NextResponse.json({ error: res.error }, { status: 500 });
      }
      invalidateTopicCache(parent.id);
      return NextResponse.json({
        source: parent,
        topicAdded: true,
        created: res.created,
        message: res.created
          ? `أُضيف «${topicTitle}» قسماً منفصلاً تحت القناة الموجودة — منشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه ولا تظهر لغيره`
          : `حدُّث ربط القسم «${topicTitle}» تحت القناة الموجودة`,
      });
    }

    // r68: الربط المتعدد — رفض تكرار نفس القواعد، والاختلاف = ربط إضافي
    const semesterVal = body.semester === 2 ? 2 : body.semester === 1 ? 1 : null;
    const sameRule = bindings.find(
      (b) =>
        b.sourceType === sourceType &&
        b.specialtyId === specialtyId &&
        (b.trackId ?? null) === (trackId ?? null) &&
        (b.yearId ?? null) === (yearId ?? null) &&
        (b.semester ?? null) === (semesterVal ?? null) &&
        (b.moduleId ?? null) === (moduleId ?? null) &&
        (b.cohortId ?? null) === (cohortId ?? null)
    );
    if (sameRule) {
      return NextResponse.json(
        { error: "هذه القناة مربوطة مسبقاً بهذه القواعد نفسها — لتكرار ربطها غيّر قاعدة واحدة على الأقل (التخصص أو الممح أو السنة/السداسي/المقياس/الفوج)" },
        { status: 409 }
      );
    }
    const rowChannelId = bindings.length === 0 ? tgChannelId : `${tgChannelId}#${nextVariantSuffix(bindings, tgChannelId)}`;

    const created = await db.telegramSource.create({
      data: {
        tgChannelId: rowChannelId, tgUsername, titleAr, sourceType, kind, specialtyId,
        trackId, yearId, semester: semesterVal,
        moduleId, cohortId, isActive: true,
      },
    });
    // r66: قناة جديدة برابط قسم → أنشئ ربط القسم فوراً تحتها
    if (threadId != null && sourceType === "channel") {
      const res = await upsertTopicBinding(created.id, threadId, topicTitle, handle, yearId, moduleId);
      if (res.ok) {
        return NextResponse.json({
          source: created,
          topicAdded: true,
          created: true,
          message: `رُبطت القناة وأُضيف «${topicTitle}» قسماً منفصلاً فيها — منشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه`,
        });
      }
      // r66: جدول المواضيع غائب — المسار البديل: قسم مستقل مركّب
      if (res.reason === "missing-table") {
        const sec = await upsertSectionSource({
          chatId: tgChannelId, threadId, title: topicTitle, yearId, moduleId,
          parent: { tgUsername, titleAr, sourceType, kind, specialtyId, trackId, semester: semesterVal },
        });
        if (sec.ok) {
          return NextResponse.json({
            source: created,
            topicAdded: true,
            created: true,
            message: `رُبطت القناة وأُضيف «${topicTitle}» قسماً منفصلاً فيها (قسم مستقل في المصادر) — منشوراته القادمة ستُصنَّف تلقائياً إلى نطاقه`,
          });
        }
        return NextResponse.json({ source: created, topicAdded: false, warning: sec.error });
      }
      return NextResponse.json({ source: created, topicAdded: false, warning: res.error });
    }
    return NextResponse.json({
      source: created,
      linkedVariations: bindings.length + 1,
      message:
        bindings.length === 0
          ? "تم ربط القناة — منشوراتها الجديدة ستُستورد وتُصنّف تلقائياً"
          : `رُبطت القناة بتنويعة إضافية (الربط رقم ${bindings.length + 1} لها) — منشوراتها ستُصنَّف وفق قواعد هذا الربط وتظهر لمن تنطبق عليه فقط`,
    });
'''
# consume [i5, b5 + len(tail5))
src = src[:i5] + new_prisma + src[b5 + len(tail5):]
applied += 1

# ---------------------------------------------------------------- 6) PATCH track support
patch(
    '''      newSpecialtyId = sid;
    }

    const applyToItems = body.applyToItems === true;
''',
    '''      newSpecialtyId = sid;
    }

    // r68: الممح — تحديث قاعدة الربط (يجب أن يتبع تخصص المصدر النهائي)
    let newTrackId = source.trackId;
    if (body.trackId !== undefined) {
      const tid = body.trackId != null && Number(body.trackId) > 0 ? Number(body.trackId) : null;
      if (tid != null) {
        let trackOk = false;
        try {
          if (isVercel) {
            const supabase = await createSupabaseServerClient();
            const { data: tr } = await supabase.from("academic_tracks").select("id").eq("id", tid).eq("specialty_id", newSpecialtyId).maybeSingle();
            trackOk = !!tr;
          } else {
            const tr = await db.academicTrack.findFirst({ where: { id: tid, specialtyId: newSpecialtyId }, select: { id: true } });
            trackOk = !!tr;
          }
        } catch {
          trackOk = false;
        }
        if (!trackOk) return NextResponse.json({ error: "الملمح المختار لا يتبع تخصص المصدر" }, { status: 400 });
        newTrackId = tid;
      } else {
        newTrackId = null;
      }
    }

    const applyToItems = body.applyToItems === true;
''',
)

patch(
    '''      if (body.semester !== undefined) patch.semester = body.semester === 2 ? 2 : body.semester === 1 ? 1 : null;
      if (body.isActive !== undefined) patch.is_active = !!body.isActive;
''',
    '''      if (body.semester !== undefined) patch.semester = body.semester === 2 ? 2 : body.semester === 1 ? 1 : null;
      if (body.trackId !== undefined) patch.track_id = newTrackId;
      if (body.isActive !== undefined) patch.is_active = !!body.isActive;
''',
)

patch(
    '''          ...(body.semester !== undefined ? { semester: body.semester === 2 ? 2 : body.semester === 1 ? 1 : null } : {}),
          ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
''',
    '''          ...(body.semester !== undefined ? { semester: body.semester === 2 ? 2 : body.semester === 1 ? 1 : null } : {}),
          ...(body.trackId !== undefined ? { trackId: newTrackId } : {}),
          ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
''',
)

io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — {applied} patches applied. {orig_len} → {len(src)} chars")
