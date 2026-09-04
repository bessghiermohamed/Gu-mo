/**
 * Library API — fix ج (Files screen: no way to add a file/reference)
 * Reference files (كتب، ملخصات، PDF خارجي) stored as links in library_references.
 * Round 6: PATCH/DELETE — items could be ADDED but never corrected or removed,
 * so a typo in the download URL was permanent for the whole specialty.
 * Round 32: نشر إلى المكتبة — a supervisor can PUBLISH a real file from
 * their own Google Drive (15 GB). The bytes never touch Supabase; the row
 * keeps only the direct-download link + optional size + Drive fileId.
 *   GET    → items of the caller's specialty
 *   POST   → add a reference (supervisors only; JSON metadata)
 *   PATCH  → edit a reference (supervisors, own specialty only)
 *   DELETE → remove a reference (supervisors, own specialty only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { notifyContentPublished } from "@/lib/notifications";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ items: [] });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("library_references")
        .select("*")
        .eq("specialty_id", user.assignedSpecialtyId)
        .order("id", { ascending: false })
        .limit(100);
      if (error) return NextResponse.json({ items: [] });
      const items = (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id), title: String(r.title ?? ""), author: String(r.author ?? ""),
        category: String(r.category ?? "كتاب مرجعي"), description: String(r.description ?? ""),
        fileFormat: String(r.file_format ?? "PDF"), downloadUrl: String(r.download_url ?? ""),
        // round 32: optional Drive-publish metadata (missing column → null)
        fileSize: r.file_size != null ? Number(r.file_size) : null,
        driveFileId: r.storage_path ? String(r.storage_path) : null,
      }));
      return NextResponse.json({ items });
    }
    const rows = await db.libraryReference.findMany({
      where: { specialtyId: user.assignedSpecialtyId },
      orderBy: { id: "desc" },
      take: 100,
    });
    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id, title: r.title, author: r.author, category: r.category,
        description: r.description, fileFormat: r.fileFormat, downloadUrl: r.downloadUrl,
        fileSize: r.fileSize ?? null, driveFileId: r.storagePath ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { title, author, category, description, fileFormat, downloadUrl, driveFileId, fileSize } = body;
    if (!title?.trim()) {
      return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const base = {
        specialty_id: user.assignedSpecialtyId,
        title: title.trim(),
        author: author?.trim() || user.fullName,
        category: category?.trim() || "كتاب مرجعي",
        description: description?.trim() || "",
        file_format: fileFormat?.trim() || "PDF",
        download_url: downloadUrl?.trim() || "",
      };
      // round 32: publish-from-Drive metadata. The columns are optional —
      // if the owner hasn't run the 2-line ALTER yet, insert the base row
      // anyway instead of failing the whole publish.
      let data: Record<string, unknown> | null = null;
      let error: { message: string } | null = null;
      if (driveFileId || fileSize != null) {
        const full = await supabase.from("library_references").insert({
          ...base,
          storage_path: driveFileId ? String(driveFileId) : null,
          file_size: fileSize != null ? Number(fileSize) : null,
        }).select().single();
        data = full.data; error = full.error;
        if (error && !/file_size|storage_path|column/i.test(error.message)) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      if (!data) {
        const fallback = await supabase.from("library_references").insert(base).select().single();
        if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
        data = fallback.data;
      }
      // round 24: a new library reference announces itself — before, a
      // reference was invisible until a student happened to open المكتبة.
      await notifyContentPublished({
        actorId: user.id,
        actorName: user.fullName,
        specialtyId: Number(user.assignedSpecialtyId),
        type: "content_library",
        title: "مرجع جديد في المكتبة",
        body: `«${title.trim()}»${category?.trim() ? ` (${category.trim()})` : ""}${author?.trim() ? ` — ${author.trim()}` : ` — ${user.fullName}`}`,
        meta: { referenceId: data?.id },
      });
      return NextResponse.json({ item: data });
    }
    const item = await db.libraryReference.create({
      data: {
        specialtyId: user.assignedSpecialtyId,
        title: title.trim(),
        author: author?.trim() || user.fullName,
        category: category?.trim() || "كتاب مرجعي",
        description: description?.trim() || "",
        fileFormat: fileFormat?.trim() || "PDF",
        downloadUrl: downloadUrl?.trim() || "",
        ...(driveFileId ? { storagePath: String(driveFileId) } : {}),
        ...(fileSize != null ? { fileSize: Number(fileSize) } : {}),
      },
    });
    await notifyContentPublished({
      actorId: user.id,
      actorName: user.fullName,
      specialtyId: Number(user.assignedSpecialtyId),
      type: "content_library",
      title: "مرجع جديد في المكتبة",
      body: `«${title.trim()}»${category?.trim() ? ` (${category.trim()})` : ""}${author?.trim() ? ` — ${author.trim()}` : ` — ${user.fullName}`}`,
      meta: { referenceId: item.id },
    });
    return NextResponse.json({ item });
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
    const { id, title, author, category, description, fileFormat, downloadUrl } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const trimTitle = title?.trim();
    if (title !== undefined && !trimTitle) {
      return NextResponse.json({ error: "العنوان لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: item } = await supabase
        .from("library_references").select("id, specialty_id").eq("id", Number(id)).maybeSingle();
      if (!item) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && Number(item.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الملف خارج نطاق تخصصك" }, { status: 403 });
      }
      const patch: Record<string, unknown> = {};
      if (trimTitle) patch.title = trimTitle;
      if (author !== undefined) patch.author = author?.trim() || user.fullName;
      if (category !== undefined && String(category).trim()) patch.category = String(category).trim();
      if (description !== undefined) patch.description = String(description).trim();
      if (fileFormat !== undefined && String(fileFormat).trim()) patch.file_format = String(fileFormat).trim();
      if (downloadUrl !== undefined) patch.download_url = String(downloadUrl).trim();
      const { data, error } = await supabase
        .from("library_references").update(patch).eq("id", Number(id)).select().single();
      if (error || !data) return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      return NextResponse.json({ item: data });
    }
    const item = await db.libraryReference.findUnique({ where: { id: Number(id) }, select: { specialtyId: true } });
    if (!item) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
    if (user.role !== "OWNER" && item.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذا الملف خارج نطاق تخصصك" }, { status: 403 });
    }
    const updated = await db.libraryReference.update({
      where: { id: Number(id) },
      data: {
        ...(trimTitle ? { title: trimTitle } : {}),
        ...(author !== undefined ? { author: author?.trim() || user.fullName } : {}),
        ...(category !== undefined && String(category).trim() ? { category: String(category).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() } : {}),
        ...(fileFormat !== undefined && String(fileFormat).trim() ? { fileFormat: String(fileFormat).trim() } : {}),
        ...(downloadUrl !== undefined ? { downloadUrl: String(downloadUrl).trim() } : {}),
      },
    });
    return NextResponse.json({ item: updated });
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
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  const itemId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: item } = await supabase
        .from("library_references").select("id, specialty_id").eq("id", itemId).maybeSingle();
      if (!item) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && Number(item.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الملف خارج نطاق تخصصك" }, { status: 403 });
      }
      const { error } = await supabase.from("library_references").delete().eq("id", itemId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const item = await db.libraryReference.findUnique({ where: { id: itemId }, select: { specialtyId: true } });
      if (!item) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && item.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الملف خارج نطاق تخصصك" }, { status: 403 });
      }
      await db.libraryReference.delete({ where: { id: itemId } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الملف من المكتبة" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
