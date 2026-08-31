/**
 * AI Chat API — GLM 5.3
 * POST /api/ai/chat
 *
 * Receives a message from the student, calls GLM 5.3, stores both
 * messages in Supabase, returns the AI response.
 *
 * Body:
 *   { message: string, conversationId?: number, image?: string (base64), webSearch?: boolean }
 *
 * Response:
 *   { conversationId, reply, hasWebSearch }
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const SYSTEM_PROMPT = `أنت رفيق دراسة ذكي للطلاب الجامعيين الجزائريين، تحب المرح وتستخدم لغة ودودة.

شخصيتك:
- صديق دراسة عفوي، تستخدم العامية أحياناً لكنك دقيق علمياً
- تشجع الطالب وتمزح أحياناً لكن بلا إفراط
- تخاطب الطالب بأسمائه إذا عرفته
- تستخدم أمثلة من السياق الأكاديمي الجزائري (ENS، نظام LMD، TD/TP، المعلوماتات)

قواعدك:
- رد بنفس لغة الطالب (عربية، فرنسية، إنجليزية — حسب ما كتب به)
- لو سُئلت عن شيء لا تعرفه، قل ذلك بصراحة بدل اختراع إجابة
- ردودك مختصرة وواضحة (إلا لو طُلب التفصيل)
- لو السؤال أكاديمي، أعطِ خطوات الحل لا النتيجة فقط
- لا تتحدث عن نفسك كنموذج ذكاء اصطناعي إلا لو سُئلت مباشرة`;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const body = await req.json();
    const { message, conversationId, image, webSearch } = body as {
      message: string;
      conversationId?: number;
      image?: string; // base64 data URL
      webSearch?: boolean;
    };

    if (!message?.trim() && !image) {
      return NextResponse.json({ error: "رسالة فارغة" }, { status: 400 });
    }

    // --- Save user message to DB ---
    let convId = conversationId;
    let history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

    if (isVercel) {
      const supabase = await createSupabaseServerClient();

      // Create conversation if not provided
      if (!convId) {
        const { data: conv, error: convErr } = await supabase
          .from("ai_conversations")
          .insert({ user_id: user.id, title: message.trim().substring(0, 50) })
          .select()
          .single();
        if (convErr || !conv) {
          return NextResponse.json({ error: "فشل إنشاء المحادثة" }, { status: 500 });
        }
        convId = conv.id;
      }

      // Load last 10 messages for context
      const { data: pastMessages } = await supabase
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
        .limit(10);

      if (pastMessages) {
        history = pastMessages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));
      }

      // Save the user's new message
      await supabase.from("ai_messages").insert({
        conversation_id: convId,
        role: "user",
        content: message.trim(),
        image_url: image ?? null,
        has_web_search: false,
      });

      // Update conversation timestamp
      await supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);
    }

    // --- Call GLM 5.3 ---
    // Lazy import (server-only, won't bundle in client)
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = ZAIModule.default;

    // Read config explicitly (SDK's auto-load doesn't work on Vercel serverless)
    const fs = await import("fs");
    const path = await import("path");
    let zai: InstanceType<typeof ZAI>;
    try {
      // Try project root first
      const configPath = path.join(process.cwd(), ".z-ai-config");
      const configStr = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configStr);
      zai = new ZAI(config);
    } catch {
      // Fallback: try /etc/
      try {
        const configStr = fs.readFileSync("/etc/.z-ai-config", "utf-8");
        const config = JSON.parse(configStr);
        zai = new ZAI(config);
      } catch (e2) {
        return NextResponse.json(
          { error: "إعدادات المساعد الذكي غير موجودة" },
          { status: 500 }
        );
      }
    }

    // Build messages array
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history,
    ];

    if (image) {
      // Vision request — image + text
      messages.push({
        role: "user" as const,
        content: [
          { type: "text" as const, text: message.trim() || "صف هذه الصورة" },
          { type: "image_url" as const, image_url: { url: image } },
        ],
      } as never);

      const response = await zai.chat.completions.createVision({
        model: "glm-5.3",
        messages: messages as never,
      });

      const reply = response?.choices?.[0]?.message?.content ?? "لم أتمكن من فهم الصورة";

      // Save AI reply
      if (isVercel && convId) {
        const supabase = await createSupabaseServerClient();
        await supabase.from("ai_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: reply,
          has_web_search: false,
        });
      }

      return NextResponse.json({ conversationId: convId, reply, hasWebSearch: false });
    }

    // Text-only request
    messages.push({ role: "user" as const, content: message.trim() });

    // Optional web search
    let webSearchContext = "";
    let usedWebSearch = false;
    if (webSearch) {
      try {
        const searchResults = await zai.functions.invoke("web_search", { query: message.trim() });
        if (searchResults && searchResults.length > 0) {
          webSearchContext = "\n\nنتائج بحث الويب:\n" +
            searchResults.slice(0, 5).map((r: { title?: string; url?: string; snippet?: string }, i: number) =>
              `${i + 1}. ${r.title ?? ""}\n${r.url ?? ""}`
            ).join("\n");
          usedWebSearch = true;
        }
      } catch (e) {
        console.error("Web search failed:", e);
      }
    }

    const response = await zai.chat.completions.create({
      model: "glm-5.3",
      messages: webSearchContext
        ? [...messages, { role: "system" as const, content: "استخدم هذه نتائج البحث إن كانت مفيدة:" + webSearchContext }]
        : messages,
    });

    const reply = response?.choices?.[0]?.message?.content ?? "لم أتمكن من الرد";

    // Save AI reply
    if (isVercel && convId) {
      const supabase = await createSupabaseServerClient();
      await supabase.from("ai_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: reply,
        has_web_search: usedWebSearch,
      });
    }

    return NextResponse.json({ conversationId: convId, reply, hasWebSearch: usedWebSearch });
  } catch (e) {
    console.error("AI chat error:", e);
    return NextResponse.json(
      { error: `خطأ في المساعد الذكي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
