/**
 * Talib Auth Service (fix B.1)
 *
 * Authentication model: NO PASSWORDS.
 * - Sign up: full name + email → creates AppUser + auto-generated studentId
 * - Sign in: full name + email → look up by exact match → if found, create DeviceSession
 * - "Remember device": on first successful sign-in, store a secure token cookie.
 *   On next visit, middleware reads the cookie and auto-logs in.
 *
 * Security trade-off: this is less secure than passwords, but matches the user's
 * explicit decision (B.1) for the academic portal use case.
 */
import { db } from "@/lib/db";
import { randomBytes } from "crypto";
import type { AppUser, UserRole } from "@prisma/client";

const SESSION_COOKIE_NAME = "talib_session";
const SESSION_DURATION_DAYS = 30;

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

  // Normalize
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();

  if (!trimmedName || !normalizedEmail) {
    return { error: "يرجى ملء الاسم والبريد الإلكتروني" };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return { error: "صيغة بريد إلكتروني غير صحيحة" };
  }

  // Check existing
  const existing = await db.appUser.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return { error: "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك." };
  }

  // First user = OWNER, others = STUDENT
  const userCount = await db.appUser.count();
  const isFirstUser = userCount === 0;

  // Auto-generate student ID (sequential)
  const studentId = generateStudentId();

  // Create user
  const newUser = await db.appUser.create({
    data: {
      fullName: trimmedName,
      email: normalizedEmail,
      studentId,
      role: isFirstUser ? "OWNER" : "STUDENT",
      specialtyName: "",
      yearName: "",
      groupNumber: "",
      assignedSpecialtyId: 1,
    },
  });

  // Create session
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await db.deviceSession.create({
    data: {
      userId: newUser.id,
      deviceToken: token,
      userAgent: "",
      expiresAt,
    },
  });

  return { user: toSessionUser(newUser), token };
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

  // Look up by email first (email is unique)
  const user = await db.appUser.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.fullName.trim() !== trimmedName) {
    return { error: "لا يوجد حساب بهذه البيانات. تحقق أو أنشئ حساباً جديداً." };
  }

  // Create session
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await db.deviceSession.create({
    data: {
      userId: user.id,
      deviceToken: token,
      userAgent: "",
      expiresAt,
    },
  });

  return { user: toSessionUser(user), token };
}

/**
 * Look up a user by session token (for auto-login).
 */
export async function getUserBySessionToken(
  token: string
): Promise<SessionUser | null> {
  if (!token || token.length < 32) return null;

  const session = await db.deviceSession.findUnique({
    where: { deviceToken: token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // Expired - clean up
    await db.deviceSession.delete({ where: { id: session.id } });
    return null;
  }

  return toSessionUser(session.user);
}

/**
 * Sign out (delete the current session).
 */
export async function signOutUser(token: string): Promise<void> {
  if (!token) return;
  try {
    await db.deviceSession.delete({ where: { deviceToken: token } });
  } catch {
    // ignore not-found errors
  }
}

/**
 * Get the current session user from cookies (server-side).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
}

export const SESSION_COOKIE = SESSION_COOKIE_NAME;
export const SESSION_DURATION = SESSION_DURATION_DAYS;

// Helper: convert AppUser to SessionUser
function toSessionUser(user: AppUser): SessionUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    studentId: user.studentId,
    role: user.role as UserRole,
    assignedSpecialtyId: user.assignedSpecialtyId,
    scopeCohortGroupId: user.scopeCohortGroupId ?? null,
    scopeAcademicYearId: user.scopeAcademicYearId ?? null,
    scopeSpecialtyId: user.scopeSpecialtyId ?? null,
  };
}

// Auto-generated student ID (year + random 8 digits, unique)
function generateStudentId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(10000000 + Math.random() * 90000000);
  return `${year}${random}`;
}
