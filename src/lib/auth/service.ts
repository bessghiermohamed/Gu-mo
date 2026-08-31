/**
 * Talib Auth Service (fix B.1)
 * Uses Supabase when NEXT_PUBLIC_SUPABASE_URL is set (production),
 * falls back to Prisma SQLite locally.
 */
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";
import type { UserRole } from "@/lib/auth/types";

const SESSION_COOKIE_NAME = "talib_session";
const SESSION_DURATION_DAYS = 30;

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  studentId: string;
  role: UserRole;
  assignedSpecialtyId: number;
  scopeInstitutionId: number | null;
  scopeSpecialtyId: number | null;
  scopeAcademicYearId: number | null;
  scopeTrackId: number | null;
  scopeGroupId: number | null;
  scopeCohortGroupId: number | null;
}

function generateStudentId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(10000000 + Math.random() * 90000000);
  return `${year}${random}`;
}

function toSessionUser(row: Record<string, unknown>): SessionUser {
  return {
    id: Number(row.id),
    fullName: String(row.full_name ?? row.fullName ?? ""),
    email: String(row.email ?? ""),
    studentId: String(row.student_id ?? row.studentId ?? ""),
    role: String(row.role ?? "STUDENT") as UserRole,
    assignedSpecialtyId: Number(row.assigned_specialty_id ?? row.assignedSpecialtyId ?? 1),
    scopeInstitutionId: row.scope_institution_id != null ? Number(row.scope_institution_id) : (row.scopeInstitutionId != null ? Number(row.scopeInstitutionId) : null),
    scopeSpecialtyId: row.scope_specialty_id != null ? Number(row.scope_specialty_id) : (row.scopeSpecialtyId != null ? Number(row.scopeSpecialtyId) : null),
    scopeAcademicYearId: row.scope_academic_year_id != null ? Number(row.scope_academic_year_id) : (row.scopeAcademicYearId != null ? Number(row.scopeAcademicYearId) : null),
    scopeTrackId: row.scope_track_id != null ? Number(row.scope_track_id) : (row.scopeTrackId != null ? Number(row.scopeTrackId) : null),
    scopeGroupId: row.scope_group_id != null ? Number(row.scope_group_id) : (row.scopeGroupId != null ? Number(row.scopeGroupId) : null),
    scopeCohortGroupId: row.scope_cohort_group_id != null ? Number(row.scope_cohort_group_id) : (row.scopeCohortGroupId != null ? Number(row.scopeCohortGroupId) : null),
  };
}

