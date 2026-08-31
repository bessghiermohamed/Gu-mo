/**
 * Telegram items API (round 7) — منشورات القنوات + مساحة الفوج المشتركة
 *
 * GET    ?mode=library (افتراضي: مكتبة القنوات العامة لتخصص المتصل)
 *        ?mode=shared  (مساحة فوج المتصل — مستوردة + إضافات يدوية)
 *        ?mode=admin   (كل المنشورات بما فيها المخفية — للتنقيح الإداري)
 *        فلاتر: moduleId, itemType, kind, q (بحث عربي مطبَّع), sourceId, featured
 * POST   → إضافة يدوية إلى مساحة الفوج (متاحة لكل الطلبة المنتمين لفوج)
 * PATCH  → تنقيح إداري: النوع/المقياس/العنوان/إخفاء/تثبيت
 * DELETE → حذف (مشرف، أو صاحب الإضافة اليدوية)
 *
 * فلسفة الإذن — نفس هرمية التطبيق:
 *   طالب   → يقرأ المكتبة، ويضيف/يحذف إضافاته اليدوية في مساحة فوجه
 *   ممثل   → ينقّح منشورات نطاقه (فوجه أو سنته)
 *   مشرف تخصص/مالك → كل منشورات تخصصهم/الكل
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { TG_ITEM_TYPES } from "@/lib/telegram/types";
import { buildSearchText } from "@/lib/telegram/normalize";
import { kindFromDocument } from "@/lib/telegram/ingest";
import { isBotConfigured } from "@/lib/telegram/ingest";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface ItemRow {
  id: number;
  sourceId: number | null;
  tgMessageId: number;
  mediaGroupId: string;
  kind: string;
  titleAr: string;
  captionText: string;
  fileName: string;
  mimeType: string;
  fileId: string;
  sizeBytes: number;
  link: string;
  specialtyId: number;
  moduleId: number | null;
  itemType: string;
  origin: string;
  postedBy: string;
  cohortId: number | null;
  isHidden: boolean;
  isFeatured: boolean;
  aiClassified: boolean;
  postedAt: Date | string | null;
}

/** فوج المتصل: نطاقه المباشر أو آخر طلب انضمام مقبول */
async function resolveMyCohort(user: { id: number; scopeCohortGroupId: number | null }): Promise<number | null> {
  if (user.scopeCohortGroupId != null) return user.scopeCohortGroupId;
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("join_requests")
        .select("cohort_id")
        .eq("requester_id", user.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? Number(data.cohort_id) : null;
    }
    const jr = await db.joinRequest.findFirst({
      where: { requesterId: user.id, status: "approved" },
      orderBy: { createdAt: "desc" },
      select: { cohortId: true },
    });
    return jr?.cohortId ?? null;
  } catch {
    return null;
  }
}

async function loadItem(id: number): Promise<ItemRow | null> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("telegram_items").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return {
      id: Number(r.id), sourceId: r.source_id == null ? null : Number(r.source_id),
      tgMessageId: Number(r.tg_message_id ?? 0), mediaGroupId: String(r.media_group_id ?? ""),
      kind: String(r.kind ?? "text"), titleAr: String(r.title_ar ?? ""), captionText: String(r.caption_text ?? ""),
      fileName: String(r.file_name ?? ""), mimeType: String(r.mime_type ?? ""), fileId: String(r.file_id ?? ""),
      sizeBytes: Number(r.size_bytes ?? 0), link: String(r.link ?? ""), specialtyId: Number(r.specialty_id ?? 1),
      moduleId: r.module_id == null ? null : Number(r.module_id), itemType: String(r.item_type ?? "عام"),
      origin: String(r.origin ?? "telegram"), postedBy: String(r.posted_by ?? ""),
      cohortId: r.cohort_id == null ? null : Number(r.cohort_id), isHidden: !!r.is_hidden, isFeatured: !!r.is_featured,
      aiClassified: !!r.ai_classified, postedAt: r.posted_at ?? null,
    };
  }
  const it = await db.telegramItem.findUnique({ where: { id } });
  if (!it) return null;
  return {
    id: it.id, sourceId: it.sourceId, tgMessageId: it.tgMessageId, mediaGroupId: it.mediaGroupId,
    kind: it.kind, titleAr: it.titleAr, captionText: it.captionText, fileName: it.fileName,
    mimeType: it.mimeType, fileId: it.fileId, sizeBytes: it.sizeBytes, link: it.link,
    specialtyId: it.specialtyId, moduleId: it.moduleId, itemType: it.itemType, origin: it.origin,
    postedBy: it.postedBy, cohortId: it.cohortId, isHidden: it.isHidden, isFeatured: it.isFeatured,
    aiClassified: it.aiClassified, postedAt: it.postedAt,
  };
}

