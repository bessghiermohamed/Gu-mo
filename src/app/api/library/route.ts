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

/** Round 41 — the one-time SQL that course-scoped publishing depends on.
 *  Returned by GET (needsSchema) and POST so every surface can render the
 *  same copyable snippet. */
const COURSE_SCHEMA_SQL =
  "ALTER TABLE library_references ADD COLUMN IF NOT EXISTS module_id INTEGER;\n" +
  "ALTER TABLE library_references ADD COLUMN IF NOT EXISTS storage_path TEXT;\n" +
  "ALTER TABLE library_references ADD COLUMN IF NOT EXISTS file_size BIGINT;";

/** Round 41: detect an un-migrated DB (module_id column absent) in BOTH
 *  branches — Supabase surfaces it as a PostgREST error, Prisma/SQLite as
 *  "no such column" / "Unknown argument". In that state a course-scoped
 *  material cannot be linked, so the UI shows the one-time SQL instead of
 *  silently dropping the material into the general library. */
function needsSchemaResponse() {
  return NextResponse.json(
    { items: [], error: "قاعدة البيانات تحتاج تحديثاً لمرة واحدة لربط المواد بالمقاييس", needsSchema: true, sql: COURSE_SCHEMA_SQL },
    { status: 200 }
  );
}
function isMissingModuleColumn(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? "");
  return (
    /no such column|Unknown argument|does not exist in the current database|column/i.test(msg) &&
    /module_?[iI]d/i.test(msg)
  );
}

/** round 52 — resolve course names for module-linked files so «ملفاتي» can
 *  badge each file with its course. LibraryReference has no FK relation in
 *  the Prisma schema, so the names are fetched in one extra query. Never
 *  throws — a failed lookup simply leaves moduleName empty. */
