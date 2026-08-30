import { NextRequest, NextResponse } from "next/server";
import { signOutUser, SESSION_COOKIE, getCurrentUser } from "@/lib/auth/service";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (user) {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (match) {
      await signOutUser(match[1]);
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
