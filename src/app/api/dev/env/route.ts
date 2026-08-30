/**
 * Dev settings env endpoint (fix A.6)
 * Returns Supabase URL + masked anon key. Only accessible to OWNER.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canAccessDevSettings } from "@/lib/auth/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canAccessDevSettings(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // Mask: show first 20 chars + last 10 chars
  let maskedKey = "";
  if (anonKey.length > 40) {
    maskedKey = `${anonKey.slice(0, 20)}•••••••••••••••${anonKey.slice(-10)}`;
  } else {
    maskedKey = "•".repeat(anonKey.length);
  }

  return NextResponse.json({ url, maskedKey });
}
