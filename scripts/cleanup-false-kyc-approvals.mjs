import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeFileUrl(rawUrl) {
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

const shouldApply = process.argv.includes("--apply");
const now = new Date().toISOString();
const db = createClient(getDatabaseConfig());

const candidates = await db.execute({
  sql: `select id, username, kyc_status, kyc_verified, kyc_provider, veriff_decision,
          kyc_manual_override, kyc_manual_override_reason
        from users
        where kyc_status in ('approved', 'manual_approved')
          and coalesce(kyc_verified, 0) = 1
          and coalesce(kyc_manual_override, 0) = 0
          and lower(coalesce(veriff_decision, '')) not in ('approved', 'positive', 'verified')`,
  args: [],
});

console.log(
  `[cleanup-false-kyc-approvals] suspicious approvals found: ${candidates.rows.length}`,
);

for (const row of candidates.rows) {
  console.log(
    `- ${row.id} ${row.username}: status=${row.kyc_status}, provider=${row.kyc_provider ?? "null"}, decision=${row.veriff_decision ?? "null"}`,
  );
}

if (!shouldApply) {
  console.log("[cleanup-false-kyc-approvals] dry-run only. Re-run with --apply to reset.");
  process.exit(0);
}

const statements = [];
for (const row of candidates.rows) {
  statements.push(
    {
      sql: `update users
            set kyc_verified = 0,
                kyc_status = 'review',
                veriff_reason = coalesce(veriff_reason, 'Reset by false KYC approval cleanup. Awaiting trusted Veriff decision webhook or admin review.'),
                updated_at = ?
            where id = ?`,
      args: [now, row.id],
    },
    {
      sql: `insert into security_audit_events (
              id, event_type, user_id, username, telegram_username, role,
              ip_address, country, user_agent, language, route, created_at
            )
            select lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' ||
              lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' ||
              lower(hex(randomblob(6))),
              'kyc_reset',
              users.id,
              users.username,
              profiles.telegram_username,
              profiles.role,
              'system',
              'system',
              'cleanup-false-kyc-approvals',
              'system',
              'scripts/cleanup-false-kyc-approvals',
              ?
            from users
            inner join profiles on profiles.user_id = users.id
            where users.id = ?`,
      args: [now, row.id],
    },
  );
}

if (statements.length > 0) {
  await db.batch(statements, "write");
}

console.log(`[cleanup-false-kyc-approvals] reset applied: ${candidates.rows.length}`);
