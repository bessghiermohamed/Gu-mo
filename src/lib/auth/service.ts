/**
 * Talib Auth Service (fix B.1)
 *
 * Authentication model: NO PASSWORDS.
 * - Sign up: full name + email → creates AppUser + auto-generated studentId
 * - Sign in: full name + email → look up by exact match → if found, create DeviceSession
 * - "Remember device": on first successful sign-in, store a secure token cookie.
 *
 * Uses Supabase PostgreSQL in production (Vercel) and Prisma SQLite locally.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";
import type { UserRole } from "@/lib/auth/types";

const SESSION_COOKIE_NAME = "talib_session";
const SESSION_DURATION_DAYS = 30;

const isVercel = process.env.VERCEL === "1";

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  studentId: string;
  role: UserRole;
  assignedSpecialtyId: number;
  scopeCohortGroupId: number | null;
  scopeAcademicYearId: number | null;
  scopeSpecialtyId: number | null;
}

/**
 * Sign up a new user.
 * First user becomes OWNER automatically.
 */
export async function signUpUser(input: {
  fullName: string;
  email: string;
}): Promise<{ user: SessionUser; token: string } | { error: string }> {
  const { fullName, email } = input;

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();

  if (!trimmedName || !normalizedEmail) {
    return { error: "يرجى ملء الاسم والبريد الإلكتروني" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return { error: "صيغة بريد إلكتروني غير صحيحة" };
  }

  const studentId = generateStudentId();

  if (isVercel) {
    const supabase = await createSupabaseServerClient();

    // Check existing
    const { data: existing } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return { error: "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك." };
    }

    // Count users to determine if first (OWNER)
    const { count } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true });

    const isFirstUser = (count ?? 0) === 0;
    const role = isFirstUser ? "OWNER" : "STUDENT";

    // Create user
    const { data: newUser, error } = await supabase
      .from("app_users")
      .insert({
        full_name: trimmedName,
        email: normalizedEmail,
        student_id: studentId,
        role,
        assigned_specialty_id: 1,
      })
      .select()
      .single();

    if (error || !newUser) {
      return { error: `فشل إنشاء الحساب: ${error?.message ?? "خطأ غير معروف"}` };
    }

    // Create session
    const token = randomBytes(48).toString("hex");
    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    const { error: sessionError } = await supabase.from("device_sessions").insert({
      user_id: newUser.id,
      device_token: token,
      expires_at: expiresAt.toISOString(),
    });

    if (sessionError) {
      return { error: `فشل إنشاء الجلسة: ${sessionError.message}` };
    }

    return { user: toSessionUser(newUser), token };
  }

  // Local (Prisma)
  const existing = await db.appUser.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return { error: "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك." };
  }

  const userCount = await db.appUser.count();
  const isFirstUser = userCount === 0;

  const newUser = await db.appUser.create({
    data: {
      fullName: trimmedName,
      email: normalizedEmail,
      studentId,
      role: isFirstUser ? "OWNER" : "STUDENT",
      assignedSpecialtyId: 1,
    },
  });

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await db.deviceSession.create({
    data: {
      userId: newUser.id,
      deviceToken: token,
      expiresAt,
    },
  });

  return {
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      studentId: newUser.studentId,
      role: newUser.role as UserRole,
      assignedSpecialtyId: newUser.assignedSpecialtyId,
      scopeCohortGroupId: newUser.scopeCohortGroupId ?? null,
      scopeAcademicYearId: newUser.scopeAcademicYearId ?? null,
      scopeSpecialtyId: newUser.scopeSpecialtyId ?? null,
    },
    token,
  };
}

/**
 * Sign in user by name + email match (no password).
 */
