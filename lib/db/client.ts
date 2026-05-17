import { createClient } from "@libsql/client";
import { mkdirSync } from "fs";
import path from "path";

let client: ReturnType<typeof createClient> | null = null;

export function getDbClient() {
  if (client) {
    return client;
  }

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "rebohrome-platform.db").replace(/\\/g, "/");

  client = createClient({
    url: `file:${dbPath}`,
  });

  return client;
}
