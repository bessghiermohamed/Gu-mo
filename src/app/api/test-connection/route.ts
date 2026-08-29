/**
 * Test Supabase connection (fix A.4)
 *
 * Strategy: do a simple read from a public table. Do NOT use a separate
 * "test endpoint" — use the same Supabase client used for real queries.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";

export async function GET() {
  // Only supervisors can run connection tests
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json(
      { ok: false, message: "غير مصرّح: هذه العملية للمشرفين فقط" },
      { status: 403 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("institutions")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: `فشل الاتصال: ${error.message}`,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "تم الاتصال بنجاح بقاعدة Supabase",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: `خطأ شبكة: ${(e as Error).message}`,
      },
      { status: 200 }
    );
  }
}
