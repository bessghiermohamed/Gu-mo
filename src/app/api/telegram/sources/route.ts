/**
 * Telegram sources API (round 7) — إدارة القنوات والمجموعات المربوطة
 *
 * GET    → قائمة المصادر مع عدد المنشورات (مشرفو التخصص/المالك)
 * POST   → ربط قناة/مجموعة جديدة (يقرأ بياناتها من تيليجرام إن توفر التوكن)
 * PATCH  → تعديل الربط/الاسم/التفعيل (+ إعادة تصنيف المنشورات اختيارياً)
 * DELETE → فك الربط وحذف منشوراته المستوردة (تأكيد في الواجهة)
 *
 * التفويض (نفس هرمية التطبيق):
 *   OWNER           → كل المصادر
 *   SPECIALTY_ADMIN → مصادر تخصصه
 *   REPRESENTATIVE  → مصادر نطاقه (سنته أو فوجه فقط)
 *
 * ملاحظة تصميمية: المصدر هو "طبقة ربط" فوق الهيكل الأكاديمي الموجود
 * (سنة/سداسي/مقياس أو فوج) — لا يوجد هيكل موازٍ لتيليجرام.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { parseChannelHandle, resolveChat, isBotConfigured } from "@/lib/telegram/ingest";
import { invalidateTopicCache } from "@/lib/telegram/topic-bindings";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface SourceRow {
  id: number;
  tgChannelId: string;
  tgUsername: string;
  titleAr: string;
  sourceType: string;
  kind: string;
  specialtyId: number;
  trackId: number | null;
  yearId: number | null;
  semester: number | null;
  moduleId: number | null;
  cohortId: number | null;
  isActive: boolean;
  lastUpdateId: number;
}

function canManageSource(
  user: { role: string; assignedSpecialtyId: number; scopeAcademicYearId: number | null; scopeCohortGroupId: number | null },
  s: SourceRow
): boolean {
  if (user.role === "OWNER") return true;
  if (Number(s.specialtyId) !== user.assignedSpecialtyId) return false;
  if (user.role === "SPECIALTY_ADMIN") return true;
  if (user.role === "REPRESENTATIVE") {
    if (user.scopeCohortGroupId != null && s.cohortId != null && Number(s.cohortId) === user.scopeCohortGroupId) return true;
    if (user.scopeAcademicYearId != null && s.yearId != null && Number(s.yearId) === user.scopeAcademicYearId) return true;
    return false;
  }
  return false;
}

async function loadSource(id: number): Promise<SourceRow | null> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("telegram_sources")
      .select("id, tg_channel_id, tg_username, title_ar, source_type, kind, specialty_id, track_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      id: Number(data.id), tgChannelId: String(data.tg_channel_id), tgUsername: String(data.tg_username ?? ""),
      titleAr: String(data.title_ar ?? ""), sourceType: String(data.source_type ?? "channel"), kind: String(data.kind ?? "public"),
      specialtyId: Number(data.specialty_id ?? 1),
      trackId: data.track_id == null ? null : Number(data.track_id),
      yearId: data.year_id == null ? null : Number(data.year_id),
      semester: data.semester == null ? null : Number(data.semester),
      moduleId: data.module_id == null ? null : Number(data.module_id),
      cohortId: data.cohort_id == null ? null : Number(data.cohort_id),
      isActive: !!data.is_active, lastUpdateId: Number(data.last_update_id ?? 0),
    };
  }
  const s = await db.telegramSource.findUnique({ where: { id } });
  if (!s) return null;
  return {
    id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
    sourceType: s.sourceType, kind: s.kind, specialtyId: s.specialtyId, trackId: s.trackId,
    yearId: s.yearId, semester: s.semester, moduleId: s.moduleId, cohortId: s.cohortId,
    isActive: s.isActive, lastUpdateId: s.lastUpdateId,
  };
}

/** التحقق أن المقياس/الفوج المطلوب ربطهما يتبعان تخصص المستخدم */
async function assertTargetsInSpecialty(
  specialtyId: number,
  moduleId: number | null,
  cohortId: number | null
): Promise<string | null> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    if (moduleId != null) {
      const { data: m } = await supabase.from("module_courses").select("id").eq("id", moduleId).eq("specialty_id", specialtyId).maybeSingle();
      if (!m) return "المقياس المختار لا يتبع تخصصك";
    }
    if (cohortId != null) {
      const { data: c } = await supabase.from("cohort_groups").select("id").eq("id", cohortId).eq("specialty_id", specialtyId).maybeSingle();
      if (!c) return "الفوج المختار لا يتبع تخصصك";
    }
    return null;
  }
  if (moduleId != null) {
    const m = await db.moduleCourse.findFirst({ where: { id: moduleId, specialtyId }, select: { id: true } });
    if (!m) return "المقياس المختار لا يتبع تخصصك";
  }
  if (cohortId != null) {
    const c = await db.cohortGroup.findFirst({ where: { id: cohortId, specialtyId }, select: { id: true } });
    if (!c) return "الفوج المختار لا يتبع تخصصك";
  }
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    let sources: SourceRow[];
    let itemCounts: Record<number, number> = {};
    let topicCounts: Record<number, number> = {};
    let moduleNames: Record<number, string> = {};
    let cohortNames: Record<number, string> = {};

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("telegram_sources")
        .select("id, tg_channel_id, tg_username, title_ar, source_type, kind, specialty_id, track_id, year_id, semester, module_id, cohort_id, is_active, last_update_id");
      if (user.role !== "OWNER") q = q.eq("specialty_id", user.assignedSpecialtyId);
      const { data, error } = await q.order("id", { ascending: true });
      if (error) return NextResponse.json({ sources: [] });
      sources = (data ?? []).map((s: Record<string, unknown>) => ({
        id: Number(s.id), tgChannelId: String(s.tg_channel_id ?? ""), tgUsername: String(s.tg_username ?? ""),
        titleAr: String(s.title_ar ?? ""), sourceType: String(s.source_type ?? "channel"), kind: String(s.kind ?? "public"),
        specialtyId: Number(s.specialty_id ?? 1),
        trackId: s.track_id == null ? null : Number(s.track_id),
        yearId: s.year_id == null ? null : Number(s.year_id),
        semester: s.semester == null ? null : Number(s.semester),
        moduleId: s.module_id == null ? null : Number(s.module_id),
        cohortId: s.cohort_id == null ? null : Number(s.cohort_id),
        isActive: !!s.is_active, lastUpdateId: Number(s.last_update_id ?? 0),
      }));
      if (sources.length > 0) {
        const { data: items } = await supabase.from("telegram_items").select("source_id");
        for (const it of items ?? []) {
          const sid = Number((it as Record<string, unknown>).source_id);
          if (sid) itemCounts[sid] = (itemCounts[sid] ?? 0) + 1;
        }
        // r66: عدد الأقسام المرتبطة لكل مصدر (عرض «أقسام منفصلة»)
        try {
          const { data: topics } = await supabase.from("telegram_topics").select("source_id");
          for (const t of topics ?? []) {
            const sid = Number((t as Record<string, unknown>).source_id);
            if (sid) topicCounts[sid] = (topicCounts[sid] ?? 0) + 1;
          }
        } catch { /* الجدول غائب — صفر أقسام */ }
        const ids = Array.from(new Set(sources.map((s) => s.moduleId).filter((x): x is number => x != null)));
        if (ids.length > 0) {
          const { data: mods } = await supabase.from("module_courses").select("id, name").in("id", ids);
          for (const m of mods ?? []) moduleNames[Number((m as Record<string, unknown>).id)] = String((m as Record<string, unknown>).name ?? "");
        }
        const cids = Array.from(new Set(sources.map((s) => s.cohortId).filter((x): x is number => x != null)));
        if (cids.length > 0) {
          const { data: cohorts } = await supabase.from("cohort_groups").select("id, group_name").in("id", cids);
          for (const c of cohorts ?? []) cohortNames[Number((c as Record<string, unknown>).id)] = String((c as Record<string, unknown>).group_name ?? "");
        }
      }
    } else {
      sources = await db.telegramSource.findMany({
        where: user.role !== "OWNER" ? { specialtyId: user.assignedSpecialtyId } : {},
        orderBy: { id: "asc" },
      });
      const items = await db.telegramItem.findMany({ select: { sourceId: true } });
      for (const it of items) if (it.sourceId != null) itemCounts[it.sourceId] = (itemCounts[it.sourceId] ?? 0) + 1;
      try {
        const topics = await db.telegramTopic.findMany({ select: { sourceId: true } });
        for (const t of topics) topicCounts[t.sourceId] = (topicCounts[t.sourceId] ?? 0) + 1;
      } catch { /* تحسيني */ }
      const ids = Array.from(new Set(sources.map((s) => s.moduleId).filter((x): x is number => x != null)));
      for (const id of ids) {
        const m = await db.moduleCourse.findUnique({ where: { id }, select: { name: true } });
        if (m) moduleNames[id] = m.name;
      }
      const cids = Array.from(new Set(sources.map((s) => s.cohortId).filter((x): x is number => x != null)));
      for (const id of cids) {
        const c = await db.cohortGroup.findUnique({ where: { id }, select: { groupName: true } });
        if (c) cohortNames[id] = c.groupName;
      }
    }

    // r68: أسماء التخصصات والملامح لشارات قائمة المصادر (الربط المتعدد)
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
    const baseChat = (id: string) => id.replace(/:\d+$/, "").replace(/#\d+$/, "");
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

    return NextResponse.json({
      sources: sources.map((s) => ({
        id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
        sourceType: s.sourceType, kind: s.kind, specialtyId: s.specialtyId, trackId: s.trackId,
        yearId: s.yearId, semester: s.semester, moduleId: s.moduleId,
        moduleName: s.moduleId != null ? moduleNames[s.moduleId] ?? null : null,
        cohortId: s.cohortId,
        cohortName: s.cohortId != null ? cohortNames[s.cohortId] ?? null : null,
        isActive: s.isActive, lastUpdateId: s.lastUpdateId, itemCount: itemCounts[s.id] ?? 0,
        topicCount: (topicCounts[s.id] ?? 0) + (sectionCounts[s.id] ?? 0),
        isSection: s.tgChannelId.includes(":"),
        specialtyName: specialtyNames[s.specialtyId] ?? null,
        trackName: s.trackId != null ? trackNames[s.trackId] ?? null : null,
        linkCount: linkCounts[s.id] ?? 1,
      })),
    });
  } catch (e) {
    // الجداول غير منشأة غالباً — العلامة تُظهر التحذير في الواجهة
    return NextResponse.json({ sources: [], tablesReady: false, error: "جدول تيليجرام غير منشأ بعد — نفّذ supabase_telegram.sql" });
  }
}

