/**
 * API-level E2E verification of round 10 — System Review §3/§4/§16
 * (2026-09-02). Requires the dev server on localhost:3000 and a freshly
 * seeded local database (bun run db:seed).
 *
 * Verifies the COMPLETE join-request lifecycle + notification channel:
 *
 *   §3  Student → Request → Pending → scoped reviewer → Approve/Reject
 *       + outcome notification to the student + membership assignment
 *       + student CANCEL of own pending request + re-request after cancel
 *       + supervisor scope enforcement on approve (403 out-of-scope)
 *   §4  join_new notification routed ONLY to supervisors whose scope
 *       contains the target cohort (owner + in-scope rep, NOT out-of-scope
 *       rep); unread badge counts; mark-all-read; report_new to supervisors
 *   §16 /api/admin/stats — attention counts (pending requests, open
 *       reports) + caller-scoped info counts; 403 for students.
 *
 * Run: bun run scripts/verify-review3-4-16.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const TAG = `r10-${Date.now()}`;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = "") {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`;
  console.log(line);
  if (ok) pass++;
  else fail++;
}

interface ApiResult {
  status: number;
  json: Record<string, unknown>;
  setCookie: string[];
}

async function api(
  method: string,
  path: string,
  cookie?: string,
  body?: Record<string, unknown>
): Promise<ApiResult> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie: string[] =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* no body */
  }
  return { status: res.status, json, setCookie };
}

function sessionCookie(r: ApiResult): string {
  const raw = r.setCookie.find((c) => c.startsWith("talib_session=")) ?? "";
  return raw.split(";")[0];
}

interface Notif {
  id: number;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
}

async function notificationsOf(cookie: string): Promise<{ items: Notif[]; unread: number }> {
  const r = await api("GET", "/api/notifications", cookie);
  return {
    items: (r.json.notifications ?? []) as unknown as Notif[],
    unread: Number(r.json.unreadCount ?? 0),
  };
}

