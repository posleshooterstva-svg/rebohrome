// Import top Pokémon cards from gacha.collectorcrypt.com into the products table.
// Data captured from the public site (https://gacha.collectorcrypt.com/).
//
// Usage:
//   node scripts/import-gacha-cards.mjs            # dry run, prints what would be inserted
//   node scripts/import-gacha-cards.mjs --apply    # actually write to the database
//
// Reads DATABASE_URL / DATABASE_AUTH_TOKEN from .env.local in the project root.

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
if (!env.DATABASE_URL || !env.DATABASE_AUTH_TOKEN) {
  throw new Error("Missing DATABASE_URL or DATABASE_AUTH_TOKEN in .env.local");
}

const CARDS = [
  ["2014 #69 M Charizard EX PSA 10 X", 1755, "PSA 10", "lOa0ri9Uxwjft5Yt5d4hn8aFh2BVbnO8Mk6oZZtLcmY"],
  ["2007 #64 Ditto [Squirtle] PSA 9", 1750, "PSA 9", "jAvHjI4vD10vUo9bRJSMI6TdKpCfUchETWjeC0W6TpQ"],
  ["2000 #249 Lugia PSA 10 Japanese", 1750, "PSA 10", "l-9UoajDC9LigmGgA5posu9byzBauMDhYUDEDsQiJQ4"],
  ["2015 #XY-P Champions Festival PSA 10", 1750, "PSA 10", "sERn0zRmr6tie4v4IACrH7CpQkwYRst-z-ETvVVJ1bk"],
  ["2015 #98 Full Art M Rayquaza EX CGC 9", 1750, "CGC 9", "B6eCGq78YrFpYi8KijnNYBzRLxFscdusj-aCsxdoMSs"],
  ["2001 #41 Lucky Stadium N.Y. Center PSA 9", 1750, "PSA 9", "yxKzwvqr-cG-ORl935AkQLH9ANHr48aThNt7sxBMU24"],
  ["2006 #103 Mewtwo-Holo PSA 10 EX Holon Phantoms", 1712, "PSA 10", "XYC3nrXYGu2osdKM6KvfcKQGznF2iGzd1g3VUafh4rU"],
  ["2011 #SL2 Dialga CGC 10 Call of Legends", 1710, "CGC 10", "V1vRK4IXRQ3xKG8klZ53aXlosxqldBQxZD9MHBRIfes"],
  ["1999 #2 Tortank-Holo 1st Edition PSA 9", 1700, "PSA 9", "OIfHpxQfCTVHKJJxFous9M2iPGHDBNJLWQOsOO54aH0"],
  ["1999 #11 Cosmos Holo Test Print CGC 8", 1700, "CGC 8", "NcwMWUR7wIzYaM1k7YAw47GWgTNCqYpjVZMg2-LAP0Q"],
  ["2017 #XY177a Full Art Karen PSA 10", 1700, "PSA 10", "odd3xR7vhElp6_F8F35UDVaefyYm3YRnNGTwUw3o1GU"],
  ["2019 #098 Full Art Mewtwo & Mew CGC 10", 1700, "CGC 10", "4C8lwtgyeOp3ePRHMAH30spreEbB20IA3F2L0x0QT6w"],
  ["1999 #16 Zapdos-Holo PSA 10 Game", 1700, "PSA 10", "NoHF2I3fJw0hKSr2Kg-sVF3Ayt9DtE-4ceUD29sUyjo"],
  ["25th Anniversary Golden Box", 1700, "Ungraded", "GeoRojDTUT2Deu0Q-NWyJ1WgXZCG6vWvNNDxkwWuGrc"],
  ["2012 #128 Rayquaza PSA 8 Black & White", 1700, "PSA 8", "g-Jkdvw3J2C2W-fbMU4nYEdO8wdPPO7fReFA9ZpI8Mo"],
  ["2006 #102 Gyarados-Holo Gold Star CGC 5", 1687, "CGC 5", "-cjBoLLankEI9a9a9yGxI6uaEZWKfXPw2t55BS1zAkE"],
  ["2008 #66 Dialga G Lv.X PSA 10 Pokemon Platinum", 1685, "PSA 10", "VFDf13L4mPve_evPJu5O8GyNoknGdkulCTTCL3KbbjI"],
  ["2019 #SV49 Charizard GX UR BGS 10", 1680, "BGS 10", "NqoCfU961c6cMAR4JsE0jCichcyupK3H1_FnDW-kbi4"],
  ["2024 #085 Pikachu with Grey Felt Hat BGS 10", 1675, "BGS 10", "tKE_lt-wwdVjOcYQ3UHZYfY9eQI9QJBby7GZewiUzrE"],
  ["2019 #365 Full Art Armored Mewtwo PSA 10", 1675, "PSA 10", "hYtTU0XMF7kDyBc9r_PG4X_64tyaNZyMscE0io92J-8"],
];

