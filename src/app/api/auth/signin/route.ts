import { NextRequest, NextResponse } from "next/server";
import { signInUser, SESSION_COOKIE, SESSION_DURATION } from "@/lib/auth/service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await signInUser({
      fullName: body.fullName ?? "",
      email: body.email ?? "",
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const res = NextResponse.json({ user: result.user });
    res.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_DURATION * 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "خطأ داخلي في الخادم" }, { status: 500 });
  }
}
