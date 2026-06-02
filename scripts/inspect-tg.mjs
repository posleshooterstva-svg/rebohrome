import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const c = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });

for (const t of ["telegram_users", "telegram_identities", "telegram_verifications", "telegram_verification_codes"]) {
  console.log("\n=== " + t + " ===");
  try {
    const cols = await c.execute("pragma table_info(" + t + ")");
    console.log("cols:", cols.rows.map((r) => r.name).join(", "));
    const cnt = await c.execute("select count(*) as n from " + t);
    console.log("rows:", cnt.rows[0].n);
    const sample = await c.execute("select * from " + t + " limit 5");
    for (const r of sample.rows) console.log(JSON.stringify(r));
  } catch (e) {
    console.log("err:", e.message);
  }
}
