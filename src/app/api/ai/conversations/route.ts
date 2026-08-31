/**
 * List user's AI conversations
 * GET /api/ai/conversations
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ conversations: [] });
  }
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ conversations: [] });
      return NextResponse.json({ conversations: data ?? [] });
    }
    return NextResponse.json({ conversations: [] });
  } catch (e) {
    return NextResponse.json({ conversations: [] });
  }
}
