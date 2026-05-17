import "server-only";
import { createClient } from "@libsql/client";
import { mkdirSync } from "fs";
import path from "path";

type DatabaseRuntimeConfig = {
  url: string;
  authToken?: string;
  source: "DATABASE_URL" | "LOCAL_DATABASE_URL";
  usingLocalDatabase: boolean;
  usingExternalDatabase: boolean;
  automaticSetupEnabled: boolean;
  automaticSeedEnabled: boolean;
};

let client: ReturnType<typeof createClient> | null = null;
let runtimeConfig: DatabaseRuntimeConfig | null = null;

function isTruthy(value?: string) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function isDeploymentRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function isFileDatabaseUrl(url: string) {
  return url.startsWith("file:");
}

function isRemoteDatabaseUrl(url: string) {
  return !isFileDatabaseUrl(url);
}

function normalizeDatabaseUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();

  if (!isFileDatabaseUrl(trimmed)) {
    return trimmed;
  }

  const rawPath = trimmed.slice("file:".length);
  const normalizedPath = rawPath.replace(/\\/g, "/");

  if (!normalizedPath) {
    throw new Error("Invalid file database URL: missing file path.");
  }

  if (
    normalizedPath.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalizedPath)
  ) {
    return `file:${normalizedPath}`;
  }

  const absolutePath = path.resolve(process.cwd(), normalizedPath).replace(/\\/g, "/");
  return `file:${absolutePath}`;
}

function getConfiguredDatabaseUrl(name: "DATABASE_URL" | "LOCAL_DATABASE_URL") {
  const rawUrl = process.env[name]?.trim();
  return rawUrl ? normalizeDatabaseUrl(rawUrl) : null;
}

export function getDbRuntimeConfig() {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  const deploymentRuntime = isDeploymentRuntime();
  const externalUrl = getConfiguredDatabaseUrl("DATABASE_URL");
  const localUrl = getConfiguredDatabaseUrl("LOCAL_DATABASE_URL");

  if (externalUrl) {
    const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;

    if (deploymentRuntime && isFileDatabaseUrl(externalUrl)) {
      throw new Error(
        "DATABASE_URL points to a local file database. Vercel production must use an external libSQL/Turso database URL.",
      );
    }

    if (isRemoteDatabaseUrl(externalUrl) && !authToken) {
      throw new Error(
        "Missing DATABASE_AUTH_TOKEN. Remote libSQL/Turso databases require DATABASE_URL and DATABASE_AUTH_TOKEN in production.",
      );
    }

    runtimeConfig = {
      url: externalUrl,
      authToken,
      source: "DATABASE_URL",
      usingLocalDatabase: isFileDatabaseUrl(externalUrl),
      usingExternalDatabase: !isFileDatabaseUrl(externalUrl),
      automaticSetupEnabled: !deploymentRuntime && isTruthy(process.env.DB_AUTO_SETUP),
      automaticSeedEnabled:
        !deploymentRuntime &&
        isTruthy(process.env.DB_AUTO_SETUP) &&
        isTruthy(process.env.DB_AUTO_SEED),
    };

    return runtimeConfig;
  }

  if (localUrl && !deploymentRuntime) {
    runtimeConfig = {
      url: localUrl,
      source: "LOCAL_DATABASE_URL",
      usingLocalDatabase: true,
      usingExternalDatabase: false,
      automaticSetupEnabled: isTruthy(process.env.DB_AUTO_SETUP),
      automaticSeedEnabled:
        isTruthy(process.env.DB_AUTO_SETUP) && isTruthy(process.env.DB_AUTO_SEED),
    };

    return runtimeConfig;
  }

  if (deploymentRuntime) {
    throw new Error(
      "Missing DATABASE_URL. Production deployments must use an external writable database and must not fall back to local SQLite.",
    );
  }

  throw new Error(
    "Missing database configuration. Set LOCAL_DATABASE_URL for local development or DATABASE_URL for an external database.",
  );
}

export function shouldAutoSetupDatabase() {
  return getDbRuntimeConfig().automaticSetupEnabled;
}

export function shouldAutoSeedDatabase() {
  return getDbRuntimeConfig().automaticSeedEnabled;
}

export function getDbClient() {
  if (client) {
    return client;
  }

  const config = getDbRuntimeConfig();

  if (config.usingLocalDatabase) {
    const databasePath = config.url.slice("file:".length);
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  client = createClient({
    url: config.url,
    authToken: config.authToken,
  });

  return client;
}
