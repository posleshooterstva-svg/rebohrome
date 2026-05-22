import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env.local");
const offsetPath = path.join(projectRoot, "tmp-telegram-offset.json");

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

async function readOffset() {
  const content = await fs.readFile(offsetPath, "utf8").catch(() => "");
  if (!content) {
    return null;
  }

  try {
    const payload = JSON.parse(content);
    return Number(payload.offset ?? 0) || null;
  } catch {
    return null;
  }
}

async function writeOffset(offset) {
  await fs.writeFile(
    offsetPath,
    JSON.stringify({ offset, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

async function callTelegram(method, token, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`Telegram ${method} returned an unsuccessful response.`);
  }

  return payload.result;
}

async function deleteTelegramWebhook(token) {
  await callTelegram("deleteWebhook", token, {
    drop_pending_updates: false,
  });
}

async function forwardUpdate(update, baseUrl, secret) {
  const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rebohrome-telegram-secret": secret,
    },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook bridge failed: ${text}`);
  }

  return response.json();
}

async function runCycle(config) {
  const currentOffset = await readOffset();
  const updates = await callTelegram("getUpdates", config.token, {
    offset: currentOffset ?? undefined,
    timeout: 5,
    allowed_updates: ["message", "callback_query"],
  });

  if (!Array.isArray(updates) || updates.length === 0) {
    console.log("[telegram-poll] no new callback updates");
    return;
  }

  for (const update of updates) {
    const result = await forwardUpdate(update, config.baseUrl, config.secret);
    console.log(
      `[telegram-poll] bridged update ${update.update_id} -> ${JSON.stringify(result)}`,
    );
    await writeOffset(Number(update.update_id) + 1);
  }
}

async function main() {
  const env = await loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const adminChatId = env.ADMIN_TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID || "";
  const secret =
    env.TELEGRAM_WEBHOOK_SECRET ||
    env.TELEGRAM_CALLBACK_SECRET ||
    createHash("sha256")
      .update(`${env.TELEGRAM_BOT_TOKEN || ""}:${adminChatId}:rebohrome-callback`)
      .digest("hex");
  const baseUrl = env.APP_BASE_URL || "http://127.0.0.1:3003";
  const watch = process.argv.includes("--watch");
  const takeover = process.argv.includes("--takeover");

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  }

  if (!secret) {
    throw new Error("Missing TELEGRAM_CALLBACK_SECRET.");
  }

  if (watch) {
    console.log(`[telegram-poll] watching Telegram callbacks for ${baseUrl}`);
    for (;;) {
      try {
        await runCycle({ token, secret, baseUrl });
      } catch (error) {
        if (
          takeover &&
          error instanceof Error &&
          error.message.includes("Telegram getUpdates failed with 409")
        ) {
          console.log("[telegram-poll] existing webhook detected, deleting it for local takeover");
          await deleteTelegramWebhook(token);
          continue;
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  try {
    await runCycle({ token, secret, baseUrl });
  } catch (error) {
    if (
      takeover &&
      error instanceof Error &&
      error.message.includes("Telegram getUpdates failed with 409")
    ) {
      console.log("[telegram-poll] existing webhook detected, deleting it for local takeover");
      await deleteTelegramWebhook(token);
      await runCycle({ token, secret, baseUrl });
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error("[telegram-poll] failed", error);
  process.exitCode = 1;
});
