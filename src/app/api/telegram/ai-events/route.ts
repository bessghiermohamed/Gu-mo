/**
 * AI event log API (round 71) — مراقبة تنسيق النماذج.
 *
 * GET ?limit=100 — أحدث أحداث الذكاء (الاستيراد/إعادة التصنيف/الاعتماد):
 * النموذج المستعمل، ما استُخرج (سنة/ملمح/درس/مقياس)، الثقة، القرار،
 * والسبب. للمشرفين فقط (canUploadContent) — وللمالك كل التخصص.
 *
 * الجدول اختياري (download/supabase_telegram_intelligence.sql):
 * قبل تنفيذه تُعاد قائمة فارغة مع ready=false — فتعرض الواجهة تعليمات
 * SQL بدل الأحداث، ولا ينكسر شيء.
 *
 * الأمن: لا يُسجَّل أي سر أبداً (توكن/مفتاح) — فقط أسماء النماذج
 * والقرارات والاستخراجات.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 300);
  const sourceIdParam = url.searchParams.get("sourceId");
  const sourceId = sourceIdParam && Number(sourceIdParam) > 0 ? Number(sourceIdParam) : null;

  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("ai_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (sourceId != null) q = q.eq("source_id", sourceId);
      const { data, error } = await q;
      if (error) {
        // الجدول غير منشأ (PGRST205) — الحالة الطبيعية قبل تنفيذ SQL
        return NextResponse.json({ events: [], ready: false });
      }
      const events = (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id ?? 0),
        stage: String(r.stage ?? ""),
        sourceId: r.source_id == null ? null : Number(r.source_id),
        tgMessageId: r.tg_message_id == null ? null : Number(r.tg_message_id),
        model: r.model == null ? null : String(r.model),
        provider: r.provider == null ? null : String(r.provider),
        latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
        extracted: (r.extracted ?? null) as Record<string, unknown> | null,
        decision: r.decision == null ? null : String(r.decision),
        confidence: r.confidence == null ? null : Number(r.confidence),
        reason: r.reason == null ? null : String(r.reason),
        detail: r.detail == null ? null : String(r.detail),
        createdAt: r.created_at ? String(r.created_at) : null,
      }));
      return NextResponse.json({ events, ready: true });
    }
    const rows = await db.aiEvent.findMany({
      where: { ...(sourceId != null ? { sourceId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const events = rows.map((r) => ({
      id: r.id,
      stage: r.stage,
      sourceId: r.sourceId,
      tgMessageId: r.tgMessageId,
      model: r.model,
      provider: r.provider,
      latencyMs: r.latencyMs,
      extracted: r.extracted ? (JSON.parse(r.extracted) as Record<string, unknown>) : null,
      decision: r.decision,
      confidence: r.confidence,
      reason: r.reason,
      detail: r.detail,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    }));
    return NextResponse.json({ events, ready: true });
  } catch {
    return NextResponse.json({ events: [], ready: false });
  }
}