export async function signInUser(input: {
  fullName: string;
  email: string;
}): Promise<{ user: SessionUser; token: string } | { error: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedName = input.fullName.trim();

  if (!trimmedName || !normalizedEmail) {
    return { error: "يرجى ملء الاسم والبريد الإلكتروني" };
  }

  if (isVercel) {
    const supabase = await createSupabaseServerClient();

    const { data: user, error } = await supabase
      .from("app_users")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error || !user) {
      return { error: "لا يوجد حساب بهذه البيانات. تحقق أو أنشئ حساباً جديداً." };
    }

    if (user.full_name.trim() !== trimmedName) {
      return { error: "لا يوجد حساب بهذه البيانات. تحقق أو أنشئ حساباً جديداً." };
    }

    // Create session
    const token = randomBytes(48).toString("hex");
    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
    );

    const { error: sessionError } = await supabase.from("device_sessions").insert({
      user_id: user.id,
      device_token: token,
      expires_at: expiresAt.toISOString(),
    });

    if (sessionError) {
      return { error: `فشل إنشاء الجلسة: ${sessionError.message}` };
    }

    return { user: toSessionUser(user), token };
  }

  // Local
  const user = await db.appUser.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.fullName.trim() !== trimmedName) {
    return { error: "لا يوجد حساب بهذه البيانات. تحقق أو أنشئ حساباً جديداً." };
  }

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await db.deviceSession.create({
    data: {
      userId: user.id,
      deviceToken: token,
      expiresAt,
    },
  });

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      studentId: user.studentId,
      role: user.role as UserRole,
      assignedSpecialtyId: user.assignedSpecialtyId,
      scopeCohortGroupId: user.scopeCohortGroupId ?? null,
      scopeAcademicYearId: user.scopeAcademicYearId ?? null,
      scopeSpecialtyId: user.scopeSpecialtyId ?? null,
    },
    token,
  };
}

/**
 * Look up a user by session token.
 */
export async function getUserBySessionToken(
  token: string
): Promise<SessionUser | null> {
  if (!token || token.length < 32) return null;

  if (isVercel) {
    const supabase = await createSupabaseServerClient();

    const { data: session, error } = await supabase
      .from("device_sessions")
      .select(
        "id, user_id, expires_at, app_users!inner(*)"
      )
      .eq("device_token", token)
      .maybeSingle();

    if (error || !session) return null;

    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      await supabase.from("device_sessions").delete().eq("id", session.id);
      return null;
    }

    const user = session.app_users as Record<string, unknown>;
    return toSessionUser(user);
  }

  // Local
  const session = await db.deviceSession.findUnique({
    where: { deviceToken: token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.deviceSession.delete({ where: { id: session.id } });
    return null;
  }

  return {
    id: session.user.id,
    fullName: session.user.fullName,
    email: session.user.email,
    studentId: session.user.studentId,
    role: session.user.role as UserRole,
    assignedSpecialtyId: session.user.assignedSpecialtyId,
    scopeCohortGroupId: session.user.scopeCohortGroupId ?? null,
    scopeAcademicYearId: session.user.scopeAcademicYearId ?? null,
    scopeSpecialtyId: session.user.scopeSpecialtyId ?? null,
  };
}

/**
 * Sign out (delete the current session).
 */
export async function signOutUser(token: string): Promise<void> {
  if (!token) return;

  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      await supabase.from("device_sessions").delete().eq("device_token", token);
    } else {
      await db.deviceSession.delete({ where: { deviceToken: token } });
    }
  } catch {
    // ignore
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
}

export const SESSION_COOKIE = SESSION_COOKIE_NAME;
export const SESSION_DURATION = SESSION_DURATION_DAYS;

// Helper: convert Supabase row (snake_case) to SessionUser
function toSessionUser(row: Record<string, unknown>): SessionUser {
  return {
    id: Number(row.id),
    fullName: String(row.full_name ?? ""),
    email: String(row.email ?? ""),
    studentId: String(row.student_id ?? ""),
    role: String(row.role ?? "STUDENT") as UserRole,
    assignedSpecialtyId: Number(row.assigned_specialty_id ?? 1),
    scopeCohortGroupId: row.scope_cohort_group_id ? Number(row.scope_cohort_group_id) : null,
    scopeAcademicYearId: row.scope_academic_year_id ? Number(row.scope_academic_year_id) : null,
    scopeSpecialtyId: row.scope_specialty_id ? Number(row.scope_specialty_id) : null,
  };
}

function generateStudentId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(10000000 + Math.random() * 90000000);
  return `${year}${random}`;
}