async function main() {
  console.log(`\n=== Round 10 verification (tag: ${TAG}) ===\n`);

  // ---------- setup: pick cohorts, create users ----------
  const cohorts = await db.cohortGroup.findMany({
    where: { specialtyId: 1 },
    orderBy: { id: "asc" },
  });
  const cohortA = cohorts[0];
  const cohortB = cohorts.find((c) => c.groupId !== cohortA.groupId);
  if (!cohortA || !cohortB) throw new Error("seed must provide ≥2 cohorts in different groups");
  const spec = await db.specialty.findUnique({ where: { id: cohortA.specialtyId } });
  if (!spec) throw new Error("specialty #1 missing — re-seed");

  // 1st signup on a fresh DB becomes OWNER
  const owner = await api("POST", "/api/auth/signup", undefined, {
    fullName: `مالك-${TAG}`,
    email: `owner-${TAG}@test.talib`,
  });
  check("setup: first signup becomes session holder", owner.status === 200);
  const ownerCookie = sessionCookie(owner);

  const mkUser = async (name: string) => {
    // signUpUser lowercases the email server-side — mirror that here so
    // prisma lookups by email always match.
    const email = `${name.replace(/[^\w-]/g, "")}-${TAG}@test.talib`.toLowerCase();
    const r = await api("POST", "/api/auth/signup", undefined, {
      fullName: name,
      email,
    });
    return { cookie: sessionCookie(r), email };
  };

  const student1 = await mkUser(`student1${TAG}`);
  const student2 = await mkUser(`student2${TAG}`);
  const repA = await mkUser(`repA${TAG}`); // scoped to cohortA → in scope
  const repB = await mkUser(`repB${TAG}`); // scoped to cohortB → out of scope

  // give the students academic scope matching cohortA; promote the reps
  // NOTE: raw Prisma rows name the field academicYearId (scope.ts maps it
  // to yearId internally) — using .yearId here would be undefined and
  // Prisma would silently skip the update.
  const yearId = cohortA.academicYearId;
  await db.appUser.update({
    where: { email: student1.email },
    data: {
      assignedSpecialtyId: cohortA.specialtyId,
      scopeInstitutionId: spec.institutionId,
      scopeAcademicYearId: yearId,
      scopeTrackId: cohortA.trackId ?? null,
    },
  });
  await db.appUser.update({
    where: { email: student2.email },
    data: {
      assignedSpecialtyId: cohortA.specialtyId,
      scopeInstitutionId: spec.institutionId,
      scopeAcademicYearId: yearId,
      scopeTrackId: cohortA.trackId ?? null,
    },
  });
  await db.appUser.update({
    where: { email: repA.email },
    data: { role: "REPRESENTATIVE", scopeCohortGroupId: cohortA.id },
  });
  await db.appUser.update({
    where: { email: repB.email },
    data: { role: "REPRESENTATIVE", scopeCohortGroupId: cohortB.id },
  });

  // ---------- §3: submit → pending ----------
  const submit = await api("POST", "/api/join-requests", student1.cookie, {
    cohortId: cohortA.id,
    groupId: cohortA.groupId,
    message: "اختبار الجولة 10",
  });
  check("§3 student submits join request → 200", submit.status === 200);
  const requestId = Number(
    ((submit.json.request ?? {}) as Record<string, unknown>).id ?? 0
  );

  // ---------- §4: scoped notification routing ----------
  const ownerNotifs1 = await notificationsOf(ownerCookie);
  const repANotifs = await notificationsOf(repA.cookie);
  const repBNotifs = await notificationsOf(repB.cookie);
  check(
    "§4 OWNER received join_new notification",
    ownerNotifs1.items.some((n) => n.type === "join_new") && ownerNotifs1.unread >= 1,
    `unread=${ownerNotifs1.unread}`
  );
  check(
    "§4 in-scope REPRESENTATIVE (cohortA) received join_new",
    repANotifs.items.some((n) => n.type === "join_new"),
    `unread=${repANotifs.unread}`
  );
  check(
    "§4 out-of-scope REPRESENTATIVE (cohortB) did NOT receive join_new",
    !repBNotifs.items.some((n) => n.type === "join_new")
  );

  // ---------- §3: reject path (student2's request, rejected by owner) ----------
  const submit2 = await api("POST", "/api/join-requests", student2.cookie, {
    cohortId: cohortA.id,
    groupId: cohortA.groupId,
  });
  check("§3 second student submits → 200", submit2.status === 200);
  const requestId2 = Number(
    ((submit2.json.request ?? {}) as Record<string, unknown>).id ?? 0
  );

  // out-of-scope reviewer must be blocked (403)
  const repbApprove = await api("POST", `/api/join-requests/${requestId2}/approve`, repB.cookie, {});
  check("§3 out-of-scope reviewer cannot approve → 403", repbApprove.status === 403);

  // owner rejects with a note → student2 notified
  const reject = await api("POST", `/api/join-requests/${requestId2}/reject`, ownerCookie, {
    note: "الفوج مكتمل",
  });
  check("§3 OWNER rejects request2 → 200", reject.status === 200);
  const s2notifs = await notificationsOf(student2.cookie);
  const s2rej = s2notifs.items.find((n) => n.type === "join_rejected");
  check(
    "§3 rejected student notified (join_rejected with note)",
    s2rej != null && s2rej.body.includes("الفوج مكتمل") && s2notifs.unread >= 1,
    `unread=${s2notifs.unread}`
  );

  // rejected student may request AGAIN (same cohort, no pending duplicate)
  const submit2b = await api("POST", "/api/join-requests", student2.cookie, {
    cohortId: cohortA.id,
    groupId: cohortA.groupId,
  });
  check("§3 rejected student can re-request → 200", submit2b.status === 200);
  const requestId2b = Number(
    ((submit2b.json.request ?? {}) as Record<string, unknown>).id ?? 0
  );

  // ---------- §3: cancel (own pending only) ----------
  const ownerCancelsOthers = await api("POST", `/api/join-requests/${requestId2b}/cancel`, ownerCookie);
  check("§3 non-requester cannot cancel → 403", ownerCancelsOthers.status === 403);
  const cancel2b = await api("POST", `/api/join-requests/${requestId2b}/cancel`, student2.cookie);
  check("§3 student cancels own pending request → 200", cancel2b.status === 200);
  const mine = await api("GET", "/api/join-requests/mine", student2.cookie);
  const mineReqs = (mine.json.requests ?? []) as Array<{ status: string }>;
  check(
    "§3 cancelled request visible in /mine with status=cancelled",
    mineReqs.some((r) => r.status === "cancelled")
  );

  // ---------- §3: approve path (student1) ----------
  const approve = await api("POST", `/api/join-requests/${requestId}/approve`, ownerCookie, {});
  check("§3 OWNER approves request1 → 200", approve.status === 200);
  const s1row = await db.appUser.findUnique({ where: { email: student1.email } });
  check(
    "§3 approval assigns membership (scopeCohortGroupId)",
    s1row?.scopeCohortGroupId === cohortA.id
  );
  const s1notifs = await notificationsOf(student1.cookie);
  const s1app = s1notifs.items.find((n) => n.type === "join_approved");
  check(
    "§3 approved student notified (join_approved)",
    s1app != null && s1notifs.unread >= 1,
    `unread=${s1notifs.unread}`
  );

  // assigned student can no longer submit new requests (conflict rule §3)
  const submitAgain = await api("POST", "/api/join-requests", student1.cookie, {
    cohortId: cohortB.id,
  });
  check("§3 already-assigned student cannot request again → 409", submitAgain.status === 409);

  // ---------- §4: mark-all-read ----------
  const markAll = await api("POST", "/api/notifications/read", student1.cookie, { all: true });
  check("§4 mark-all-read → 200", markAll.status === 200);
  const s1after = await notificationsOf(student1.cookie);
  check("§4 unread count resets to 0", s1after.unread === 0, `unread=${s1after.unread}`);

  // ---------- §4/§14: report notifications ----------
  const report = await api("POST", "/api/issues", student1.cookie, {
    itemType: "محاضرة",
    itemTitle: `مشكلة-${TAG}`,
    description: "وصف تجريبي",
  });
  check("§14 student files a report → 200", report.status === 200);
  const ownerNotifs2 = await notificationsOf(ownerCookie);
  check(
    "§4 supervisor receives report_new notification",
    ownerNotifs2.items.some((n) => n.type === "report_new")
  );

  // ---------- §16: admin stats ----------
  const stats = await api("GET", "/api/admin/stats", ownerCookie);
  const s = stats.json as Record<string, number>;
  check("§16 stats endpoint → 200", stats.status === 200);
  check(
    "§16 pending join requests counted (student2 has none pending after cancel → 0)",
    Number(s.pendingJoinRequests ?? -1) === 0,
    `pending=${s.pendingJoinRequests}`
  );
  check("§16 open reports counted = 1", Number(s.openReports ?? -1) === 1, `open=${s.openReports}`);
  check("§16 scoped student count = 2", Number(s.students ?? -1) === 2, `students=${s.students}`);
  const statsDenied = await api("GET", "/api/admin/stats", student1.cookie);
  check("§16 student cannot access stats → 403", statsDenied.status === 403);

  // ---------- cleanup ----------
  await db.appUser.deleteMany({ where: { email: { contains: TAG } } }); // cascades requests + notifications
  await db.studentIssueReport.deleteMany({ where: { itemTitle: `مشكلة-${TAG}` } });
  const leftover = await db.appNotification.count({
    where: { user: { email: { contains: TAG } } },
  });
  check("cleanup: test users + notifications removed", leftover === 0);

  console.log(`\n${fail === 0 ? "✅" : "❌"} Round 10 (§3/§4/§16): ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
