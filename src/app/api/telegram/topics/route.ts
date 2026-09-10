/**
 * Telegram topic bindings API (round 65) — روابط مواضيع القنوات
 *
 * الخريطة الإدارية التي تجعل تصنيف البوت حتمياً في القنوات
 * متعددة المواضيع (مثل ENS): كل موضوع يُربط بمقياس محدد أو
 * بسنة كاملة أو يُعلَّم «عاماً» فتُتجاهل منشوراته.
 *
 *   GET    ?sourceId=          → روابط مواضيع المصدر (مع أسماء الأهداف)
 *   POST   { sourceId, handle, titleAr, moduleId? | yearId? | isGeneral?, link? }
 *                                → إضافة رابط موضوع (handle = رابط t.me أو رقم الموضوع)
 *   PATCH  { id, titleAr?, moduleId?, yearId?, isGeneral?, link? } → تعديل الربط
 *   DELETE ?id=                 → حذف الربط
 *
 * التفويض: مشرفو التخصص/المالك (نفس حراسة المصادر) — والممثل ضمن
 * نطاقه (سنته/فوجه). الجدول غائب على Supabase → رسالة واضحة
 * بتنفيذ supabase_telegram_topics.sql (لا ينكسر شيء).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { tableStateFromError, isInvalidKeyError } from "@/lib/supabase/table-state";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { loadSourceById } from "@/lib/telegram/ingest";
import { parseTopicHandle, invalidateTopicCache } from "@/lib/telegram/topic-bindings";
import { moduleById } from "@/lib/telegram/module-match";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * r73: عميل الكتابة لجدول telegram_topics.
 * الجذر (تشخيص 2026-09-11): ملف r65 منح anon صلاحية SELECT فقط، بينما
 * الكتابة كانت تمر بمفتاح anon العام فتُرفض 42501 (RLS)، وكانت رسالة
 * المسار تظهر خطأً «الجدول غير منشأ».
 * التفضيل: عميل service role (يتجاوز RLS) عند توفر SUPABASE_SERVICE_ROLE_KEY،
 * وإلا anon (يعمل بعد تنفيذ supabase_topics_write_policies.sql).
 * لا يُرمي عند غياب المفتاح — يعود إلى anon بصمت.
 *
 * r73b (تشخيص حي): SUPABASE_SERVICE_ROLE_KEY مضبوط على Vercel لكن قيمته
 * غير صالحة لهذا المشروع — كل كتابة عبره ردّت «Invalid API key» بشكل
 * حتمي بينما قراءات anon سليمة 4/4. لذا كل كتابة تُنفَّذ عبر
 * runTopicWrite: جرّب service role، وعند رفض المفتاح أعد المحاولة بـ anon.
 */
function hasServiceKey(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

function serviceClientOrNull() {
  if (!hasServiceKey()) return null;
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

interface WriteOutcome<T> {
  data: T | null;
  error: { message: string } | null;
  /** أي عميل نجحت الكتابة عبره فعلاً (للتشخيص) */
  via: "service" | "anon" | "anon-fallback";
}

/**
 * ينفّذ عملية كتابة واحدة على telegram_topics مع سقوط تلقائي:
 * service role (إن وُجد المفتاح) → وعند «Invalid API key» يعيد المحاولة
 * بعميل anon العام. خطأ RLS (42501) لا يُفعّل السقوط — رسالته الصادقة
 * تطلب تنفيذ ملف السياسات.
 */
async function runTopicWrite<T>(
  op: (client: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<WriteOutcome<T>> {
  const svc = serviceClientOrNull();
  if (svc) {
    const first = await op(svc);
    if (!first.error || !isInvalidKeyError(first.error.message)) {
      return { ...first, via: "service" };
    }
    const anon = await createSupabaseServerClient();
    const second = await op(anon);
    return { ...second, via: "anon-fallback" };
  }
  const anon = await createSupabaseServerClient();
  const res = await op(anon);
  return { ...res, via: "anon" };
}

interface TopicRow {
  id: number;
  sourceId: number;
  tgThreadId: number;
  titleAr: string;
  link: string;
  yearId: number | null;
  moduleId: number | null;
  isGeneral: boolean;
}

/** هل يستطيع المتصل إدارة روابط مصدر ما؟ (نفس منطق المصادر) */
function canManageTopics(
  user: { role: string; assignedSpecialtyId: number; scopeAcademicYearId: number | null; scopeCohortGroupId: number | null },
  source: { specialtyId: number; yearId: number | null; cohortId: number | null }
): boolean {
  if (user.role === "OWNER") return true;
  if (Number(source.specialtyId) !== user.assignedSpecialtyId) return false;
  if (user.role === "SPECIALTY_ADMIN") return true;
  if (user.role === "REPRESENTATIVE") {
    if (user.scopeAcademicYearId != null && source.yearId != null && Number(source.yearId) === user.scopeAcademicYearId) return true;
    if (user.scopeCohortGroupId != null && source.cohortId != null && Number(source.cohortId) === user.scopeCohortGroupId) return true;
    // ممثل بلا نطاق سنة محدد: نسمح بمصادر تخصصه غير المقيدة بسنة أخرى
    if (user.scopeAcademicYearId != null && source.yearId == null) return true;
    return false;
  }
  return false;
}

async function loadTopic(id: number): Promise<TopicRow | null> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("telegram_topics")
        .select("id, source_id, tg_thread_id, title_ar, link, year_id, module_id, is_general")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        id: Number(r.id), sourceId: Number(r.source_id), tgThreadId: Number(r.tg_thread_id),
        titleAr: String(r.title_ar ?? ""), link: String(r.link ?? ""),
        yearId: r.year_id == null ? null : Number(r.year_id),
        moduleId: r.module_id == null ? null : Number(r.module_id),
        isGeneral: !!r.is_general,
      };
    }
    const t = await db.telegramTopic.findUnique({ where: { id } });
    if (!t) return null;
    return {
      id: t.id, sourceId: t.sourceId, tgThreadId: t.tgThreadId, titleAr: t.titleAr,
      link: t.link, yearId: t.yearId, moduleId: t.moduleId, isGeneral: t.isGeneral,
    };
  } catch {
    return null;
  }
}