async function attachModuleNames(
  items: Array<{ moduleId: number | null; [k: string]: unknown }>
): Promise<Array<{ moduleId: number | null; moduleName?: string | null; [k: string]: unknown }>> {
  const ids = Array.from(new Set(items.map((i) => i.moduleId).filter((n): n is number => n != null)));
  if (ids.length === 0) return items;
  const nameById = new Map<number, string>();
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("module_courses").select("id, name").in("id", ids);
      (data ?? []).forEach((r: Record<string, unknown>) => nameById.set(Number(r.id), String(r.name ?? "")));
    } else {
      const rows = await db.moduleCourse.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      rows.forEach((r) => nameById.set(r.id, r.name));
    }
  } catch {
    // names stay empty — the list still renders
  }
  return items.map((i) => ({
    ...i,
    moduleName: i.moduleId != null ? nameById.get(i.moduleId) ?? null : null,
  }));
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ items: [] });
  // round 33: optional course filter — تفاصيل المقياس fetches /api/library?moduleId=N.
  // Without the param the specialty-wide list is returned exactly as before.
  const moduleId = req.nextUrl.searchParams.get("moduleId");
  // round 52: «ملفاتي» يطلب includeCourseFiles=1 ليُظهر كذلك ملفات المقاييس
  // مصنّفة (كانت محصورة داخل المقياس فقط) — مع اسم المقياس لكل ملف مرتبط.
  const includeCourseFiles = req.nextUrl.searchParams.get("includeCourseFiles") === "1";
  try {
    // round 41 fix — authorize a module-scoped read against the COURSE, not
    // against the viewer's specialty. BUG this replaces: the query below used
    // to intersect specialty_id = viewer AND module_id = N, while POST stamped
    // new rows with the UPLOADER's specialty — so a material uploaded into a
    // course by a manager of another specialty (routinely the OWNER, the only
    // cross-specialty manager) was invisible to every student of that course
    // (their specialty never matches the stamped row). Resolution: look up the
    // course's own specialty; OWNER may read any course, everyone else must be
    // assigned to the course's specialty; the row-level specialty filter is
    // then dropped for module-scoped reads — which also makes already-stranded
    // rows (uploaded before this fix) visible again with no data migration.
    let courseSpecialtyId: number | null = null;
    if (moduleId) {
      const mid = Number(moduleId);
      if (!Number.isFinite(mid)) return NextResponse.json({ items: [] });
      if (isVercel) {
        const supabase0 = await createSupabaseServerClient();
        const { data: course0 } = await supabase0
          .from("module_courses").select("specialty_id").eq("id", mid).maybeSingle();
        if (!course0) return NextResponse.json({ items: [] });
        courseSpecialtyId = Number(course0.specialty_id);
      } else {
        const course0 = await db.moduleCourse.findUnique({ where: { id: mid }, select: { specialtyId: true } });
        if (!course0) return NextResponse.json({ items: [] });
        courseSpecialtyId = course0.specialtyId;
      }
      if (user.role !== "OWNER" && courseSpecialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ items: [] });
      }
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const fetchList = async (hideCourseRows: boolean) => {
        let query = supabase.from("library_references").select("*");
        if (moduleId) {
          // course-authorized above — filter by the course link ONLY
          query = query.eq("module_id", Number(moduleId));
        } else {
          query = query.eq("specialty_id", user.assignedSpecialtyId);
          if (hideCourseRows) {
            // round 41: materials uploaded INSIDE a course live at the course —
            // the general library lists only specialty-wide references.
            query = query.is("module_id", null);
          }
        }
        return query.order("id", { ascending: false }).limit(200);
      };
      let { data, error } = await fetchList(!includeCourseFiles);
      if (error && !moduleId) {
        // module_id column may not exist yet (owner hasn't run the SQL) —
        // degrade to the old unfiltered list instead of an empty library.
        ({ data, error } = await fetchList(false));
      }
      if (error) {
        if (moduleId) return NextResponse.json({ items: [], needsSchema: true, sql: COURSE_SCHEMA_SQL });
        return NextResponse.json({ items: [] });
      }
      const items = await attachModuleNames(
        (data ?? []).map((r: Record<string, unknown>) => ({
          id: Number(r.id), title: String(r.title ?? ""), author: String(r.author ?? ""),
          category: String(r.category ?? "كتاب مرجعي"), description: String(r.description ?? ""),
          fileFormat: String(r.file_format ?? "PDF"), downloadUrl: String(r.download_url ?? ""),
          // round 32: optional Drive-publish metadata (missing column → null)
          fileSize: r.file_size != null ? Number(r.file_size) : null,
          driveFileId: r.storage_path ? String(r.storage_path) : null,
          moduleId: r.module_id != null ? Number(r.module_id) : null,
        }))
      );
      return NextResponse.json({ items });
    }
    const rows = await db.libraryReference.findMany({
      where: moduleId
        // course-authorized above — filter by the course link ONLY
        ? { moduleId: Number(moduleId) }
        : {
            specialtyId: user.assignedSpecialtyId,
            // round 41: course materials live at the course, not the library
            ...(includeCourseFiles ? {} : { moduleId: null }),
          },
      orderBy: { id: "desc" },
      take: 200,
    });
    return NextResponse.json({
      items: await attachModuleNames(rows.map((r) => ({
        id: r.id, title: r.title, author: r.author, category: r.category,
        description: r.description, fileFormat: r.fileFormat, downloadUrl: r.downloadUrl,
        fileSize: r.fileSize ?? null, driveFileId: r.storagePath ?? null,
        moduleId: r.moduleId ?? null,
      }))),
    });
  } catch (e) {
    if (isMissingModuleColumn(e)) return needsSchemaResponse();
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
    const { title, author, category, description, fileFormat, downloadUrl, driveFileId, fileSize, moduleId } = body;
    if (!title?.trim()) {
      return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    }
    // round 41 fix — a course-scoped material belongs to the COURSE's
    // specialty, not the uploader's. The old code stamped specialty_id with
    // the uploader's assignedSpecialtyId, so the course's students (filtered
    // by their own specialty) could never see it. Resolve the course first,
    // scope-check the uploader against it (OWNER may manage any course —
    // same rule as PATCH/DELETE on /api/courses), and stamp + notify with
    // the course's specialty.
    let courseSpecialtyId: number | null = null;
    if (moduleId != null) {
      const mid = Number(moduleId);
      if (isVercel) {
        const supabase0 = await createSupabaseServerClient();
        const { data: course0 } = await supabase0
          .from("module_courses").select("specialty_id").eq("id", mid).maybeSingle();
        if (!course0) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 400 });
        courseSpecialtyId = Number(course0.specialty_id);
      } else {
        const course0 = await db.moduleCourse.findUnique({ where: { id: mid }, select: { specialtyId: true } });
        if (!course0) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 400 });
        courseSpecialtyId = course0.specialtyId;
      }
      if (user.role !== "OWNER" && courseSpecialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
      }
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const base = {
        specialty_id: courseSpecialtyId ?? user.assignedSpecialtyId,
        title: title.trim(),
        author: author?.trim() || user.fullName,
        category: category?.trim() || "كتاب مرجعي",
        description: description?.trim() || "",
        file_format: fileFormat?.trim() || "PDF",
        download_url: downloadUrl?.trim() || "",
      };
      // round 32/33: publish-from-Drive + course-scoping metadata. The
      // columns are optional for LIBRARY uploads (base row still works).
      // Round 41 — COURSE uploads are strict: a material uploaded inside a
      // course must land course-scoped, never silently demoted to the
      // general library. If module_id is missing we fail with needsSchema
      // + the exact SQL so the UI can offer a one-time self-service fix.
      let data: Record<string, unknown> | null = null;
      let error: { message: string } | null = null;
      if (moduleId != null) {
        const attempts = [
          { ...base, storage_path: driveFileId ? String(driveFileId) : null, file_size: fileSize != null ? Number(fileSize) : null, module_id: Number(moduleId) },
          { ...base, module_id: Number(moduleId) },
        ];
        let lastErr: { message: string } | null = null;
        for (const payload of attempts) {
          const full = await supabase.from("library_references").insert(payload).select().single();
          data = full.data; error = full.error;
          if (!error) break;
          lastErr = error;
        }
        if (!data) {
          return NextResponse.json(
            { error: "قاعدة البيانات تحتاج تحديثاً لمرة واحدة لربط المواد بالمقاييس", needsSchema: true, sql: COURSE_SCHEMA_SQL },
            { status: 400 }
          );
        }
        void lastErr;
      } else {
        const wantsExtra = driveFileId || fileSize != null;
        if (wantsExtra) {
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
      }
      // round 24: a new library reference announces itself — before, a
      // reference was invisible until a student happened to open المكتبة.
      await notifyContentPublished({
        actorId: user.id,
        actorName: user.fullName,
        specialtyId: courseSpecialtyId ?? Number(user.assignedSpecialtyId),
        type: "content_library",
        title: moduleId != null ? "مادة جديدة في أحد المقاييس" : "مرجع جديد في المكتبة",
        body: `«${title.trim()}»${category?.trim() ? ` (${category.trim()})` : ""}${author?.trim() ? ` — ${author.trim()}` : ` — ${user.fullName}`}`,
        meta: { referenceId: data?.id },
      });
      return NextResponse.json({ item: data });
    }
    let item;
    try {
      item = await db.libraryReference.create({
        data: {
          specialtyId: courseSpecialtyId ?? user.assignedSpecialtyId,
          title: title.trim(),
          author: author?.trim() || user.fullName,
          category: category?.trim() || "كتاب مرجعي",
          description: description?.trim() || "",
          fileFormat: fileFormat?.trim() || "PDF",
          downloadUrl: downloadUrl?.trim() || "",
          ...(driveFileId ? { storagePath: String(driveFileId) } : {}),
          ...(fileSize != null ? { fileSize: Number(fileSize) } : {}),
          ...(moduleId != null ? { moduleId: Number(moduleId) } : {}),
        },
      });
    } catch (e) {
      // round 41: a course-scoped material must NEVER be demoted to the
      // general library when the DB lacks the module_id column — fail with
      // the one-time SQL so the UI can guide the self-service fix.
      if (moduleId != null && isMissingModuleColumn(e)) {
        return NextResponse.json(
          { error: "قاعدة البيانات تحتاج تحديثاً لمرة واحدة لربط المواد بالمقاييس", needsSchema: true, sql: COURSE_SCHEMA_SQL },
          { status: 400 }
        );
      }
      throw e;
    }
    await notifyContentPublished({
      actorId: user.id,
      actorName: user.fullName,
      specialtyId: courseSpecialtyId ?? Number(user.assignedSpecialtyId),
      type: "content_library",
      title: moduleId != null ? "مادة جديدة في أحد المقاييس" : "مرجع جديد في المكتبة",
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