/** سنة المقياس (لمطابقة نطاق الممثل) */
async function moduleYearId(moduleId: number | null): Promise<number | null> {
  if (moduleId == null) return null;
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("module_courses").select("academic_year_id").eq("id", moduleId).maybeSingle();
      return data ? Number((data as Record<string, unknown>).academic_year_id) : null;
    }
    const m = await db.moduleCourse.findUnique({ where: { id: moduleId }, select: { academicYearId: true } });
    return m?.academicYearId ?? null;
  } catch {
    return null;
  }
}

async function canCurateItem(
  user: { id: number; role: string; assignedSpecialtyId: number; scopeAcademicYearId: number | null; scopeCohortGroupId: number | null },
  item: ItemRow
): Promise<boolean> {
  if (user.role === "OWNER") return true;
  if (Number(item.specialtyId) !== user.assignedSpecialtyId) return false;
  if (user.role === "SPECIALTY_ADMIN") return true;
  if (user.role === "REPRESENTATIVE") {
    if (user.scopeCohortGroupId != null && item.cohortId != null && Number(item.cohortId) === user.scopeCohortGroupId) return true;
    if (user.scopeAcademicYearId != null) {
      const y = await moduleYearId(item.moduleId);
      if (y != null && y === user.scopeAcademicYearId) return true;
    }
    return false;
  }
  return false;
}