/**
 * r66: يستخرج رقم القسم/الموضوع من رابط كامل إن وُجد:
 *   https://t.me/c/123456789/12      → 12 (رابط قسم/موضوع)
 *   https://t.me/channel_name/12     → 12
 *   https://t.me/c/123456789/12/345  → 12 (رسالة داخل الموضوع)
 *   @name أو رابط قناة بلا رقم       → null (ربط قناة كاملة)
 */
function extractThreadId(handle: string): number | null {
  const m = handle.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:c\/\d+|[A-Za-z0-9_]{4,})\/(\d{1,10})(?:\/\d{1,10})?/i);
  return m ? parseInt(m[1], 10) : null;
}

/** r66: تحقق أن السنة تتبع تخصصاً ما (قبل ربط قسم بها) */
async function yearInSpecialty(specialtyId: number, yearId: number): Promise<boolean> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("academic_years").select("id").eq("id", yearId).eq("specialty_id", specialtyId).maybeSingle();
      return !!data;
    }
    const y = await db.academicYear.findFirst({ where: { id: yearId, specialtyId }, select: { id: true } });
    return !!y;
  } catch {
    return false;
  }
}

/** r66: إضافة/تحديث رابط قسم (topic) تحت مصدر موجود — القلب الجديد لدعم «أقسام منفصلة».
 * reason: "missing-table" يعني أن جدول telegram_topics غير منشأ (في الإنتاج
 * غالباً) — يُستعمل لتشغيل المسار البديل (قسم كمصدر مستقل) بدل الفشل. */
