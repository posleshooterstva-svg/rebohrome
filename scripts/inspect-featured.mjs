import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/).filter(l => l && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));

const c = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
const r = await c.execute("select id, title, rarity, price, homepage_featured, featured, image_url, archived, status from products where homepage_featured=1 or featured=1 order by homepage_featured desc, featured desc");
for (const row of r.rows) console.log(JSON.stringify(row));
