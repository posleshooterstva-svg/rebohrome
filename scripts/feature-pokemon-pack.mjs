// Replace the current homepage-featured product (Warcraft Random Pack) with
// a Pokémon-themed gacha pack that uses real artwork from CollectorCrypt.

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));

const c = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });

const PACK = {
  id: "elite-pokemon-gacha-pack",
  title: "Elite Pokémon Gacha Pack",
  rarity: "Legendary",
  price: 999,
  currency: "USD",
  stock: 25,
  collection: "Pokémon",
  category: "Gacha Pack",
  description:
    "Premium sealed gacha pack containing one authenticated Pokémon card with an expected value north of $999. Every pull is graded (PSA, CGC, or BGS) and shipped from CollectorCrypt's insured vault. ~20% chance of a Big Win pull worth multiples of the pack price.",
  tagline: "1 graded card per pack · 20% Big Win chance",
  defaultDeliveryType: "physical",
  deliveryDigital:
    "Digital twin of the pulled card is delivered to your Rebohrome vault immediately after the reveal.",
  deliveryPhysical:
    "The physical graded card is sealed and shipped from CollectorCrypt's insured vault with tracking.",
  edition: "Limited Drop",
  shape: "halo",
  imageUrl:
    "https://d1xpxki1g4htqu.cloudfront.net/lOa0ri9Uxwjft5Yt5d4hn8aFh2BVbnO8Mk6oZZtLcmY",
  imagePath: null,
  imageUpdatedAt: new Date().toISOString(),
  featured: 1,
  homepageFeatured: 1,
  showcaseFloat: 1,
  showcaseRotationSeconds: 12,
  status: "active",
  archived: 0,
  paletteGlow: "rgba(212, 173, 91, 0.34)",
  paletteGlowSoft: "rgba(255, 244, 214, 0.88)",
  paletteCore: "#fff5df",
  paletteRing: "#f2cc7f",
};

const apply = process.argv.includes("--apply");

const exists = await c.execute({
  sql: "select id from products where id = ?",
  args: [PACK.id],
});
console.log("Pack already exists?", exists.rows.length > 0);

// Show what's currently featured.
const cur = await c.execute(
  "select id, title, homepage_featured, featured from products where homepage_featured=1",
);
console.log("Currently homepage-featured:");
for (const r of cur.rows) console.log(" ", JSON.stringify(r));

if (!apply) {
  console.log("\nDRY RUN. Re-run with --apply.");
  process.exit(0);
}

const ts = new Date().toISOString();

// Clear any existing homepage_featured.
await c.execute(
  "update products set homepage_featured = 0, featured_started_at = null where homepage_featured = 1",
);

if (exists.rows.length === 0) {
  await c.execute({
    sql: `insert into products (
      id, title, rarity, price, currency, stock, collection, category, description,
      tagline, default_delivery_type, delivery_digital, delivery_physical, edition,
      shape, image_url, image_path, image_updated_at, featured, homepage_featured,
      featured_started_at, showcase_float, showcase_rotation_seconds, status, archived,
      palette_glow, palette_glow_soft, palette_core, palette_ring, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      PACK.id, PACK.title, PACK.rarity, PACK.price, PACK.currency, PACK.stock,
      PACK.collection, PACK.category, PACK.description, PACK.tagline,
      PACK.defaultDeliveryType, PACK.deliveryDigital, PACK.deliveryPhysical,
      PACK.edition, PACK.shape, PACK.imageUrl, PACK.imagePath, PACK.imageUpdatedAt,
      PACK.featured, PACK.homepageFeatured, ts, PACK.showcaseFloat,
      PACK.showcaseRotationSeconds, PACK.status, PACK.archived, PACK.paletteGlow,
      PACK.paletteGlowSoft, PACK.paletteCore, PACK.paletteRing, ts, ts,
    ],
  });
  console.log("Inserted new pack:", PACK.id);
} else {
  await c.execute({
    sql: `update products set
      title = ?, rarity = ?, price = ?, stock = ?, collection = ?, category = ?,
      description = ?, tagline = ?, image_url = ?, image_path = ?, image_updated_at = ?,
      featured = 1, homepage_featured = 1, featured_started_at = ?, status = 'active',
      archived = 0, palette_glow = ?, palette_glow_soft = ?, palette_core = ?,
      palette_ring = ?, shape = ?, updated_at = ?
      where id = ?`,
    args: [
      PACK.title, PACK.rarity, PACK.price, PACK.stock, PACK.collection, PACK.category,
      PACK.description, PACK.tagline, PACK.imageUrl, PACK.imagePath, PACK.imageUpdatedAt,
      ts, PACK.paletteGlow, PACK.paletteGlowSoft, PACK.paletteCore, PACK.paletteRing,
      PACK.shape, ts, PACK.id,
    ],
  });
  console.log("Updated existing pack:", PACK.id);
}

const check = await c.execute(
  "select id, title, homepage_featured, image_url from products where homepage_featured=1",
);
console.log("Now homepage-featured:");
for (const r of check.rows) console.log(" ", JSON.stringify(r));
