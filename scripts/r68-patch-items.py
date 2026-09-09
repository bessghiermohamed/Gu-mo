#!/usr/bin/env python3
# r68 — patch src/app/api/telegram/items/route.ts
# 1) resolveMyTrackId (scope OR cohort-derived, like the year)
# 2) library mode: drop items from sources bound to a different track + trackLock response
# 3) DELETE ?ids=1,2,3 — bulk delete with per-item permission checks

import io, sys

PATH = "src/app/api/telegram/items/route.ts"
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


# ---------------------------------------------------------------- 1) resolveMyTrackId
patch(
    '''async function loadItem(id: number): Promise<ItemRow | null> {''',
    '''/**
 * r68: ممح الطالب/الممثل (الملمح — PEP/PEM/PES…) — يُشتق تلقائياً كالسنة:
 * نطاقه إن حُدد عند الإعداد، وإلا ممح فوجه المنضم إليه. المصدر المربوط
 * بملمح معين تظهر منشوراته لطلبة ذلك الممح فقط في المكتبة.
 */
async function resolveMyTrackId(user: { id: number; scopeTrackId: number | null; scopeCohortGroupId: number | null }): Promise<number | null> {
  if (user.scopeTrackId != null) return user.scopeTrackId;
  const cohortId = await resolveMyCohort(user);
  if (cohortId == null) return null;
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("cohort_groups")
        .select("track_id")
        .eq("id", cohortId)
        .maybeSingle();
      return data && (data as Record<string, unknown>).track_id != null
        ? Number((data as Record<string, unknown>).track_id)
        : null;
    }
    const c = await db.cohortGroup.findUnique({ where: { id: cohortId }, select: { trackId: true } });
    return c?.trackId ?? null;
  } catch {
    return null; // عمود الممح غائب — بلا تقييد
  }
}

async function loadItem(id: number): Promise<ItemRow | null> {''',
)

# ---------------------------------------------------------------- 2) resolve track in GET
patch(
    '''    const yearLocked = mode === "library" && myYearId != null;
''',
    '''    const yearLocked = mode === "library" && myYearId != null;
    // r68: عزل الممح — ممح المصدر (إن حُدد) يحكم ظهوره لطلبة الممح نفسه
    const trackRestricted =
      mode === "library" && (user.role === "STUDENT" || user.role === "REPRESENTATIVE");
    const myTrackId = trackRestricted ? await resolveMyTrackId(user) : null;
''',
)

# ---------------------------------------------------------------- 3) filter rows by source track
# (pure-code anchors only — the Read tool display distorts some Arabic comments)
patch(
    '''    const srcIds = Array.from(new Set(rows.map((r) => r.sourceId).filter((x): x is number => x != null)));
    let moduleNames: Record<number, string> = {};
''',
    '''    const srcIds = Array.from(new Set(rows.map((r) => r.sourceId).filter((x): x is number => x != null)));

    // r68: منشورات المصادر المربوطة بملمح آخر تُحذف من عرض المتصل —
    // المصدر المربط بملمح يظهر لطلبة ذلك الممح فقط (وغير المربط للجميع)
    if (trackRestricted) {
      if (srcIds.length > 0) {
        const trackBySource: Record<number, number | null> = {};
        try {
          if (isVercel) {
            const supabase = await createSupabaseServerClient();
            const { data: srcs } = await supabase.from("telegram_sources").select("id, track_id").in("id", srcIds);
            for (const s of srcs ?? []) {
              const r = s as Record<string, unknown>;
              trackBySource[Number(r.id)] = r.track_id == null ? null : Number(r.track_id);
            }
          } else {
            const srcs = await db.telegramSource.findMany({ where: { id: { in: srcIds } }, select: { id: true, trackId: true } });
            for (const s of srcs) trackBySource[s.id] = s.trackId;
          }
        } catch { /* عمود الممح غائب — بلا تقييد */ }
        rows = rows.filter((r) => {
          if (r.sourceId == null) return true; // إضافة يدوية — ليست مصدراً مربوطاً بملمح
          const t = trackBySource[r.sourceId];
          return t == null || t === myTrackId;
        });
      }
    }

    let moduleNames: Record<number, string> = {};
''',
)