async function upsertTopicBinding(
  sourceId: number,
  threadId: number,
  title: string,
  link: string,
  yearId: number | null,
  moduleId: number | null
): Promise<{ ok: boolean; created: boolean; reason?: "missing-table"; error?: string }> {
  const finalTitle = (title || "").trim().slice(0, 120) || `القسم ${threadId}`;
  const finalLink = /^https?:\/\//i.test(link) ? link.trim() : "";
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    let data: { id: number } | null = null;
    try {
      const r = await supabase
        .from("telegram_topics")
        .select("id")
        .eq("source_id", sourceId)
        .eq("tg_thread_id", threadId)
        .maybeSingle();
      data = (r.data as { id: number } | null) ?? null;
      if (r.error) throw new Error(r.error.message);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/PGRST205|does not exist|schema cache|جدول المواضيع/i.test(msg)) {
        return { ok: false, created: false, reason: "missing-table", error: "جدول المواضيع غير منشأ" };
      }
      return { ok: false, created: false, error: msg };
    }
    if (data) {
      const { error } = await supabase
        .from("telegram_topics")
        .update({ title_ar: finalTitle, link: finalLink, year_id: yearId, module_id: moduleId, is_general: false })
        .eq("id", Number(data.id));
      if (error) return { ok: false, created: false, error: error.message };
      invalidateTopicCache(sourceId);
      return { ok: true, created: false };
    }
    const { error } = await supabase
      .from("telegram_topics")
      .insert({ source_id: sourceId, tg_thread_id: threadId, title_ar: finalTitle, link: finalLink, year_id: yearId, module_id: moduleId, is_general: false });
    if (error) return { ok: false, created: false, error: error.message };
    invalidateTopicCache(sourceId);
    return { ok: true, created: true };
  }
  try {
    const dup = await db.telegramTopic.findUnique({ where: { sourceId_tgThreadId: { sourceId, tgThreadId: threadId } } });
    if (dup) {
      await db.telegramTopic.update({
        where: { id: dup.id },
        data: { titleAr: finalTitle, link: finalLink, yearId, moduleId, isGeneral: false },
      });
      invalidateTopicCache(sourceId);
      return { ok: true, created: false };
    }
    await db.telegramTopic.create({
      data: { sourceId, tgThreadId: threadId, titleAr: finalTitle, link: finalLink, yearId, moduleId, isGeneral: false },
    });
    invalidateTopicCache(sourceId);
    return { ok: true, created: true };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/telegram_topics|telegramTopic|P2021|does not exist|no such table/i.test(msg)) {
      return { ok: false, created: false, reason: "missing-table", error: "جدول المواضيع غير منشأ" };
    }
    return { ok: false, created: false, error: msg };
  }
}