const SHAPES_BY_RARITY = {
  Legendary: ["spire", "halo"],
  Epic: ["void", "crescent"],
  Rare: ["shard", "spire"],
};

const PALETTES = {
  Legendary: {
    glow: "rgba(212, 173, 91, 0.34)",
    glowSoft: "rgba(255, 244, 214, 0.88)",
    core: "#fff5df",
    ring: "#f2cc7f",
  },
  Epic: {
    glow: "rgba(167, 141, 255, 0.34)",
    glowSoft: "rgba(243, 238, 255, 0.88)",
    core: "#f6f1ff",
    ring: "#b5a4ff",
  },
  Rare: {
    glow: "rgba(120, 198, 240, 0.34)",
    glowSoft: "rgba(225, 240, 252, 0.88)",
    core: "#eef6fc",
    ring: "#8fc4e8",
  },
};

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function rarityFromPrice(price) {
  if (price >= 1000) return "Legendary";
  if (price >= 300) return "Epic";
  return "Rare";
}

function buildProduct(card, index) {
  const [title, price, grade, imageKey] = card;
  const rarity = rarityFromPrice(price);
  const shapes = SHAPES_BY_RARITY[rarity];
  const shape = shapes[index % shapes.length];
  const palette = PALETTES[rarity];
  const id = slugify(title) || `card-${randomUUID().slice(0, 8)}`;
  const imageUrl = `https://d1xpxki1g4htqu.cloudfront.net/${imageKey}`;
  const timestamp = new Date().toISOString();

  return {
    id,
    title,
    rarity,
    price,
    currency: "USD",
    stock: 1,
    collection: "Pokémon",
    category: "Trading Card",
    description: `Authentic graded ${grade} trading card sourced from CollectorCrypt's insured vault. Insured value at the time of import: $${price.toLocaleString("en-US")}.`,
    tagline: `Graded ${grade}`,
    defaultDeliveryType: "physical",
    deliveryDigital:
      "Digital twin delivered to your Rebohrome vault after settlement.",
    deliveryPhysical:
      "Sealed and shipped from CollectorCrypt's secure vault with full insurance and tracking.",
    edition: grade,
    shape,
    imageUrl,
    imagePath: null,
    imageUpdatedAt: timestamp,
    featured: 0,
    homepageFeatured: 0,
    featuredStartedAt: null,
    showcaseFloat: 1,
    showcaseRotationSeconds: 12,
    status: "active",
    archived: 0,
    paletteGlow: palette.glow,
    paletteGlowSoft: palette.glowSoft,
    paletteCore: palette.core,
    paletteRing: palette.ring,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const products = CARDS.map(buildProduct);

console.log(`Prepared ${products.length} products. Sample:`);
console.log(
  products.slice(0, 3).map((p) => ({ id: p.id, title: p.title, price: p.price, rarity: p.rarity, image: p.imageUrl })),
);

const apply = process.argv.includes("--apply");

const client = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
});

// Find existing ids to skip duplicates.
const existing = await client.execute({
  sql: `select id from products where id in (${products.map(() => "?").join(",")})`,
  args: products.map((p) => p.id),
});
const existingIds = new Set(existing.rows.map((r) => r.id));
const toInsert = products.filter((p) => !existingIds.has(p.id));

console.log(
  `Existing: ${existingIds.size}. To insert: ${toInsert.length}.`,
);
if (existingIds.size > 0) console.log("Skipping:", Array.from(existingIds));

if (!apply) {
  console.log("\nDRY RUN. Re-run with --apply to write to the database.");
  process.exit(0);
}

let inserted = 0;
for (const p of toInsert) {
  await client.execute({
    sql: `insert into products (
      id, title, rarity, price, currency, stock, collection, category, description,
      tagline, default_delivery_type, delivery_digital, delivery_physical, edition,
      shape, image_url, image_path, image_updated_at, featured, homepage_featured,
      featured_started_at, showcase_float, showcase_rotation_seconds, status, archived,
      palette_glow, palette_glow_soft, palette_core, palette_ring, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      p.id, p.title, p.rarity, p.price, p.currency, p.stock, p.collection,
      p.category, p.description, p.tagline, p.defaultDeliveryType,
      p.deliveryDigital, p.deliveryPhysical, p.edition, p.shape, p.imageUrl,
      p.imagePath, p.imageUpdatedAt, p.featured, p.homepageFeatured,
      p.featuredStartedAt, p.showcaseFloat, p.showcaseRotationSeconds, p.status,
      p.archived, p.paletteGlow, p.paletteGlowSoft, p.paletteCore, p.paletteRing,
      p.createdAt, p.updatedAt,
    ],
  });
  inserted += 1;
  console.log(`  + ${p.id}`);
}

console.log(`\nDone. Inserted ${inserted} products.`);
