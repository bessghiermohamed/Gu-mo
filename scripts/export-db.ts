/**
 * scripts/export-db.ts — manual, read-only Supabase backup (Talib)
 *
 * Exports every table in the `public` schema to a single timestamped
 * JSON file under ./backups/.
 *
 * Properties:
 *   - SELECT-only against the database (GET requests via PostgREST).
 *     Safe to run repeatedly; nothing is ever written, updated, or
 *     deleted on the server. Each run creates a NEW local file.
 *   - Uses only environment variables already documented in
 *     .env.example: NEXT_PUBLIC_SUPABASE_URL and
 *     SUPABASE_SERVICE_ROLE_KEY (secret — terminal/server side only,
 *     never exposed to the browser).
 *   - Paginates large tables (ordered by primary key, 1000 rows per
 *     page) so nothing is truncated.
 *   - Not wired into any cron, webhook, CI step, or API route.
 *     Run it by hand from the repo root:
 *
 *       bun run scripts/export-db.ts
 *
 *     (or, if bun is not installed: npx -y tsx scripts/export-db.ts —
 *     the script loads .env.local / .env itself in that case.)
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_SIZE = 1000;

// Tables that live in the `storage` schema but can show up in the
// PostgREST OpenAPI listing. Never export those (public schema only).
const SKIP_TABLES = new Set(["objects", "buckets", "blobs"]);

// Fallback list: the 29 public tables defined by the repo's SQL files
// (download/supabase_schema.sql, supabase_update_schema.sql,
// supabase_telegram.sql, supabase_round2_fixes.sql,
// supabase_notifications.sql). Only used if the OpenAPI discovery
// request fails. Keep in sync when the schema evolves.
const KNOWN_PUBLIC_TABLES = [
  "academic_calendar_events",
  "academic_tracks",
  "academic_years",
  "announcements",
  "app_notifications",
  "app_users",
  "assignments",
  "attendance_records",
  "cached_course_materials",
  "class_polls",
  "cohort_groups",
  "content_upload_logs",
  "device_sessions",
  "exams",
  "institutions",
  "join_requests",
  "lectures",
  "library_references",
  "module_courses",
  "notification_read_states",
  "schedule_items",
  "specialties",
  "student_grades",
  "student_issue_reports",
  "student_notes",
  "student_profiles",
  "study_groups",
  "telegram_items",
  "telegram_sources",
];

// ---------------------------------------------------------------------------
// 1. Environment — real env vars always win; no new variables introduced.
//    (bun auto-loads .env/.env.local; the manual loader covers other runners)
// ---------------------------------------------------------------------------
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  const raw = readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (value.length >= 2 && value[0] === value[value.length - 1] && /["']/.test(value[0])) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = value;
    }
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "[export-db] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "            Copy .env.example to .env.local, fill in real values, and re-run."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// 2. Table discovery — PostgREST OpenAPI root (needs a secret key, which we
//    have). Primary-key presence separates real tables from views.
// ---------------------------------------------------------------------------
interface Discovery {
  tables: string[];
  pks: Map<string, string[]>;
  dynamic: boolean;
}

async function discoverTables(): Promise<Discovery> {
  const pks = new Map<string, string[]>();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const spec = (await res.json()) as {
      definitions?: Record<string, { primaryKey?: string[] }>;
    };
    const tables = Object.keys(spec.definitions ?? {})
      .filter((name) => !SKIP_TABLES.has(name))
      .filter((name) => Array.isArray(spec.definitions?.[name]?.primaryKey));
    if (tables.length === 0) throw new Error("no table definitions found in spec");
    for (const t of tables) pks.set(t, spec.definitions![t]!.primaryKey ?? []);
    return { tables: tables.sort(), pks, dynamic: true };
  } catch (e) {
    console.warn(
      `[export-db] OpenAPI discovery failed (${(e as Error).message}); using the static table list.`
    );
    for (const t of KNOWN_PUBLIC_TABLES) pks.set(t, ["id"]);
    return { tables: [...KNOWN_PUBLIC_TABLES], pks, dynamic: false };
  }
}

// ---------------------------------------------------------------------------
// 3. Export one table — ordered pagination, exact count, nothing truncated.
// ---------------------------------------------------------------------------
async function exportTable(
  name: string,
  pk: string[]
): Promise<{ rows: unknown[]; count: number | null }> {
  const rows: unknown[] = [];
  let totalCount: number | null = null;
  let from = 0;
  for (;;) {
    let query = supabase.from(name).select("*", { count: "exact" });
    for (const col of pk) {
      query = query.order(col, { ascending: true });
    }
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (count != null) totalCount = count;
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
    if (data.length < PAGE_SIZE) break;
    if (totalCount != null && rows.length >= totalCount) break;
  }
  return { rows, count: totalCount };
}

// ---------------------------------------------------------------------------
// 4. Run
// ---------------------------------------------------------------------------
function toFileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main(): Promise<void> {
  const startedAt = new Date();
  mkdirSync(join(process.cwd(), "backups"), { recursive: true });

  const { tables, pks, dynamic } = await discoverTables();

  // Visibility first: show exactly what is about to be exported.
  console.log(`[export-db] ${tables.length} table(s) to export (discovery: ${dynamic ? "OpenAPI" : "static list"}):`);
  for (const t of tables) {
    const known = KNOWN_PUBLIC_TABLES.includes(t);
    console.log(`  - ${t}${known ? "" : "   <-- not in the repo's SQL files; verify it is public-schema"}`);
  }

  const tablesJson: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  const failures: Record<string, string> = {};

  for (const t of tables) {
    try {
      const { rows, count } = await exportTable(t, pks.get(t) ?? []);
      tablesJson[t] = rows;
      rowCounts[t] = count ?? rows.length;
      console.log(`[export-db]   ${t}: ${rowCounts[t]} rows`);
    } catch (e) {
      failures[t] = (e as Error).message;
      tablesJson[t] = [];
      console.warn(`[export-db]   ${t}: FAILED — ${(e as Error).message}`);
    }
  }

  // New timestamped file every run — never overwrite (guard for same-second runs).
  let file = join(process.cwd(), "backups", `talib-db-export-${toFileStamp(startedAt)}.json`);
  let n = 2;
  while (existsSync(file)) {
    file = join(process.cwd(), "backups", `talib-db-export-${toFileStamp(startedAt)}-${n++}.json`);
  }
  writeFileSync(
    file,
    JSON.stringify(
      {
        meta: {
          exportedAt: startedAt.toISOString(),
          supabaseUrl: SUPABASE_URL,
          discoveryMode: dynamic ? "openapi" : "static-fallback",
          tableCount: tables.length,
          rowCounts,
          failures,
        },
        tables: tablesJson,
      },
      null,
      2
    ),
    "utf8"
  );

  const mb = statSync(file).size / 1024 / 1024;
  console.log(`[export-db] done -> ${file} (${mb.toFixed(2)} MB)`);

  if (Object.keys(failures).length > 0) {
    console.error(
      `[export-db] ${Object.keys(failures).length} table(s) failed — see meta.failures in the JSON file.`
    );
    process.exit(2);
  }
}

main().catch((e: unknown) => {
  console.error(`[export-db] fatal: ${(e as Error).message}`);
  process.exit(1);
});
