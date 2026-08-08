import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

type Candidate = {
  id: string;
  username: string;
  kyc_status: string | null;
  kyc_verified: number | null;
  kyc_provider: string | null;
  kyc_verified_at: string | null;
  kyc_submitted_at: string | null;
  kyc_last_webhook_at: string | null;
  kyc_manual_override: number | null;
  kyc_manual_override_reason: string | null;
  veriff_session_id: string | null;
  veriff_decision: string | null;
  veriff_reason: string | null;
  telegram_username: string | null;
  role: string | null;
};

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeFileUrl(rawUrl: string) {
  if (!rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const normalizedPath = rawUrl.slice("file:".length).replace(/\\/g, "/");
  if (normalizedPath.startsWith("/") || /^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:${normalizedPath}`;
  }

  return `file:${path.resolve(process.cwd(), normalizedPath).replace(/\\/g, "/")}`;
}

function getDatabaseConfig() {
  loadDotEnvLocal();

  const url = process.env.DATABASE_URL?.trim() || process.env.LOCAL_DATABASE_URL?.trim();
  if (!url) {
    throw new Error("Missing DATABASE_URL or LOCAL_DATABASE_URL.");
  }

  return {
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
    url: normalizeFileUrl(url),
  };
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hasTrustedApproval(row: Candidate) {
  const status = normalize(row.kyc_status);
  const provider = normalize(row.kyc_provider);
  const decision = normalize(row.veriff_decision);
  const reason = normalize(row.veriff_reason);
  const manualReason = normalize(row.kyc_manual_override_reason);

  if (
    status === "manual_approved" &&
    Number(row.kyc_manual_override ?? 0) === 1 &&
    manualReason.length > 0
  ) {
    return true;
  }

  if (
    status === "approved" &&
    provider === "veriff" &&
    ["approved", "positive", "verified", "9001"].includes(decision) &&
    Boolean(row.veriff_session_id) &&
    Boolean(row.kyc_verified_at) &&
    Boolean(row.kyc_last_webhook_at) &&
    !reason.includes("legacy verification flag") &&
    !reason.includes("confirmed by veriff dashboard")
  ) {
    return true;
  }

  return false;
}

function getResetStatus(row: Candidate) {
  if (!row.veriff_session_id) {
    return "not_started";
  }

  return row.kyc_submitted_at ? "review" : "session_created";
}

const shouldApply = process.argv.includes("--apply");
const timestamp = new Date().toISOString();
const db = createClient(getDatabaseConfig());

const result = await db.execute({
  sql: `select users.id, users.username, users.kyc_status, users.kyc_verified,
          users.kyc_provider, users.kyc_verified_at, users.kyc_submitted_at,
          users.kyc_last_webhook_at, users.kyc_manual_override,
          users.kyc_manual_override_reason, users.veriff_session_id,
          users.veriff_decision, users.veriff_reason,
          profiles.telegram_username, profiles.role
        from users
        left join profiles on profiles.user_id = users.id
        where coalesce(users.kyc_verified, 0) = 1
          or users.kyc_status in ('approved', 'manual_approved')`,
  args: [],
});

const rows = result.rows as unknown as Candidate[];
const keep = rows.filter(hasTrustedApproval);
const revert = rows.filter((row) => !hasTrustedApproval(row));

console.log(`[repair-false-kyc-approvals] checked=${rows.length}`);
console.log(`[repair-false-kyc-approvals] trusted=${keep.length}`);
console.log(`[repair-false-kyc-approvals] suspicious=${revert.length}`);

for (const row of revert) {
  console.log(
    `- ${row.id} ${row.username}: status=${row.kyc_status ?? "null"}, verified=${row.kyc_verified ?? 0}, provider=${row.kyc_provider ?? "null"}, decision=${row.veriff_decision ?? "null"} -> ${getResetStatus(row)}`,
  );
}

if (!shouldApply) {
  console.log("[repair-false-kyc-approvals] dry-run only. Re-run with --apply to write changes.");
  process.exit(0);
}

for (const row of revert) {
  const resetStatus = getResetStatus(row);

  await db.batch(
    [
      {
        sql: `update users
              set kyc_status = ?,
                  kyc_verified = 0,
                  kyc_verified_at = null,
                  veriff_decision = null,
                  veriff_reason = coalesce(veriff_reason, 'Reset by KYC approval repair. Awaiting trusted Veriff decision webhook or manual admin review.'),
                  updated_at = ?
              where id = ?`,
        args: [resetStatus, timestamp, row.id],
      },
      {
        sql: `insert into security_audit_events (
                id, event_type, user_id, username, telegram_username, role,
                ip_address, country, user_agent, language, route, created_at
              ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          "kyc_false_auto_approval_reverted",
          row.id,
          row.username,
          row.telegram_username,
          row.role ?? "user",
          "system",
          "system",
          "repair-false-kyc-approvals",
          "system",
          "scripts/repair-false-kyc-approvals.ts",
          timestamp,
        ],
      },
    ],
    "write",
  );
}

console.log(`[repair-false-kyc-approvals] reverted=${revert.length}`);