/** التحقق أن هدف الربط يتبع تخصص المصدر (مقياس/سنة) */
async function assertTargetInSpecialty(
  specialtyId: number,
  moduleId: number | null,
  yearId: number | null
): Promise<string | null> {
  try {
    if (moduleId != null) {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: m } = await supabase.from("module_courses").select("id").eq("id", moduleId).eq("specialty_id", specialtyId).maybeSingle();
        if (!m) return "المقياس المختار لا يتبع تخصص المصدر";
      } else {
        const m = await db.moduleCourse.findFirst({ where: { id: moduleId, specialtyId }, select: { id: true } });
        if (!m) return "المقياس المختار لا يتبع تخصص المصدر";
      }
    }
    if (yearId != null) {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: y } = await supabase.from("academic_years").select("id").eq("id", yearId).eq("specialty_id", specialtyId).maybeSingle();
        if (!y) return "السنة المختارة لا تتبع تخصص المصدر";
      } else {
        const y = await db.academicYear.findFirst({ where: { id: yearId, specialtyId }, select: { id: true } });
        if (!y) return "السنة المختارة لا تتبع تخصص المصدر";
      }
    }
    return null;
  } catch {
    return null;
  }
}

function shapeTopic(t: TopicRow, moduleName: string | null, yearName: string | null) {
  return {
    id: t.id, sourceId: t.sourceId, tgThreadId: t.tgThreadId, titleAr: t.titleAr,
    link: t.link, yearId: t.yearId, yearName, moduleId: t.moduleId, moduleName,
    isGeneral: t.isGeneral,
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const sourceId = Number(url.searchParams.get("sourceId"));
  if (!sourceId) return NextResponse.json({ error: "حدد المصدر" }, { status: 400 });
  try {
    const source = await loadSourceById(sourceId);
    if (!source) return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
    if (!canManageTopics(user, source)) {
      return NextResponse.json({ error: "هذا المصدر خارج نطاقك" }, { status: 403 });
    }

    let topics: TopicRow[] = [];
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("telegram_topics")
        .select("id, source_id, tg_thread_id, title_ar, link, year_id, module_id, is_general")
        .eq("source_id", sourceId)
        .order("tg_thread_id", { ascending: true });
      if (error) {
        // r72: تمييز «الجدول غير منشأ» عن الخطأ العابر — رسالة صادقة
        // لا تُقنع المالك بإعادة تنفيذ SQL منفّذ (حادثة 2026-09-10)
        const state = tableStateFromError(error.message, "supabase_telegram_topics.sql");
        return NextResponse.json(
          { topics: [], tablesReady: false, tableMissing: state.tableMissing, error: state.message },
          { status: 200 }
        );
      }
      topics = (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id), sourceId: Number(r.source_id), tgThreadId: Number(r.tg_thread_id),
        titleAr: String(r.title_ar ?? ""), link: String(r.link ?? ""),
        yearId: r.year_id == null ? null : Number(r.year_id),
        moduleId: r.module_id == null ? null : Number(r.module_id),
        isGeneral: !!r.is_general,
      }));
    } else {
      const rows = await db.telegramTopic.findMany({ where: { sourceId }, orderBy: { tgThreadId: "asc" } });
      topics = rows.map((t) => ({
        id: t.id, sourceId: t.sourceId, tgThreadId: t.tgThreadId, titleAr: t.titleAr,
        link: t.link, yearId: t.yearId, moduleId: t.moduleId, isGeneral: t.isGeneral,
      }));
    }

    // أسماء الأهداف للعرض
    const moduleNames = new Map<number, string>();
    const yearNames = new Map<number, string>();
    for (const t of topics) {
      if (t.moduleId != null && !moduleNames.has(t.moduleId)) {
        const m = await moduleById(t.moduleId);
        if (m) moduleNames.set(t.moduleId, m.name);
      }
      if (t.yearId != null && !yearNames.has(t.yearId)) {
        try {
          if (isVercel) {
            const supabase = await createSupabaseServerClient();
            const { data: y } = await supabase.from("academic_years").select("year_name").eq("id", t.yearId).maybeSingle();
            if (y) yearNames.set(t.yearId, String((y as Record<string, unknown>).year_name ?? ""));
          } else {
            const y = await db.academicYear.findUnique({ where: { id: t.yearId }, select: { yearName: true } });
            if (y) yearNames.set(t.yearId, y.yearName);
          }
        } catch { /* تحسيني */ }
      }
    }
    return NextResponse.json({
      topics: topics.map((t) => shapeTopic(t, t.moduleId != null ? moduleNames.get(t.moduleId) ?? null : null, t.yearId != null ? yearNames.get(t.yearId) ?? null : null)),
    });
  } catch {
    return NextResponse.json({ topics: [], tablesReady: false });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const sourceId = Number(body.sourceId);
    if (!sourceId) return NextResponse.json({ error: "حدد المصدر" }, { status: 400 });
    const source = await loadSourceById(sourceId);
    if (!source) return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
    if (!canManageTopics(user, source)) {
      return NextResponse.json({ error: "هذا المصدر خارج نطاقك" }, { status: 403 });
    }

    // رقم الموضوع: رابط t.me أو رقم مجرد
    const handle = String(body.handle ?? "").trim();
    const parsed = parseTopicHandle(handle);
    if (parsed.error || parsed.threadId == null) {
      return NextResponse.json({ error: parsed.error ?? "أدخل رابط الموضوع أو رقمه" }, { status: 400 });
    }
    const tgThreadId = parsed.threadId;

    // هدف واحد فقط: عام | سنة | مقياس
    const isGeneral = body.isGeneral === true;
    const moduleId = body.moduleId != null && Number(body.moduleId) > 0 ? Number(body.moduleId) : null;
    const yearId = body.yearId != null && Number(body.yearId) > 0 ? Number(body.yearId) : null;
    if (!isGeneral && moduleId == null && yearId == null) {
      return NextResponse.json({ error: "اختر هدف الربط: مقياس محدد، أو سنة كاملة، أو «عام» (لا يُستورد)" }, { status: 400 });
    }
    if (isGeneral && (moduleId != null || yearId != null)) {
      return NextResponse.json({ error: "الموضوع «عام» لا يُربط بمقياس أو سنة — اختر نوعاً واحداً" }, { status: 400 });
    }
    const targetError = await assertTargetInSpecialty(source.specialtyId, moduleId, yearId);
    if (targetError) return NextResponse.json({ error: targetError }, { status: 403 });

    const titleAr = String(body.titleAr ?? "").trim().slice(0, 120);
    const link = /^https?:\/\//i.test(String(body.link ?? "")) ? String(body.link).trim() : "";

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: dup } = await supabase
        .from("telegram_topics")
        .select("id")
        .eq("source_id", sourceId)
        .eq("tg_thread_id", tgThreadId)
        .maybeSingle();
      if (dup) return NextResponse.json({ error: "هذا الموضوع مربوط مسبقاً — عدّله بدل إضافته" }, { status: 409 });
      const { data, error } = await runTopicWrite((w) =>
        w
          .from("telegram_topics")
          .insert({
            source_id: sourceId, tg_thread_id: tgThreadId, title_ar: titleAr, link,
            year_id: isGeneral ? null : yearId, module_id: isGeneral ? null : moduleId, is_general: isGeneral,
          })
          .select()
          .single()
      );
      if (error) {
        // r73: تصنيف صادق — رفض RLS (أذونات) ≠ جدول غائب ≠ خطأ عابر
        const state = tableStateFromError(error.message, "supabase_telegram_topics.sql");
        return NextResponse.json(
          { error: state.message, tableMissing: state.tableMissing, permissionDenied: state.permissionDenied ?? false },
          { status: 500 }
        );
      }
      invalidateTopicCache(sourceId);
      return NextResponse.json({ topic: data });
    }
    const dup = await db.telegramTopic.findUnique({
      where: { sourceId_tgThreadId: { sourceId, tgThreadId } },
    });
    if (dup) return NextResponse.json({ error: "هذا الموضوع مربوط مسبقاً — عدّله بدل إضافته" }, { status: 409 });
    const created = await db.telegramTopic.create({
      data: {
        sourceId, tgThreadId, titleAr, link,
        yearId: isGeneral ? null : yearId, moduleId: isGeneral ? null : moduleId, isGeneral,
      },
    });
    invalidateTopicCache(sourceId);
    return NextResponse.json({ topic: created });
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
    const topic = await loadTopic(id);
    if (!topic) return NextResponse.json({ error: "رابط الموضوع غير موجود" }, { status: 404 });
    const source = await loadSourceById(topic.sourceId);
    if (!source) return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
    if (!canManageTopics(user, source)) {
      return NextResponse.json({ error: "هذا المصدر خارج نطاقك" }, { status: 403 });
    }

    const isGeneral = body.isGeneral !== undefined ? body.isGeneral === true : topic.isGeneral;
    const moduleId = body.moduleId !== undefined ? (body.moduleId != null && Number(body.moduleId) > 0 ? Number(body.moduleId) : null) : topic.moduleId;
    const yearId = body.yearId !== undefined ? (body.yearId != null && Number(body.yearId) > 0 ? Number(body.yearId) : null) : topic.yearId;
    const targetError = await assertTargetInSpecialty(source.specialtyId, moduleId, yearId);
    if (targetError) return NextResponse.json({ error: targetError }, { status: 403 });

    if (isVercel) {
      const patch: Record<string, unknown> = {};
      if (body.titleAr !== undefined) patch.title_ar = String(body.titleAr).trim().slice(0, 120);
      if (body.link !== undefined) patch.link = /^https?:\/\//i.test(String(body.link)) ? String(body.link).trim() : "";
      if (body.isGeneral !== undefined) patch.is_general = isGeneral;
      if (body.moduleId !== undefined) patch.module_id = isGeneral ? null : moduleId;
      if (body.yearId !== undefined) patch.year_id = isGeneral ? null : yearId;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
      const { error } = await runTopicWrite((w) => w.from("telegram_topics").update(patch).eq("id", id));
      if (error) {
        // r73: تصنيف صادق — رفض RLS (أذونات) ≠ جدول غائب ≠ خطأ عابر
        const state = tableStateFromError(error.message, "supabase_telegram_topics.sql");
        return NextResponse.json({ error: state.message, tableMissing: state.tableMissing, permissionDenied: state.permissionDenied ?? false }, { status: 500 });
      }
    } else {
      await db.telegramTopic.update({
        where: { id },
        data: {
          ...(body.titleAr !== undefined ? { titleAr: String(body.titleAr).trim().slice(0, 120) } : {}),
          ...(body.link !== undefined ? { link: /^https?:\/\//i.test(String(body.link)) ? String(body.link).trim() : "" } : {}),
          ...(body.isGeneral !== undefined ? { isGeneral } : {}),
          ...(body.moduleId !== undefined ? { moduleId: isGeneral ? null : moduleId } : {}),
          ...(body.yearId !== undefined ? { yearId: isGeneral ? null : yearId } : {}),
        },
      });
    }
    invalidateTopicCache(topic.sourceId);
    return NextResponse.json({ ok: true, message: "تم تحديث ربط الموضوع" });
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
    const topic = await loadTopic(id);
    if (!topic) return NextResponse.json({ error: "رابط الموضوع غير موجود" }, { status: 404 });
    const source = await loadSourceById(topic.sourceId);
    if (!source) return NextResponse.json({ error: "المصدر غير موجود" }, { status: 404 });
    if (!canManageTopics(user, source)) {
      return NextResponse.json({ error: "هذا المصدر خارج نطاقك" }, { status: 403 });
    }
    if (isVercel) {
      const { error } = await runTopicWrite((w) => w.from("telegram_topics").delete().eq("id", id));
      if (error) {
        // r73: تصنيف صادق — رفض RLS (أذونات) ≠ جدول غائب ≠ خطأ عابر
        const state = tableStateFromError(error.message, "supabase_telegram_topics.sql");
        return NextResponse.json({ error: state.message, tableMissing: state.tableMissing, permissionDenied: state.permissionDenied ?? false }, { status: 500 });
      }
    } else {
      await db.telegramTopic.delete({ where: { id } });
    }
    invalidateTopicCache(topic.sourceId);
    return NextResponse.json({ ok: true, message: "تم حذف ربط الموضوع" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
