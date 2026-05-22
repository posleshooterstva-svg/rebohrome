import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { createClient } from "@libsql/client";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env.local");

function parseEnv(text) {
  const result = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    result[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return result;
}

async function loadEnv() {
  const localEnv = await fs.readFile(envPath, "utf8").catch(() => "");
  return {
    ...parseEnv(localEnv),
    ...process.env,
  };
}

function normalizeDatabaseUrl(rawUrl) {
  const trimmed = rawUrl.trim();

  if (!trimmed.startsWith("file:")) {
    return trimmed;
  }

  const rawPath = trimmed.slice("file:".length).replace(/\\/g, "/");

  if (rawPath.startsWith("/") || /^[a-zA-Z]:\//.test(rawPath)) {
    return `file:${rawPath}`;
  }

  return `file:${path.resolve(projectRoot, rawPath).replace(/\\/g, "/")}`;
}

function resolveDatabaseConfig(env) {
  const rawUrl = env.DATABASE_URL?.trim() || env.LOCAL_DATABASE_URL?.trim();

  if (!rawUrl) {
    throw new Error("Missing DATABASE_URL or LOCAL_DATABASE_URL.");
  }

  return {
    url: normalizeDatabaseUrl(rawUrl),
    authToken: env.DATABASE_AUTH_TOKEN?.trim() || undefined,
  };
}

function readArg(prefix, fallback = "") {
  const value = process.argv.find((entry) => entry.startsWith(`${prefix}=`));
  return value ? value.slice(prefix.length + 1) : fallback;
}

async function main() {
  const env = await loadEnv();
  const dbConfig = resolveDatabaseConfig(env);
  const baseUrl = env.APP_BASE_URL || "http://127.0.0.1:3003";
  const adminChatId = env.ADMIN_TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID || "";
  const secret =
    env.TELEGRAM_WEBHOOK_SECRET ||
    env.TELEGRAM_CALLBACK_SECRET ||
    createHash("sha256")
      .update(`${env.TELEGRAM_BOT_TOKEN || ""}:${adminChatId}:rebohrome-callback`)
      .digest("hex");
  const action = readArg("--action", "approve");
  const explicitWithdrawalId = readArg("--withdrawal", "");
  const adminUsername = (env.ADMIN_SEED_TELEGRAM_USERNAME || "@monohrome_admin").replace(
    /^@/,
    "",
  );

  if (!secret) {
    throw new Error("Missing TELEGRAM_CALLBACK_SECRET.");
  }

  const db = createClient({
    url: dbConfig.url,
    authToken: dbConfig.authToken,
  });
  const args = action
    ? [action, explicitWithdrawalId || null]
    : [explicitWithdrawalId || null];
  const whereById = explicitWithdrawalId ? "and t.withdrawal_id = ?" : "";
  const tokenQuery = await db.execute({
    sql: `
      select
        t.id,
        t.callback_signature,
        t.withdrawal_id,
        t.action_type,
        t.allowed_from_status
      from telegram_action_tokens t
      inner join withdrawal_requests w on w.id = t.withdrawal_id
      where t.consumed_at is null
        and t.action_type = ?
        ${whereById}
      order by t.created_at desc
      limit 1
    `,
    args: explicitWithdrawalId ? [action, explicitWithdrawalId] : [action],
  });

  const row = tokenQuery.rows[0];
  if (!row) {
    throw new Error(`No active Telegram token found for action "${action}".`);
  }

  const update = {
    update_id: Date.now(),
    callback_query: {
      id: `smoke-${Date.now()}`,
      from: {
        id: 900000001,
        username: adminUsername,
        first_name: "Monohrome",
      },
      message: {
        message_id: Number(row.id.length),
        chat: {
          id: Number(adminChatId || 0),
          type: "group",
          title: "ReboHrome Ops",
        },
      },
      data: `wd:${row.id}:${row.callback_signature}`,
    },
  };

  const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rebohrome-telegram-secret": secret,
    },
    body: JSON.stringify(update),
  });

  const payload = await response.text();
  console.log(`[telegram-withdrawal-smoke] ${response.status} ${payload}`);
}

main().catch((error) => {
  console.error("[telegram-withdrawal-smoke] failed", error);
  process.exitCode = 1;
});