/** معرّف مركّب لقسم يعمل مصدراً مستقلاً: "chatId:threadId"
 * (يعمل لأن tg_channel_id عمود TEXT فريد — دون أي DDL) */
function sectionChannelId(chatId: string, threadId: number): string {
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

/** r66: المسار البديل للإنتاج بلا جدول مواضيع — القسم يُخزَّن مصدراً
 * مستقلاً تحت قناته الأصلية: نفس الأعمدة، معرّف مركّب "chat:thread"،
 * وربط السنة/المقياس عليه مباشرة. الاستيراد يبحث عن المركّب أولاً
 * لمنشورات المواضيع (ingest.ts) فيصنّف حتمياً إلى نطاق القسم. */
async function upsertSectionSource(args: {
  chatId: string;
  threadId: number;
  title: string;
  yearId: number | null;
  moduleId: number | null;
  parent: {
    tgUsername: string;
    titleAr: string;
    sourceType: string;
    kind: string;
    specialtyId: number;
    trackId: number | null;
    semester: number | null;
  };
}): Promise<{ ok: boolean; created: boolean; sectionSource?: SourceRow; error?: string }> {
  const composite = sectionChannelId(args.chatId, args.threadId);
  const sectionTitle = `${args.parent.titleAr} • ${args.title}`.slice(0, 160);
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data: dup } = await supabase
      .from("telegram_sources")
      .select("id, tg_channel_id, tg_username, title_ar, source_type, kind, specialty_id, track_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
      .eq("tg_channel_id", composite)
      .maybeSingle();
    if (dup) {
      const { error } = await supabase
        .from("telegram_sources")
        .update({ title_ar: sectionTitle, year_id: args.yearId, module_id: args.moduleId, is_active: true })
        .eq("id", Number(dup.id));
      if (error) return { ok: false, created: false, error: error.message };
      return { ok: true, created: false, sectionSource: mapVercelSourceRow(dup) };
    }
    const { data, error } = await supabase
      .from("telegram_sources")
      .insert({
        tg_channel_id: composite, tg_username: args.parent.tgUsername, title_ar: sectionTitle,
        source_type: args.parent.sourceType, kind: args.parent.kind, specialty_id: args.parent.specialtyId,
        track_id: args.parent.trackId, year_id: args.yearId, semester: args.parent.semester,
        module_id: args.moduleId, cohort_id: null, is_active: true,
      })
      .select("id, tg_channel_id, tg_username, title_ar, source_type, kind, specialty_id, track_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
      .single();
    if (error || !data) return { ok: false, created: false, error: error?.message ?? "تعذر إنشاء القسم" };
    return { ok: true, created: true, sectionSource: mapVercelSourceRow(data) };
  }
  const dup = await db.telegramSource.findUnique({ where: { tgChannelId: composite } });
  if (dup) {
    const updated = await db.telegramSource.update({
      where: { id: dup.id },
      data: { titleAr: sectionTitle, yearId: args.yearId, moduleId: args.moduleId, isActive: true },
    });
    return { ok: true, created: false, sectionSource: toSourceRow(updated) };
  }
  const created = await db.telegramSource.create({
    data: {
      tgChannelId: composite, tgUsername: args.parent.tgUsername, titleAr: sectionTitle,
      sourceType: args.parent.sourceType, kind: args.parent.kind, specialtyId: args.parent.specialtyId,
      trackId: args.parent.trackId, yearId: args.yearId, semester: args.parent.semester,
      moduleId: args.moduleId, cohortId: null, isActive: true,
    },
  });
  return { ok: true, created: true, sectionSource: toSourceRow(created) };
}

function mapVercelSourceRow(d: unknown): SourceRow {
  const r = d as Record<string, unknown>;
  return {
    id: Number(r.id), tgChannelId: String(r.tg_channel_id ?? ""), tgUsername: String(r.tg_username ?? ""),
    titleAr: String(r.title_ar ?? ""), sourceType: String(r.source_type ?? "channel"), kind: String(r.kind ?? "public"),
    specialtyId: Number(r.specialty_id ?? 1), trackId: r.track_id == null ? null : Number(r.track_id),
    yearId: r.year_id == null ? null : Number(r.year_id), semester: r.semester == null ? null : Number(r.semester),
    moduleId: r.module_id == null ? null : Number(r.module_id), cohortId: r.cohort_id == null ? null : Number(r.cohort_id),
    isActive: !!r.is_active, lastUpdateId: Number(r.last_update_id ?? 0),
  };
}

function toSourceRow(s: { id: number; tgChannelId: string; tgUsername: string; titleAr: string; sourceType: string; kind: string; specialtyId: number; trackId: number | null; yearId: number | null; semester: number | null; moduleId: number | null; cohortId: number | null; isActive: boolean; lastUpdateId: number }): SourceRow {
  return s;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const handle = String(body.handle ?? "").trim();
    const sourceType = body.sourceType === "group" ? "group" : "channel";
    if (!handle) return NextResponse.json({ error: "أدخل رابط القناة أو @اسمها" }, { status: 400 });

    // الممثل مقيد بنطاقه: مجموعة → فوجه، قناة → سنته (إن وُجد النطاق)
    let moduleId = body.moduleId != null && Number(body.moduleId) > 0 ? Number(body.moduleId) : null;
    let cohortId = body.cohortId != null && Number(body.cohortId) > 0 ? Number(body.cohortId) : null;
    let yearId = body.yearId != null && Number(body.yearId) > 0 ? Number(body.yearId) : null;
    if (user.role === "REPRESENTATIVE") {
      if (sourceType === "group") {
        if (user.scopeCohortGroupId == null) return NextResponse.json({ error: "لا يمكنك ربط مجموعات — لا يوجد فوج في نطاقك" }, { status: 403 });
        cohortId = user.scopeCohortGroupId;
      } else if (cohortId != null) {
        // r67: قناة مربوطة بمساحة فوج — نطاق الممثل فوجه فقط
        if (user.scopeCohortGroupId == null || Number(cohortId) !== Number(user.scopeCohortGroupId)) {
          return NextResponse.json({ error: "كممثل يمكنك ربط قناة بمساحة فوجك فقط" }, { status: 403 });
        }
      } else if (user.scopeAcademicYearId != null) {
        yearId = user.scopeAcademicYearId;
      }
    }
    // r67: المجموعة تتطلب فوجاً دائماً؛ القناة اختيارية — بلا فوج فهي
    // مكتبة (بوابة المحتوى الدراسي r65)، وبفوج فمنشوراتها في مساحته المشتركة
    if (sourceType === "group" && cohortId == null) {
      return NextResponse.json({ error: "اختر الفوج المرتبط بمساحته المشتركة" }, { status: 400 });
    }
    // r68: التخصص الهدف للربط — المالك يستطيع ربط القناة لتخصص آخر
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
    if (targetError) return NextResponse.json({ error: targetError }, { status: 403 });

    // قراءة بيانات القناة من تيليجرام (يتطلب البوت مشرفاً فيها)
    const parsedHandle = parseChannelHandle(handle);
    let tgChannelId = parsedHandle.chatId ?? "";
    let tgUsername = parsedHandle.username ?? "";
    let autoTitle = "";
    let kind = body.kind === "private" ? "private" : body.kind === "public" ? "public" : "";
    if (await isBotConfigured()) {
      const lookup = await resolveChat(parsedHandle.username ? `@${parsedHandle.username}` : tgChannelId);
      if (lookup.error) return NextResponse.json({ error: lookup.error }, { status: 400 });
      if (lookup.chat) {
        tgChannelId = String(lookup.chat.id);
        tgUsername = lookup.chat.username ?? "";
        autoTitle = lookup.chat.title ?? "";
        if (!kind) kind = tgUsername ? "public" : "private";
      }
    } else if (parsedHandle.username) {
      return NextResponse.json(
        { error: "لا يمكن قراءة بيانات القناة بالاسم دون توكن البوت — اضبط TELEGRAM_BOT_TOKEN أو أدخل المعرّف الرقمي" },
        { status: 400 }
      );
    }
    if (!tgChannelId) return NextResponse.json({ error: "تعذّر تحديد معرّف القناة" }, { status: 400 });
    if (!kind) kind = "private";
    const titleAr = String(body.title ?? "").trim() || autoTitle || tgUsername || `قناة ${tgChannelId.slice(-6)}`;

    // r66: رابط يحمل رقم قسم/موضوع → القسم يُضاف منفصلاً تحت قناته
    // (بدل رفض «القناة مربوطة مسبقاً»). القسم يرث السنة/المقياس المختارين.
    const threadId = extractThreadId(handle);
    // اسم القسم: ما كتبه المشرف، أو «القسم N» — لا اسم القناة (autoTitle) لأنه ليس اسم القسم
    const topicTitle = String(body.title ?? "").trim() || (threadId != null ? `القسم ${threadId}` : "");
    if (threadId != null && sourceType === "channel") {
      if (moduleId == null && yearId == null) {
        return NextResponse.json(
          { error: "هذا رابط قسم داخل قناة — اختر السنة الدراسية أو المقياس الذي يُصنَّف إليه هذا القسم (أو اربط القناة كاملة بلا رقم قسم)" },
          { status: 400 }
        );
      }
      if (yearId != null && !(await yearInSpecialty(specialtyId, yearId))) {
        return NextResponse.json({ error: "السنة المختارة لا تتبع تخصصك" }, { status: 403 });
      }
    }

    if (isVercel) {
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
    const bindings = await findChannelBindings(tgChannelId);

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
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const source = await loadSource(id);
    if (!source) return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
    if (!canManageSource(user, source)) {
      return NextResponse.json({ error: "هذا المصدر خارج نطاقك" }, { status: 403 });
    }

    const newModuleId = body.moduleId !== undefined ? (body.moduleId != null && Number(body.moduleId) > 0 ? Number(body.moduleId) : null) : source.moduleId;
    const newCohortId = body.cohortId !== undefined ? (body.cohortId != null && Number(body.cohortId) > 0 ? Number(body.cohortId) : null) : source.cohortId;
    const targetError = await assertTargetsInSpecialty(source.specialtyId, newModuleId, newCohortId);
    if (targetError) return NextResponse.json({ error: targetError }, { status: 403 });

    // r63: نقل المصدر لتخصص آخر (يستعمله المالك بعد التسجيل الذاتي إن كان التخصص الافتراضي غير دقيق)
    let newSpecialtyId = source.specialtyId;
    if (body.specialtyId !== undefined) {
      if (user.role !== "OWNER") {
        return NextResponse.json({ error: "نقل المصدر بين التخصصات متاح للمالك فقط" }, { status: 403 });
      }
      const sid = Number(body.specialtyId);
      if (!sid || sid <= 0) return NextResponse.json({ error: "معرّف تخصص غير صالح" }, { status: 400 });
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: spec } = await supabase.from("specialties").select("id").eq("id", sid).maybeSingle();
        if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 400 });
      } else {
        const spec = await db.specialty.findUnique({ where: { id: sid }, select: { id: true } });
        if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 400 });
      }
      newSpecialtyId = sid;
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
    const mappingChanged =
      (newModuleId !== source.moduleId) || (newCohortId !== source.cohortId) || (newSpecialtyId !== source.specialtyId);

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const patch: Record<string, unknown> = {};
      if (body.titleAr !== undefined && String(body.titleAr).trim()) patch.title_ar = String(body.titleAr).trim();
      if (body.specialtyId !== undefined) patch.specialty_id = newSpecialtyId;
      if (body.moduleId !== undefined) patch.module_id = newModuleId;
      if (body.cohortId !== undefined) patch.cohort_id = newCohortId;
      if (body.yearId !== undefined) patch.year_id = body.yearId != null && Number(body.yearId) > 0 ? Number(body.yearId) : null;
      if (body.semester !== undefined) patch.semester = body.semester === 2 ? 2 : body.semester === 1 ? 1 : null;
      if (body.trackId !== undefined) patch.track_id = newTrackId;
      if (body.isActive !== undefined) patch.is_active = !!body.isActive;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
      const { error } = await supabase.from("telegram_sources").update(patch).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (applyToItems && mappingChanged) {
        const itemPatch: Record<string, unknown> = {};
        if (body.specialtyId !== undefined) itemPatch.specialty_id = newSpecialtyId;
        if (body.moduleId !== undefined) itemPatch.module_id = newModuleId;
        if (body.cohortId !== undefined) itemPatch.cohort_id = newCohortId;
        if (Object.keys(itemPatch).length > 0) {
          await supabase.from("telegram_items").update(itemPatch).eq("source_id", id);
        }
      }
    } else {
      await db.telegramSource.update({
        where: { id },
        data: {
          ...(body.titleAr !== undefined && String(body.titleAr).trim() ? { titleAr: String(body.titleAr).trim() } : {}),
          ...(body.specialtyId !== undefined ? { specialtyId: newSpecialtyId } : {}),
          ...(body.moduleId !== undefined ? { moduleId: newModuleId } : {}),
          ...(body.cohortId !== undefined ? { cohortId: newCohortId } : {}),
          ...(body.yearId !== undefined ? { yearId: body.yearId != null && Number(body.yearId) > 0 ? Number(body.yearId) : null } : {}),
          ...(body.semester !== undefined ? { semester: body.semester === 2 ? 2 : body.semester === 1 ? 1 : null } : {}),
          ...(body.trackId !== undefined ? { trackId: newTrackId } : {}),
          ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
        },
      });
      if (applyToItems && mappingChanged) {
        await db.telegramItem.updateMany({
          where: { sourceId: id },
          data: {
            ...(body.specialtyId !== undefined ? { specialtyId: newSpecialtyId } : {}),
            ...(body.moduleId !== undefined ? { moduleId: newModuleId } : {}),
            ...(body.cohortId !== undefined ? { cohortId: newCohortId } : {}),
          },
        });
      }
    }
    return NextResponse.json({ ok: true, message: "تم تعديل المصدر" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  try {
    const source = await loadSource(id);
    if (!source) return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
    if (!canManageSource(user, source)) {
      return NextResponse.json({ error: "هذا المصدر خارج نطاقك" }, { status: 403 });
    }
    let deletedItems = 0;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { count } = await supabase.from("telegram_items").select("id", { count: "exact", head: true }).eq("source_id", id);
      deletedItems = count ?? 0; // CASCADE يحذفها فعلياً — العدد للعرض فقط
      const { error } = await supabase.from("telegram_sources").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      deletedItems = await db.telegramItem.count({ where: { sourceId: id } });
      await db.telegramSource.delete({ where: { id } }); // cascade في Prisma
    }
    return NextResponse.json({ ok: true, message: `تم فك الربط وحذف ${deletedItems} منشوراً مستورداً` });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
