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

    return NextResponse.json({
      sources: sources.map((s) => ({
        id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
        sourceType: s.sourceType, kind: s.kind, specialtyId: s.specialtyId, trackId: s.trackId,
        yearId: s.yearId, semester: s.semester, moduleId: s.moduleId,
        moduleName: s.moduleId != null ? moduleNames[s.moduleId] ?? null : null,
        cohortId: s.cohortId,
        cohortName: s.cohortId != null ? cohortNames[s.cohortId] ?? null : null,
        isActive: s.isActive, lastUpdateId: s.lastUpdateId, itemCount: itemCounts[s.id] ?? 0,
      })),
    });
  } catch (e) {
    // الجداول غير منشأة غالباً — العلامة تُظهر التحذير في الواجهة
    return NextResponse.json({ sources: [], tablesReady: false, error: "جدول تيليجرام غير منشأ بعد — نفّذ supabase_telegram.sql" });
  }
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
      } else if (user.scopeAcademicYearId != null) {
        yearId = user.scopeAcademicYearId;
      }
    }
    if (sourceType === "group" && cohortId == null) {
      return NextResponse.json({ error: "اختر الفوج المرتبط بمساحته المشتركة" }, { status: 400 });
    }
    const specialtyId = user.assignedSpecialtyId;
    const targetError = await assertTargetsInSpecialty(specialtyId, moduleId, cohortId);
    if (targetError) return NextResponse.json({ error: targetError }, { status: 403 });

    // قراءة بيانات القناة من تيليجرام (يتطلب البوت مشرفاً فيها)
    const parsedHandle = parseChannelHandle(handle);
    let tgChannelId = parsedHandle.chatId ?? "";
    let tgUsername = parsedHandle.username ?? "";
    let autoTitle = "";
    let kind = body.kind === "private" ? "private" : body.kind === "public" ? "public" : "";
    if (isBotConfigured()) {
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

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase.from("telegram_sources").select("id").eq("tg_channel_id", tgChannelId).maybeSingle();
      if (existing) return NextResponse.json({ error: "هذه القناة مربوطة مسبقاً" }, { status: 409 });
      const { data, error } = await supabase
        .from("telegram_sources")
        .insert({
          tg_channel_id: tgChannelId, tg_username: tgUsername, title_ar: titleAr,
          source_type: sourceType, kind, specialty_id: specialtyId,
          track_id: body.trackId != null && Number(body.trackId) > 0 ? Number(body.trackId) : null,
          year_id: yearId, semester: body.semester === 2 ? 2 : body.semester === 1 ? 1 : null,
          module_id: moduleId, cohort_id: cohortId, is_active: true,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ source: data });
    }
    const dup = await db.telegramSource.findUnique({ where: { tgChannelId } });
    if (dup) return NextResponse.json({ error: "هذه القناة مربوطة مسبقاً" }, { status: 409 });
    const created = await db.telegramSource.create({
      data: {
        tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId,
        trackId: body.trackId != null && Number(body.trackId) > 0 ? Number(body.trackId) : null,
        yearId, semester: body.semester === 2 ? 2 : body.semester === 1 ? 1 : null,
        moduleId, cohortId, isActive: true,
      },
    });
    return NextResponse.json({ source: created });
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

    const applyToItems = body.applyToItems === true;
    const mappingChanged =
      (newModuleId !== source.moduleId) || (newCohortId !== source.cohortId);

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const patch: Record<string, unknown> = {};
      if (body.titleAr !== undefined && String(body.titleAr).trim()) patch.title_ar = String(body.titleAr).trim();
      if (body.moduleId !== undefined) patch.module_id = newModuleId;
      if (body.cohortId !== undefined) patch.cohort_id = newCohortId;
      if (body.yearId !== undefined) patch.year_id = body.yearId != null && Number(body.yearId) > 0 ? Number(body.yearId) : null;
      if (body.semester !== undefined) patch.semester = body.semester === 2 ? 2 : body.semester === 1 ? 1 : null;
      if (body.isActive !== undefined) patch.is_active = !!body.isActive;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
      const { error } = await supabase.from("telegram_sources").update(patch).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (applyToItems && mappingChanged) {
        const itemPatch: Record<string, unknown> = {};
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
          ...(body.moduleId !== undefined ? { moduleId: newModuleId } : {}),
          ...(body.cohortId !== undefined ? { cohortId: newCohortId } : {}),
          ...(body.yearId !== undefined ? { yearId: body.yearId != null && Number(body.yearId) > 0 ? Number(body.yearId) : null } : {}),
          ...(body.semester !== undefined ? { semester: body.semester === 2 ? 2 : body.semester === 1 ? 1 : null } : {}),
          ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
        },
      });
      if (applyToItems && mappingChanged) {
        await db.telegramItem.updateMany({
          where: { sourceId: id },
          data: {
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
