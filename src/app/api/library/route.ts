/**
 * Library API — fix ج (Files screen: no way to add a file/reference)
 * Reference files (كتب، ملخصات، PDF خارجي) stored as links in library_references.
 * GET  → items of the caller's specialty
 * POST → add a reference (supervisors only)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";

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
    const { title, author, category, description, fileFormat, downloadUrl } = body;
    if (!title?.trim()) {
      return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("library_references").insert({
        specialty_id: user.assignedSpecialtyId,
        title: title.trim(),
        author: author?.trim() || user.fullName,
        category: category?.trim() || "كتاب مرجعي",
        description: description?.trim() || "",
        file_format: fileFormat?.trim() || "PDF",
        download_url: downloadUrl?.trim() || "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
      },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