# ---------------------------------------------------------------- 4) trackLock response
patch(
    '''      } catch { yearLock = { yearId: myYearId as number, yearName: "" }; }
    }
''',
    '''      } catch { yearLock = { yearId: myYearId as number, yearName: "" }; }
    }

    // r68: اسم ممح القفل — يُعرض مع السنة في شريحة «تعرض مكتبتك فقط»
    let trackLock: { trackId: number; trackName: string } | null = null;
    if (trackRestricted && myTrackId != null) {
      try {
        if (isVercel) {
          const supabase = await createSupabaseServerClient();
          const { data: t } = await supabase.from("academic_tracks").select("track_name_ar").eq("id", myTrackId).maybeSingle();
          trackLock = { trackId: myTrackId, trackName: String((t as Record<string, unknown> | null)?.track_name_ar ?? "") };
        } else {
          const t = await db.academicTrack.findUnique({ where: { id: myTrackId }, select: { trackNameAr: true } });
          trackLock = { trackId: myTrackId, trackName: t?.trackNameAr ?? "" };
        }
      } catch { trackLock = { trackId: myTrackId, trackName: "" }; }
    }
''',
)

patch(
    '''      myCohortId,
      yearLock,
      setup: { bot: await isBotConfigured(), activeSources },
''',
    '''      myCohortId,
      yearLock,
      trackLock,
      setup: { bot: await isBotConfigured(), activeSources },
''',
)

# ---------------------------------------------------------------- 5) bulk DELETE
patch(
    '''  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
''',
    '''  const url = new URL(req.url);

  // ---------- r68: حذف جماعي — ids=1,2,3 (حتى ٢٠٠) ----------
  // لتنظيف المنشورات المصنّفة خطأً دفعة واحدة بدل حذفها واحدة واحدة؛
  // كل منشور يتحقق من نطاق المشرف قبل حذفه (خارج النطاق يُتخطى).
  const idsParam = url.searchParams.get("ids");
  if (idsParam) {
    if (!canUploadContent(user)) {
      return NextResponse.json({ error: "الحذف الجماعي متاح للمشرفين فقط" }, { status: 403 });
    }
    const ids = Array.from(
      new Set(
        idsParam
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    ).slice(0, 200);
    if (ids.length === 0) return NextResponse.json({ error: "ids غير صالحة" }, { status: 400 });
    try {
      const items: ItemRow[] = [];
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data } = await supabase.from("telegram_items").select("*").in("id", ids);
        for (const r of (data ?? []) as unknown[]) {
          const m = r as Record<string, unknown>;
          items.push({
            id: Number(m.id), sourceId: m.source_id == null ? null : Number(m.source_id),
            tgMessageId: Number(m.tg_message_id ?? 0), mediaGroupId: String(m.media_group_id ?? ""),
            kind: String(m.kind ?? "text"), titleAr: String(m.title_ar ?? ""), captionText: String(m.caption_text ?? ""),
            fileName: String(m.file_name ?? ""), mimeType: String(m.mime_type ?? ""), fileId: String(m.file_id ?? ""),
            sizeBytes: Number(m.size_bytes ?? 0), link: String(m.link ?? ""), specialtyId: Number(m.specialty_id ?? 1),
            moduleId: m.module_id == null ? null : Number(m.module_id), itemType: String(m.item_type ?? "عام"),
            origin: String(m.origin ?? "telegram"), postedBy: String(m.posted_by ?? ""),
            cohortId: m.cohort_id == null ? null : Number(m.cohort_id), isHidden: !!m.is_hidden, isFeatured: !!m.is_featured,
            aiClassified: !!m.ai_classified, postedAt: (m.posted_at as string | null) ?? null,
          });
        }
      } else {
        items.push(...((await db.telegramItem.findMany({ where: { id: { in: ids } } })) as unknown as ItemRow[]));
      }
      const allowed: number[] = [];
      for (const it of items) {
        if (await canCurateItem(user, it)) allowed.push(it.id);
      }
      if (allowed.length === 0) {
        return NextResponse.json({ error: "لا توجد منشورات ضمن نطاقك في هذا التحديد" }, { status: 403 });
      }
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.from("telegram_items").delete().in("id", allowed);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        await db.telegramItem.deleteMany({ where: { id: { in: allowed } } });
      }
      const skipped = ids.length - allowed.length;
      return NextResponse.json({
        ok: true,
        deleted: allowed.length,
        skipped,
        message: `حُذف ${allowed.length} منشوراً نهائياً${skipped > 0 ? ` — تُجاهل ${skipped} خارج نطاقك` : ""}`,
      });
    } catch (e) {
      return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
    }
  }

  const id = Number(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
''',
)

io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — {applied} patches applied. {orig_len} → {len(src)} chars")
