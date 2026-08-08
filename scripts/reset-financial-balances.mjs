import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const FINANCIAL_TABLES = [
  "transactions",
  "deposits",
  "withdrawal_status_history",
  "telegram_action_tokens",
  "withdrawal_requests",
  "payment_sessions",
  "deposit_payment_sessions",
  "payment_provider_attempts",
  "xrocket_payout_attempts",
];

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
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

  const rawPath = rawUrl.slice("file:".length);
  const normalizedPath = rawPath.replace(/\\/g, "/");

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
    url: normalizeFileUrl(url),
    authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
  };
}

async function tableExists(db, table) {
  const result = await db.execute({
    sql: "select name from sqlite_master where type = 'table' and name = ? limit 1",
    args: [table],
  });
  return result.rows.length > 0;
}

async function countRows(db, table) {
  if (!(await tableExists(db, table))) {
    return null;
  }

  const result = await db.execute(`select count(*) as count from ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function columnExists(db, table, column) {
  if (!(await tableExists(db, table))) {
    return false;
  }

  const result = await db.execute(`pragma table_info(${table})`);
  return result.rows.some((row) => String(row.name) === column);
}

async function getBalanceSummary(db) {
  if (!(await tableExists(db, "balances"))) {
    throw new Error("Missing balances table.");
  }

  const result = await db.execute(
    `select
      count(*) as rows_count,
      coalesce(sum(available), 0) as available,
      coalesce(sum(pending_withdrawal), 0) as pending_withdrawal,
      coalesce(sum(total_deposited), 0) as total_deposited,
      coalesce(sum(total_spent), 0) as total_spent,
      coalesce(sum(total_withdrawn), 0) as total_withdrawn
     from balances`,
  );

  return result.rows[0] ?? {};
}

async function getCounts(db) {
  const counts = {};

  for (const table of FINANCIAL_TABLES) {
    counts[table] = await countRows(db, table);
  }

  return {
    balances: await getBalanceSummary(db),
    financialTables: counts,
  };
}

function printReport(title, report) {
  console.log(`\n${title}`);
  console.log("Balances:", JSON.stringify(report.balances, null, 2));
  console.log("Financial rows:");

  for (const [table, count] of Object.entries(report.financialTables)) {
    console.log(`- ${table}: ${count === null ? "missing" : count}`);
  }
}

async function resetFinancialBalances(db) {
  const now = new Date().toISOString();
  const hasPayoutOverrideEnabled = await columnExists(
    db,
    "balances",
    "payout_bonus_override_enabled",
  );
  const hasPayoutBonusPercent = await columnExists(db, "balances", "payout_bonus_percent");
  const payoutResetFields = [
    hasPayoutOverrideEnabled ? "payout_bonus_override_enabled = 0" : null,
    hasPayoutBonusPercent ? "payout_bonus_percent = null" : null,
  ].filter(Boolean);

  await db.batch([
    {
      sql: `update balances set
        available = 0,
        pending_withdrawal = 0,
        total_deposited = 0,
        total_spent = 0,
        total_withdrawn = 0,
        ${payoutResetFields.length > 0 ? `${payoutResetFields.join(",\n        ")},` : ""}
        updated_at = ?`,
      args: [now],
    },
    ...(
      await Promise.all(
        FINANCIAL_TABLES.map(async (table) =>
          (await tableExists(db, table)) ? { sql: `delete from ${table}`, args: [] } : null,
        ),
      )
    ).filter(Boolean),
  ]);
}

const apply = process.argv.includes("--apply");
const config = getDatabaseConfig();
const db = createClient(config);

console.log(`Financial reset target: ${config.url}`);
const before = await getCounts(db);
printReport("Before reset", before);

if (!apply) {
  console.log(
    "\nDry run only. To apply: RESET_FINANCIAL_BALANCES_CONFIRM=RESET npm run db:reset-financial -- --apply",
  );
  process.exit(0);
}

if (process.env.RESET_FINANCIAL_BALANCES_CONFIRM !== "RESET") {
  throw new Error(
    "Refusing to reset. Set RESET_FINANCIAL_BALANCES_CONFIRM=RESET and pass --apply.",
  );
}

await resetFinancialBalances(db);

const after = await getCounts(db);
printReport("After reset", after);

console.log("\nFinancial reset complete. Users, profiles, Telegram verification, passwords, and roles were not modified.");
