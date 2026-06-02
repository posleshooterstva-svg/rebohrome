// Update gacha pack images using verified CloudFront keys from imported cards.
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);

const client = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });

// Pull a pool of confirmed-working image URLs from existing card products
const pool = await client.execute({
  sql: `select id, image_url, rarity, price from products
        where category = 'Trading Card' and image_url like 'https://d1xpxki1g4htqu.cloudfront.net/%'
        order by price desc`,
});

function pickFor(titleMatch) {
  const row = pool.rows.find((r) =>
    String(r.id).toLowerCase().includes(titleMatch.toLowerCase())
  );
  return row?.image_url;
}

const updates = [
  ["starter-pokemon-gacha-pack", pickFor("pikachu")],
  ["anime-pop-culture-gacha-pack", pickFor("dragonite") ?? pickFor("salamence")],
  ["sealed-trove-gacha-pack", pickFor("squirtle") ?? pickFor("blastoise")],
  ["water-pokemon-gacha-pack", pickFor("blastoise") ?? pickFor("gyarados") ?? pickFor("feraligatr")],
  ["sports-gacha-pack", pickFor("van-gogh") ?? pickFor("pikachu-with-grey")],
  ["one-piece-gacha-pack", pickFor("one-piece") ?? pickFor("bartholomew") ?? pickFor("kuma")],
  ["legendary-pokemon-gacha-pack", pickFor("lugia") ?? pickFor("charizard")],
  ["grail-pokemon-gacha-pack", pickFor("charizard-ex") ?? pickFor("charizard")],
];

for (const [id, url] of updates) {
  if (!url) { console.log("SKIP (no match):", id); continue; }
  await client.execute({
    sql: `update products set image_url = ?, image_updated_at = ? where id = ?`,
    args: [url, new Date().toISOString(), id],
  });
  console.log("UPDATED", id, "->", url);
}
console.log("Done.");
