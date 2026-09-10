/**
 * Complete onboarding - save user profile & link to cohort
 * Uses Supabase on Vercel, Prisma locally.
 *
 * fix أ.4: now saves scope_institution_id + scope_track_id so content can be
 *          filtered by the student's full academic scope.
 * fix (profile bug): student_profiles row is now PER USER (id = user id)
 *          instead of the shared singleton row id=1 that every user overwrote.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
    }

    const body = await req.json();
    const {
      fullName,
      email,
      institutionId,
      specialtyId,
      academicYearId,
      cohortId,
      groupId,
      trackId,
      mode,
    } = body;
    // r76: the group/cohort decision travels EXPLICITLY in change mode —
    // keys PRESENT (possibly null = clear) mean a decision was made; keys
    // ABSENT (old client / initial mode) keep the round-9 preserve rule.
    const hasScopeDecision = "cohortId" in body || "groupId" in body;

    if (!fullName?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "الاسم والبريد مطلوبان" },
        { status: 400 }
      );
    }

    // round 37: تغيير المسار الأكاديمي is OWNER-only. The حسابي entry runs
    // the wizard with mode="change"; every other role gets 403 even from a
    // tampered client. Initial onboarding (mode="initial"/absent) is
    // unaffected — a fresh device re-runs it freely.
    if (mode === "change" && user.role !== "OWNER") {
      return NextResponse.json(
        { error: "تغيير المسار الأكاديمي متاح للمالك فقط" },
        { status: 403 }
      );
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();

      // r76 — change mode (OWNER): validate the destination cohort against
      // the NEW path (same compatibility rule as direct assignment §2) and
      // derive its parent study group automatically — الفوج داخل المجموعة.
      let explicitScopeGroupId: number | null = null;
      let explicitScopeCohortId: number | null = null;
      let explicitGroupNumber = "";
      let explicitScope = false;
      if (mode === "change" && hasScopeDecision) {
        explicitScope = true;
        if (cohortId) {
          const { data: destCohort } = await supabase
            .from("cohort_groups")
            .select("id, group_id, group_name, specialty_id, academic_year_id, track_id")
            .eq("id", cohortId)
            .maybeSingle();
          if (!destCohort) {
            return NextResponse.json({ error: "الفوج المختار غير موجود" }, { status: 404 });
          }
          if (groupId && Number(destCohort.group_id) !== Number(groupId)) {
            return NextResponse.json(
              { error: "الفوج المختار لا يتبع المجموعة المحددة" },
              { status: 409 }
            );
          }
          const sameSpecialty = !specialtyId || Number(destCohort.specialty_id) === Number(specialtyId);
          const sameYear = !academicYearId || Number(destCohort.academic_year_id) === Number(academicYearId);
          const sameTrack =
            !trackId || destCohort.track_id == null || Number(destCohort.track_id) === Number(trackId);
          if (!sameSpecialty || !sameYear || !sameTrack) {
            return NextResponse.json(
              { error: "هذا الفوج لا يطابق المسار الأكاديمي الجديد (التخصص/السنة/الملمح) — اختر فوجاً من المسار الجديد" },
              { status: 409 }
            );
          }
          explicitScopeGroupId = Number(destCohort.group_id); // المجموعة تُشتق تلقائياً من الفوج
          explicitScopeCohortId = Number(destCohort.id);
          explicitGroupNumber = String(destCohort.group_name ?? "");
        }
      }

      // Fetch related records for denormalized fields
      const [
        { data: institution },
        { data: specialty },
        { data: year },
        { data: cohort },
        { data: track },
      ] = await Promise.all([
        institutionId
          ? supabase.from("institutions").select("name_ar").eq("id", institutionId).maybeSingle()
          : Promise.resolve({ data: null }),
        specialtyId
          ? supabase.from("specialties").select("name_ar, faculty").eq("id", specialtyId).maybeSingle()
          : Promise.resolve({ data: null }),
        academicYearId
          ? supabase.from("academic_years").select("year_name").eq("id", academicYearId).maybeSingle()
          : Promise.resolve({ data: null }),
        cohortId
          ? supabase.from("cohort_groups").select("group_name").eq("id", cohortId).maybeSingle()
          : Promise.resolve({ data: null }),
        trackId
          ? supabase.from("academic_tracks").select("track_name_ar, code").eq("id", trackId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Update app_users — fix أ.4: persist the FULL academic scope
      // round 9 (spec §2/§5): re-running onboarding (new device, cleared
      // localStorage) must NOT silently drop an existing sub-group
      // membership — the join-request assignment survives; cohort
      // selection isn't part of onboarding anymore.
      // r76: change mode overrides this with the owner's EXPLICIT decision
      // (a validated pick, or null/null to clear a membership that no
      // longer matches the new path).
      const userUpdate: Record<string, unknown> = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        assigned_specialty_id: specialtyId ?? user.assignedSpecialtyId,
        scope_institution_id: institutionId ?? null,
        scope_specialty_id: specialtyId ?? null,
        scope_academic_year_id: academicYearId ?? null,
        scope_track_id: trackId ?? null,
        specialty_name: specialty?.name_ar ?? "",
        year_name: year?.year_name ?? "",
      };
      if (explicitScope) {
        userUpdate.scope_group_id = explicitScopeGroupId;
        userUpdate.scope_cohort_group_id = explicitScopeCohortId;
        userUpdate.group_number = explicitGroupNumber;
      } else {
        userUpdate.scope_cohort_group_id = cohortId ?? user.scopeCohortGroupId ?? null;
        // keep the existing group label when membership is preserved
        userUpdate.group_number = cohort ? String(cohort.group_name) : (user.scopeCohortGroupId != null ? undefined : "");
      }
      const { error: userError } = await supabase
        .from("app_users")
        .update(userUpdate)
        .eq("id", user.id);

      if (userError) {
        return NextResponse.json(
          { error: `فشل تحديث المستخدم: ${userError.message}` },
          { status: 500 }
        );
      }

      // Upsert student_profiles — PER USER (id = user.id), not the shared row id=1
      const { error: profileError } = await supabase
        .from("student_profiles")
        .upsert({
          id: user.id,
          user_id: String(user.id),
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          institution: institution?.name_ar ?? "",
          university: institution?.name_ar ?? "",
          faculty: specialty?.faculty ?? "",
          specialty_name: specialty?.name_ar ?? "",
          profile_track: track?.track_name_ar ?? "",
          track_id: trackId ?? null,
          selected_specialty_id: specialtyId ?? 1,
          selected_year_id: academicYearId ?? 1,
          selected_cohort_id: explicitScope ? explicitScopeCohortId : (cohortId ?? user.scopeCohortGroupId ?? null),
          academic_year_name: year?.year_name ?? "",
          group_number: explicitScope ? explicitGroupNumber : (cohort?.group_name ?? ""),
          is_configured: true,
        });

      if (profileError) {
        console.error("Profile upsert error:", profileError);
      }

      return NextResponse.json({ ok: true });
    }

    // Local Prisma fallback
    const institution = institutionId
      ? await db.institution.findUnique({ where: { id: institutionId } })
      : null;
    const specialty = specialtyId
      ? await db.specialty.findUnique({ where: { id: specialtyId } })
      : null;
    const year = academicYearId
      ? await db.academicYear.findUnique({ where: { id: academicYearId } })
      : null;
    const cohort = cohortId
      ? await db.cohortGroup.findUnique({ where: { id: cohortId } })
      : null;
    const track = trackId
      ? await db.academicTrack.findUnique({ where: { id: trackId } })
      : null;

    // r76 — change mode (OWNER): explicit group/cohort decision, validated
    // against the NEW path (mirror of the Supabase branch above).
    let explicitScopeGroupId: number | null = null;
    let explicitScopeCohortId: number | null = null;
    let explicitGroupNumber = "";
    let explicitScope = false;
    if (mode === "change" && hasScopeDecision) {
      explicitScope = true;
      if (cohortId) {
        const destCohort = await db.cohortGroup.findUnique({ where: { id: Number(cohortId) } });
        if (!destCohort) {
          return NextResponse.json({ error: "الفوج المختار غير موجود" }, { status: 404 });
        }
        if (groupId && Number(destCohort.groupId) !== Number(groupId)) {
          return NextResponse.json(
            { error: "الفوج المختار لا يتبع المجموعة المحددة" },
            { status: 409 }
          );
        }
        const sameSpecialty = !specialtyId || Number(destCohort.specialtyId) === Number(specialtyId);
        const sameYear = !academicYearId || Number(destCohort.academicYearId) === Number(academicYearId);
        const sameTrack =
          !trackId || destCohort.trackId == null || Number(destCohort.trackId) === Number(trackId);
        if (!sameSpecialty || !sameYear || !sameTrack) {
          return NextResponse.json(
            { error: "هذا الفوج لا يطابق المسار الأكاديمي الجديد (التخصص/السنة/الملمح) — اختر فوجاً من المسار الجديد" },
            { status: 409 }
          );
        }
        explicitScopeGroupId = Number(destCohort.groupId);
        explicitScopeCohortId = Number(destCohort.id);
        explicitGroupNumber = String(destCohort.groupName ?? "");
      }
    }

    const userData: Record<string, unknown> = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      assignedSpecialtyId: specialtyId ?? user.assignedSpecialtyId,
      scopeInstitutionId: institutionId ?? null,
      scopeSpecialtyId: specialtyId ?? null,
      scopeAcademicYearId: academicYearId ?? null,
      scopeTrackId: trackId ?? null,
      specialtyName: specialty?.nameAr ?? "",
      yearName: year?.yearName ?? "",
    };
    if (explicitScope) {
      userData.scopeGroupId = explicitScopeGroupId;
      userData.scopeCohortGroupId = explicitScopeCohortId;
      userData.groupNumber = explicitGroupNumber;
    } else {
      // round 9: re-onboarding preserves an existing membership
      userData.scopeCohortGroupId = cohortId ?? user.scopeCohortGroupId ?? null;
      userData.groupNumber = cohort ? cohort.groupName : (user.scopeCohortGroupId != null ? undefined : "");
    }

    await db.appUser.update({
      where: { id: user.id },
      data: userData as never,
    });

    // PER-USER profile (id = user.id)
    const profileData = {
      userId: String(user.id),
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      institution: institution?.nameAr ?? "",
      university: institution?.nameAr ?? "",
      faculty: specialty?.faculty ?? "",
      specialtyName: specialty?.nameAr ?? "",
      profileTrack: track?.trackNameAr ?? "",
      trackId: trackId ?? null,
      selectedSpecialtyId: specialtyId ?? 1,
      selectedYearId: academicYearId ?? 1,
      selectedCohortId: explicitScope ? explicitScopeCohortId : (cohortId ?? user.scopeCohortGroupId ?? null),
      academicYearName: year?.yearName ?? "",
      groupNumber: explicitScope ? explicitGroupNumber : (cohort?.groupName ?? ""),
      isConfigured: true,
    };

    await db.studentProfile.upsert({
      where: { id: user.id },
      create: { id: user.id, ...profileData },
      update: profileData,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
