/**
 * Get all messages in a conversation
 * GET /api/ai/conversations/[id]/messages
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ messages: [] });
  }
  try {
    const { id } = await params;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();

      // Verify conversation belongs to user
      const { data: conv } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", parseInt(id))
        .eq("user_id", user.id)
        .maybeSingle();

      if (!conv) {
        return NextResponse.json({ error: "محادثة غير موجودة" }, { status: 404 });
      }

      const { data, error } = await supabase
        .from("ai_messages")
        .select("id, role, content, image_url, has_web_search, created_at")
        .eq("conversation_id", parseInt(id))
        .order("created_at", { ascending: true });

      if (error) return NextResponse.json({ messages: [] });
      return NextResponse.json({ messages: data ?? [] });
    }
    return NextResponse.json({ messages: [] });
  } catch (e) {
    return NextResponse.json({ messages: [] });
  }
}