function shapeItem(item: ItemRow, moduleName: string | null, sourceTitle: string | null, sourceUsername: string | null) {
  return {
    id: item.id, sourceId: item.sourceId, tgMessageId: item.tgMessageId, mediaGroupId: item.mediaGroupId,
    kind: item.kind, titleAr: item.titleAr, captionText: item.captionText, fileName: item.fileName,
    mimeType: item.mimeType, fileId: item.fileId, sizeBytes: item.sizeBytes, link: item.link,
    specialtyId: item.specialtyId, moduleId: item.moduleId, moduleName, itemType: item.itemType,
    origin: item.origin, postedBy: item.postedBy, cohortId: item.cohortId,
    isHidden: item.isHidden, isFeatured: item.isFeatured, aiClassified: item.aiClassified,
    postedAt: item.postedAt ? new Date(item.postedAt as string | Date).toISOString() : null,
    sourceTitle, sourceUsername,
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ items: [], myCohortId: null });
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "library";
    const moduleId = url.searchParams.get("moduleId");
    const itemType = url.searchParams.get("itemType");
    const kind = url.searchParams.get("kind");
    const sourceId = url.searchParams.get("sourceId");
    const featured = url.searchParams.get("featured");
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 500);

    if (mode === "admin" && !canUploadContent(user)) {
      return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
    }

    const myCohortId = await resolveMyCohort(user);

    // السماح فقط بمقاييس سنة المتصل (نفس منطق /api/courses)
    let allowedModuleIds: number[] | null = null;
    if (mode !== "admin" && user.scopeAcademicYearId != null) {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: mods } = await supabase
          .from("module_courses").select("id").eq("specialty_id", user.assignedSpecialtyId).eq("academic_year_id", user.scopeAcademicYearId);
        allowedModuleIds = (mods ?? []).map((m: Record<string, unknown>) => Number(m.id));
      } else {
        const mods = await db.moduleCourse.findMany({
          where: { specialtyId: user.assignedSpecialtyId, academicYearId: user.scopeAcademicYearId },
          select: { id: true },
        });
        allowedModuleIds = mods.map((m) => m.id);
      }
    }

    let rows: ItemRow[] = [];
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase.from("telegram_items").select("*");
      if (mode === "admin") {
        if (user.role !== "OWNER") query = query.eq("specialty_id", user.assignedSpecialtyId);
        if (sourceId) query = query.eq("source_id", Number(sourceId));
      } else if (mode === "shared") {
        if (myCohortId == null) return NextResponse.json({ items: [], myCohortId: null });
        query = query.eq("cohort_id", myCohortId).eq("is_hidden", false);
      } else {
        query = query.eq("specialty_id", user.assignedSpecialtyId).eq("is_hidden", false).is("cohort_id", null);
        if (allowedModuleIds != null) {
          query = query.or(`module_id.in.(${allowedModuleIds.join(",")}),module_id.is.null`);
        }
      }
      if (mode !== "admin" && moduleId) query = query.eq("module_id", Number(moduleId));
      if (itemType) query = query.eq("item_type", itemType);
      if (kind) query = query.eq("kind", kind);
      if (featured === "true" || featured === "1") query = query.eq("is_featured", true);
      if (q) {
        const { normalizeArabic } = await import("@/lib/telegram/normalize");
        query = query.ilike("search_text", `%${normalizeArabic(q)}%`);
      }
      const { data, error } = await query
        .order("is_featured", { ascending: false })
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) {
        return NextResponse.json({ items: [], myCohortId, tablesReady: false, error: "جدول تيليجرام غير منشأ — نفّذ supabase_telegram.sql" });
      }
      rows = (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id), sourceId: r.source_id == null ? null : Number(r.source_id),
        tgMessageId: Number(r.tg_message_id ?? 0), mediaGroupId: String(r.media_group_id ?? ""),
        kind: String(r.kind ?? "text"), titleAr: String(r.title_ar ?? ""), captionText: String(r.caption_text ?? ""),
        fileName: String(r.file_name ?? ""), mimeType: String(r.mime_type ?? ""), fileId: String(r.file_id ?? ""),
        sizeBytes: Number(r.size_bytes ?? 0), link: String(r.link ?? ""), specialtyId: Number(r.specialty_id ?? 1),
        moduleId: r.module_id == null ? null : Number(r.module_id), itemType: String(r.item_type ?? "عام"),
        origin: String(r.origin ?? "telegram"), postedBy: String(r.posted_by ?? ""),
        cohortId: r.cohort_id == null ? null : Number(r.cohort_id), isHidden: !!r.is_hidden, isFeatured: !!r.is_featured,
        aiClassified: !!r.ai_classified, postedAt: r.posted_at ?? null,
      }));
    } else {
      const { normalizeArabic } = await import("@/lib/telegram/normalize");
      const where: Record<string, unknown> = {};
      if (mode === "admin") {
        if (user.role !== "OWNER") where.specialtyId = user.assignedSpecialtyId;
        if (sourceId) where.sourceId = Number(sourceId);
      } else if (mode === "shared") {
        if (myCohortId == null) return NextResponse.json({ items: [], myCohortId: null });
        where.cohortId = myCohortId;
        where.isHidden = false;
      } else {
        where.specialtyId = user.assignedSpecialtyId;
        where.isHidden = false;
        where.cohortId = null;
        if (allowedModuleIds != null) {
          where.OR = [{ moduleId: { in: allowedModuleIds } }, { moduleId: null }];
        }
      }
      if (mode !== "admin" && moduleId) where.moduleId = Number(moduleId);
      if (itemType) where.itemType = itemType;
      if (kind) where.kind = kind;
      if (featured === "true" || featured === "1") where.isFeatured = true;
      if (q) where.searchText = { contains: normalizeArabic(q) };
      rows = (await db.telegramItem.findMany({
        where: where as never,
        orderBy: [{ isFeatured: "desc" }, { postedAt: "desc" }],
        take: limit,
      })) as unknown as ItemRow[];
    }

    // أسماء المقايير والمصادر للعرض
    const modIds = Array.from(new Set(rows.map((r) => r.moduleId).filter((x): x is number => x != null)));
    const srcIds = Array.from(new Set(rows.map((r) => r.sourceId).filter((x): x is number => x != null)));
    let moduleNames: Record<number, string> = {};
    let sourceTitles: Record<number, { titleAr: string; tgUsername: string }> = {};
    if (modIds.length > 0 || srcIds.length > 0) {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        if (modIds.length > 0) {
          const { data: mods } = await supabase.from("module_courses").select("id, name").in("id", modIds);
          for (const m of mods ?? []) moduleNames[Number((m as Record<string, unknown>).id)] = String((m as Record<string, unknown>).name ?? "");
        }
        if (srcIds.length > 0) {
          const { data: srcs } = await supabase.from("telegram_sources").select("id, title_ar, tg_username").in("id", srcIds);
          for (const s of srcs ?? []) {
            sourceTitles[Number((s as Record<string, unknown>).id)] = {
              titleAr: String((s as Record<string, unknown>).title_ar ?? ""),
              tgUsername: String((s as Record<string, unknown>).tg_username ?? ""),
            };
          }
        }
      } else {
        if (modIds.length > 0) {
          const mods = await db.moduleCourse.findMany({ where: { id: { in: modIds } }, select: { id: true, name: true } });
          for (const m of mods) moduleNames[m.id] = m.name;
        }
        if (srcIds.length > 0) {
          const srcs = await db.telegramSource.findMany({ where: { id: { in: srcIds } }, select: { id: true, titleAr: true, tgUsername: true } });
          for (const s of srcs) sourceTitles[s.id] = { titleAr: s.titleAr, tgUsername: s.tgUsername };
        }
      }
    }

    // عدد المصادر النشطة (لحالة "لم تُربط قنوات بعد")
    let activeSources = 0;
    try {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { count } = await supabase
          .from("telegram_sources").select("id", { count: "exact", head: true })
          .eq("specialty_id", user.assignedSpecialtyId).eq("is_active", true);
        activeSources = count ?? 0;
      } else {
        activeSources = await db.telegramSource.count({
          where: { specialtyId: user.assignedSpecialtyId, isActive: true },
        });
      }
    } catch { /* العدد تحسيني فقط */ }

    return NextResponse.json({
      items: rows.map((r) =>
        shapeItem(
          r,
          r.moduleId != null ? moduleNames[r.moduleId] ?? null : null,
          r.sourceId != null ? sourceTitles[r.sourceId]?.titleAr ?? null : null,
          r.sourceId != null ? sourceTitles[r.sourceId]?.tgUsername ?? null : null
        )
      ),
      myCohortId,
      setup: { bot: isBotConfigured(), activeSources },
    });
  } catch {
    return NextResponse.json({ items: [], myCohortId: null, tablesReady: false });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "سجّل الدخول أولاً" }, { status: 401 });
  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const link = String(body.link ?? "").trim();
    if (!title) return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    if (!/^https?:\/\/.+\..+/i.test(link)) {
      return NextResponse.json({ error: "أدخل رابطاً صحيحاً يبدأ بـ https://" }, { status: 400 });
    }
    const itemType = TG_ITEM_TYPES.includes(body.itemType as never) ? String(body.itemType) : "عام";
    let moduleId = body.moduleId != null && Number(body.moduleId) > 0 ? Number(body.moduleId) : null;

    // الفوج الهدف: مشرف يحدد، والطالب يضيف لفوجه تلقائياً
    let cohortId: number | null;
    if (canUploadContent(user) && body.cohortId != null && Number(body.cohortId) > 0) {
      cohortId = Number(body.cohortId);
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: c } = await supabase.from("cohort_groups").select("id").eq("id", cohortId).eq("specialty_id", user.assignedSpecialtyId).maybeSingle();
        if (!c) return NextResponse.json({ error: "الفوج المختار لا يتبع تخصصك" }, { status: 403 });
      } else {
        const c = await db.cohortGroup.findFirst({ where: { id: cohortId, specialtyId: user.assignedSpecialtyId }, select: { id: true } });
        if (!c) return NextResponse.json({ error: "الفوج المختار لا يتبع تخصصك" }, { status: 403 });
      }
    } else {
      cohortId = await resolveMyCohort(user);
      if (cohortId == null) {
        return NextResponse.json(
          { error: "أنت غير منضم إلى فوج — انضم من شاشة المجموعات أولاً لتشارك في المساحة المشتركة" },
          { status: 400 }
        );
      }
    }
    if (moduleId != null) {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: m } = await supabase.from("module_courses").select("id").eq("id", moduleId).eq("specialty_id", user.assignedSpecialtyId).maybeSingle();
        if (!m) moduleId = null;
      } else {
        const m = await db.moduleCourse.findFirst({ where: { id: moduleId, specialtyId: user.assignedSpecialtyId }, select: { id: true } });
        if (!m) moduleId = null;
      }
    }

    // نوع الرابط التقني (رابط عام / ملف)
    const { buildSearchText } = await import("@/lib/telegram/normalize");
    const urlPath = link.split("/").pop() ?? "";
    const isTme = /^https?:\/\/(t\.me|telegram\.me)\//i.test(link);
    const kind = isTme ? "link" : kindFromDocument("", urlPath);

    const now = new Date().toISOString();
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("telegram_items")
        .insert({
          source_id: null, tg_message_id: 0, media_group_id: "", kind,
          title_ar: title, caption_text: "", search_text: buildSearchText(title, "", ""),
          file_name: "", mime_type: "", file_id: "", file_unique_id: "", size_bytes: 0,
          link, specialty_id: user.assignedSpecialtyId, module_id: moduleId, item_type: itemType,
          origin: "manual", posted_by: user.fullName, cohort_id: cohortId,
          is_hidden: false, is_featured: false, ai_classified: false, posted_at: now,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ item: data });
    }
    const created = await db.telegramItem.create({
      data: {
        sourceId: null, tgMessageId: 0, mediaGroupId: "", kind,
        titleAr: title, captionText: "", searchText: buildSearchText(title, "", ""),
        fileName: "", mimeType: "", fileId: "", fileUniqueId: "", sizeBytes: 0,
        link, specialtyId: user.assignedSpecialtyId, moduleId, itemType,
        origin: "manual", postedBy: user.fullName, cohortId,
        isHidden: false, isFeatured: false, aiClassified: false, postedAt: new Date(now),
      },
    });
    return NextResponse.json({ item: created });
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
    const item = await loadItem(id);
    if (!item) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });
    if (!(await canCurateItem(user, item))) {
      return NextResponse.json({ error: "هذا المنشور خارج نطاقك" }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    const prismaPatch: Record<string, unknown> = {};
    if (body.titleAr !== undefined) {
      const t = String(body.titleAr).trim();
      if (!t) return NextResponse.json({ error: "العنوان لا يمكن أن يكون فارغاً" }, { status: 400 });
      patch.title_ar = t;
      prismaPatch.titleAr = t;
    }
    if (body.itemType !== undefined) {
      if (!TG_ITEM_TYPES.includes(body.itemType as never)) {
        return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 });
      }
      patch.item_type = String(body.itemType);
      prismaPatch.itemType = String(body.itemType);
    }
    if (body.moduleId !== undefined) {
      const m = body.moduleId != null && Number(body.moduleId) > 0 ? Number(body.moduleId) : null;
      if (m != null) {
        if (isVercel) {
          const supabase = await createSupabaseServerClient();
          const { data: mod } = await supabase.from("module_courses").select("id").eq("id", m).eq("specialty_id", item.specialtyId).maybeSingle();
          if (!mod) return NextResponse.json({ error: "المقياس لا يتبع تخصص المنشور" }, { status: 400 });
        } else {
          const mod = await db.moduleCourse.findFirst({ where: { id: m, specialtyId: item.specialtyId }, select: { id: true } });
          if (!mod) return NextResponse.json({ error: "المقياس لا يتبع تخصص المنشور" }, { status: 400 });
        }
      }
      patch.module_id = m;
      prismaPatch.moduleId = m;
    }
    if (body.isHidden !== undefined) { patch.is_hidden = !!body.isHidden; prismaPatch.isHidden = !!body.isHidden; }
    if (body.isFeatured !== undefined) { patch.is_featured = !!body.isFeatured; prismaPatch.isFeatured = !!body.isFeatured; }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });

    // إعادة بناء نص البحث إذا تغيّر العنوان
    const finalTitle = (patch.title_ar as string) ?? item.titleAr;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      if (patch.title_ar !== undefined) {
        patch.search_text = buildSearchText(finalTitle, item.captionText, item.fileName);
      }
      const { error } = await supabase.from("telegram_items").update(patch).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      if (prismaPatch.titleAr !== undefined) {
        prismaPatch.searchText = buildSearchText(finalTitle, item.captionText, item.fileName);
      }
      await db.telegramItem.update({ where: { id }, data: prismaPatch as never });
    }
    return NextResponse.json({ ok: true, message: "تم تحديث المنشور" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  try {
    const item = await loadItem(id);
    if (!item) return NextResponse.json({ error: "المنشور غير موجود" }, { status: 404 });

    // المشرف ضمن نطاقه، أو صاحب الإضافة اليدوية نفسها
    const supervisor = canUploadContent(user) ? await canCurateItem(user, item) : false;
    const ownManual =
      item.origin === "manual" &&
      item.postedBy === user.fullName &&
      (item.cohortId == null || item.cohortId === (await resolveMyCohort(user)));
    if (!supervisor && !ownManual) {
      return NextResponse.json({ error: "لا يمكنك حذف هذا المنشور" }, { status: 403 });
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("telegram_items").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      await db.telegramItem.delete({ where: { id } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف المنشور" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
