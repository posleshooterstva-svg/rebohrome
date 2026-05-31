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

const tables = await c.execute(
  "select name from sqlite_master where type='table' order by name",
);
console.log("TABLES:", tables.rows.map((r) => r.name).join(", "));

const productCount = await c.execute("select count(*) as n from products");
console.log("PRODUCTS:", productCount.rows[0].n);

const sample = await c.execute(
  "select id, title, image_url, image_path, status, archived from products order by created_at desc limit 5",
);
console.log("SAMPLE PRODUCTS:");
for (const r of sample.rows) console.log(JSON.stringify(r));

// telegram usernames
try {
  const cols = await c.execute("pragma table_info(users)");
  const colNames = cols.rows.map((r) => r.name);
  console.log("USERS COLUMNS:", colNames.join(", "));
  const tgCols = colNames.filter((n) => /telegram/i.test(n));
  if (tgCols.length) {
    const q = `select id, ${tgCols.join(", ")} from users where ${tgCols.map((c) => `${c} is not null and ${c} != ''`).join(" or ")} limit 20`;
    const users = await c.execute(q);
    console.log("USERS WITH TG:", users.rows.length);
    for (const r of users.rows) console.log(JSON.stringify(r));
  }
} catch (e) {
  console.log("users table check err:", e.message);
}