export async function signUpUser(input: { fullName: string; email: string }): Promise<{ user: SessionUser; token: string } | { error: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedName = input.fullName.trim();
  if (!trimmedName || !normalizedEmail) return { error: "يرجى ملء الاسم والبريد الإلكتروني" };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) return { error: "صيغة بريد إلكتروني غير صحيحة" };

  const studentId = generateStudentId();

  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase.from("app_users").select("id").eq("email", normalizedEmail).maybeSingle();
    if (existing) return { error: "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك." };
    // fix: don't hardcode specialty 1 — it may not exist. Use the first real specialty.
    const { data: firstSpecialty } = await supabase.from("specialties").select("id, institution_id").order("id", { ascending: true }).limit(1).maybeSingle();
    if (!firstSpecialty) return { error: "لا يمكن التسجيل حالياً: لم تُضف أي تخصصات بعد." };
    const defaultSpecialtyId = Number(firstSpecialty.id);
    const defaultInstitutionId = firstSpecialty.institution_id != null ? Number(firstSpecialty.institution_id) : 1;
    const { count } = await supabase.from("app_users").select("id", { count: "exact", head: true });
    const isFirstUser = (count ?? 0) === 0;
    const role = isFirstUser ? "OWNER" : "STUDENT";
    const { data: newUser, error } = await supabase.from("app_users").insert({
      full_name: trimmedName, email: normalizedEmail, student_id: studentId, role, assigned_specialty_id: defaultSpecialtyId, scope_institution_id: defaultInstitutionId,
    }).select().single();
    if (error || !newUser) return { error: `فشل إنشاء الحساب: ${error?.message ?? "خطأ"}` };
    const token = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const { error: sessionError } = await supabase.from("device_sessions").insert({
      user_id: newUser.id, device_token: token, expires_at: expiresAt.toISOString(),
    });
    if (sessionError) return { error: `فشل إنشاء الجلسة: ${sessionError.message}` };
    return { user: toSessionUser(newUser), token };
  }

  // Local Prisma
  const existing = await db.appUser.findUnique({ where: { email: normalizedEmail } });
  if (existing) return { error: "هذا البريد مسجّل مسبقاً." };
  // fix: don't hardcode specialty 1 — it may not exist. Use the first real specialty.
  const firstSpecialty = await db.specialty.findFirst({ orderBy: { id: "asc" } });
  if (!firstSpecialty) return { error: "لا يمكن التسجيل حالياً: لم تُضف أي تخصصات بعد." };
  const userCount = await db.appUser.count();
  const newUser = await db.appUser.create({
    data: { fullName: trimmedName, email: normalizedEmail, studentId, specialtyName: "", yearName: "", groupNumber: "", role: userCount === 0 ? "OWNER" : "STUDENT", assignedSpecialtyId: firstSpecialty.id, scopeInstitutionId: firstSpecialty.institutionId },
  });
  const token = randomBytes(48).toString("hex");
  await db.deviceSession.create({ data: { userId: newUser.id, deviceToken: token, expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000) } });
  return { user: toSessionUser(newUser as unknown as Record<string, unknown>), token };
}

export async function signInUser(input: { fullName: string; email: string }): Promise<{ user: SessionUser; token: string } | { error: string }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedName = input.fullName.trim();
  if (!trimmedName || !normalizedEmail) return { error: "يرجى ملء الاسم والبريد الإلكتروني" };

  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data: user, error } = await supabase.from("app_users").select("*").eq("email", normalizedEmail).maybeSingle();
    if (error || !user) return { error: "لا يوجد حساب بهذه البيانات." };
    if (user.full_name.trim() !== trimmedName) return { error: "لا يوجد حساب بهذه البيانات." };
    const token = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const { error: sessionError } = await supabase.from("device_sessions").insert({ user_id: user.id, device_token: token, expires_at: expiresAt.toISOString() });
    if (sessionError) return { error: `فشل إنشاء الجلسة: ${sessionError.message}` };
    return { user: toSessionUser(user), token };
  }

  const user = await db.appUser.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.fullName.trim() !== trimmedName) return { error: "لا يوجد حساب بهذه البيانات." };
  const token = randomBytes(48).toString("hex");
  await db.deviceSession.create({ data: { userId: user.id, deviceToken: token, expiresAt: new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000) } });
  return { user: toSessionUser(user as unknown as Record<string, unknown>), token };
}

export async function getUserBySessionToken(token: string): Promise<SessionUser | null> {
  if (!token || token.length < 32) return null;

  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data: session, error } = await supabase
      .from("device_sessions")
      .select("id, user_id, expires_at, app_users!inner(*)")
      .eq("device_token", token)
      .maybeSingle();
    if (error || !session) return null;
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      await supabase.from("device_sessions").delete().eq("id", session.id);
      return null;
    }
    return toSessionUser((session.app_users ?? {}) as unknown as Record<string, unknown>);
  }

  const session = await db.deviceSession.findUnique({ where: { deviceToken: token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) { await db.deviceSession.delete({ where: { id: session.id } }); return null; }
  return toSessionUser(session.user as unknown as Record<string, unknown>);
}

export async function signOutUser(token: string): Promise<void> {
  if (!token) return;
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      await supabase.from("device_sessions").delete().eq("device_token", token);
    } else {
      await db.deviceSession.delete({ where: { deviceToken: token } });
    }
  } catch {}
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
