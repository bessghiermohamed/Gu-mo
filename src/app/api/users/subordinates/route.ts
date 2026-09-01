import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import {
  loadScopeContext,
  scopeContains,
  scopeLabel,
  type ScopedUserLike,
} from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Subordinate supervisors tree (spec §10/§11).
 *
 * A supervisor's subordinates = supervisory users whose scope is nested
 * inside theirs and whom they outrank (scope-derived subordination — no
 * extra column needed, works identically on Prisma and Supabase).
 *
 * The tree is nested by scope containment: every direct child of a node
 * is a supervisor not contained in any other subordinate of that node.
 * The response includes each node's human-readable scope label so the UI
 * can render: name + current scope + Edit Scope + Remove (§10).
 */
interface SupervisorNode {
  id: number;
  fullName: string;
  email: string;
  role: "REPRESENTATIVE" | "SPECIALTY_ADMIN" | "OWNER";
  scopeLabel: string;
  scopeCohortGroupId: number | null;
  scopeGroupId: number | null;
  scopeAcademicYearId: number | null;
  scopeSpecialtyId: number | null;
  scopeInstitutionId: number | null;
  assignedSpecialtyId: number;
  subordinates: SupervisorNode[];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const ctx = await loadScopeContext();

    // candidate supervisors = all REPRESENTATIVE / SPECIALTY_ADMIN rows
    let candidates: ScopedUserLike[] = [];
    let byId = new Map<number, { fullName: string; email: string; role: ScopedUserLike["role"] }>();

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("id, full_name, email, role, assigned_specialty_id, scope_institution_id, scope_specialty_id, scope_academic_year_id, scope_group_id, scope_cohort_group_id")
        .in("role", ["REPRESENTATIVE", "SPECIALTY_ADMIN"])
        .order("full_name", { ascending: true });
      if (error) return NextResponse.json({ tree: [], subordinatesCount: 0 });
      candidates = (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        role: String(r.role) as ScopedUserLike["role"],
        assignedSpecialtyId: Number(r.assigned_specialty_id ?? 1),
        scopeInstitutionId: r.scope_institution_id != null ? Number(r.scope_institution_id) : null,
        scopeSpecialtyId: r.scope_specialty_id != null ? Number(r.scope_specialty_id) : null,
        scopeAcademicYearId: r.scope_academic_year_id != null ? Number(r.scope_academic_year_id) : null,
        scopeGroupId: r.scope_group_id != null ? Number(r.scope_group_id) : null,
        scopeCohortGroupId: r.scope_cohort_group_id != null ? Number(r.scope_cohort_group_id) : null,
      }));
      byId = new Map(
        (data ?? []).map((r: Record<string, unknown>) => [
          Number(r.id),
          { fullName: String(r.full_name ?? ""), email: String(r.email ?? ""), role: String(r.role) as ScopedUserLike["role"] },
        ])
      );
    } else {
      const rows = await db.appUser.findMany({
        where: { role: { in: ["REPRESENTATIVE", "SPECIALTY_ADMIN"] } } as never,
        orderBy: { fullName: "asc" },
      });
      candidates = rows.map((r) => ({
        id: r.id,
        role: r.role as ScopedUserLike["role"],
        assignedSpecialtyId: r.assignedSpecialtyId,
        scopeInstitutionId: r.scopeInstitutionId ?? null,
        scopeSpecialtyId: r.scopeSpecialtyId ?? null,
        scopeAcademicYearId: r.scopeAcademicYearId ?? null,
        scopeGroupId: r.scopeGroupId ?? null,
        scopeCohortGroupId: r.scopeCohortGroupId ?? null,
      }));
      byId = new Map(rows.map((r) => [r.id, { fullName: r.fullName, email: r.email, role: r.role as ScopedUserLike["role"] }]));
    }

    // subordinates of the caller (nested by scope containment)
    function buildNode(s: ScopedUserLike): SupervisorNode {
      const direct = candidates.filter(
        (c) => scopeContains(s, c, ctx) &&
          !candidates.some((m) => m.id !== c.id && m.id !== s.id && scopeContains(m, c, ctx) && scopeContains(s, m, ctx))
      );
      const meta = byId.get(s.id)!;
      return {
        id: s.id,
        fullName: meta.fullName,
        email: meta.email,
        role: s.role as SupervisorNode["role"],
        scopeLabel: scopeLabel(s, ctx),
        scopeCohortGroupId: s.scopeCohortGroupId ?? null,
        scopeGroupId: s.scopeGroupId ?? null,
        scopeAcademicYearId: s.scopeAcademicYearId ?? null,
        scopeSpecialtyId: s.scopeSpecialtyId ?? null,
        scopeInstitutionId: s.scopeInstitutionId ?? null,
        assignedSpecialtyId: s.assignedSpecialtyId,
        subordinates: direct.map(buildNode),
      };
    }

    // direct children of the caller
    const directChildren = candidates.filter((c) =>
      scopeContains(user, c, ctx) &&
      !candidates.some((m) => m.id !== c.id && m.id !== user.id && scopeContains(m, c, ctx) && scopeContains(user, m, ctx))
    );
    const tree = directChildren.map(buildNode);

    // total count (recursive) for the tab badge
    function countNodes(nodes: SupervisorNode[]): number {
      return nodes.reduce((n, node) => n + 1 + countNodes(node.subordinates), 0);
    }

    return NextResponse.json({ tree, subordinatesCount: countNodes(tree) });
  } catch (e) {
    return NextResponse.json({ tree: [], subordinatesCount: 0 });
  }
}
