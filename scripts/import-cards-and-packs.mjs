// Add additional Pokemon/One Piece/Yu-Gi-Oh cards and gacha packs.
// Run: node scripts/import-cards-and-packs.mjs [--apply]

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

function loadEnv() {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
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

// === New cards (different from previous imports). [title, price, solana id]
const NEW_CARDS = [
  ["2023 #009 Blastoise EX CGC 10 Japanese 151", 39, "BzvZucYJ6pYkhixsMqoQvhjH55LPbUygKCSdgk9czxGo"],
  ["2016 #106 Full Art Dragonite EX CGC 8.5 XY Evolutions", 39, "77Qki1h9qc6tfvVQR34X62FPoDU1UzYQ5YamFVpGvc4S"],
  ["2010 #024 Espeon-Holo 1st Edition BGS 9 Japanese Reviving Legends", 95, "3RJYdsgiNrNwoMjAWk9eWqGVoQp6VoCg4GyBQDZQqnny"],
  ["2012 #48 Espeon CGC 8.5 Pokemon Dark Explorers Cross Holo Natl Champs", 95, "37uinAefXDoLUbL7CZyGrWYwJzwnjwQKunjh4chmotcv"],
  ["2000 #4 Feraligatr CGC 9.5 Neo Genesis Unlimited English", 112, "B4XfgHoEWxrQuWNExcDcxAKyPtcQBo6j3NrF7x3nZUe9"],
  ["2022 #262 Full Art Charizard VSTAR PSA 9 Swsh Black Star Promo", 100, "AZrmZDArUm2VHtX7iYJXnYR6o8hoRkfMM3P1Yv7PNRbJ"],
  ["2021 #136 Mimikyu-Holo PSA 10 Swsh Black Star Promo", 375, "AVGd9URLqgJQUCkBcTTjRszo5bxE2JTPEEsCyQNtEWWb"],
  ["2022 #TG16 Full Art Pikachu V PSA 8 Lost Origin", 80, "3RsF5WrfuoUwiX225tB79k3dp5FgwF3TxCVAWLAvZmV8"],
  ["2024 #075 Mimikyu PSA 10 SV Black Star Promo", 145, "7KwYRpm5rTkAfpmyhTG53RhdDLVhDnXaLUNjf31NKAZE"],
  ["2023 #GG46 Full Art Deoxys VSTAR PSA 10 Crown Zenith", 255, "7AYAg51pLp5kZXUNjKSbLGcY7mtLcutzqCMjrMwQQT6Y"],
  ["2019 #023 Ditto Reverse Holo CGC 10 Pristine Detective Pikachu Japanese", 80, "36DncCWrdwgh6wa6Fmt5MbH9vrvcTHDpfNsjNcBqFo5f"],
  ["2025 #119 Bartholomew Kuma PSA 10 One Piece OP12 Legacy of the Master", 80, "HZSj9QqrqMTSTNDR2Gq3sQ4bQ38rmN4mwqHZsART7iRU"],
  ["2022 Blue-Eyes White Dragon Yu-Gi-Oh CGC 10 Pristine 25th Anniversary Japanese", 292, "6B72jjPmZDcs5bMpy1nVjL9oRJbyc8ifjwpEhsdoC7Hh"],
  ["2023 #085 Pikachu with Grey Felt Hat PSA 9 Pokemon x Van Gogh", 1270, "3ZqJANBi5YP8frdwL38wPPnNQX6YvqENetmNNUYBUGoV"],
  ["2023 #199 Charizard EX PSA 10 Mew 151", 1795, "p7W4ATuwYSG2yKcNJEbefkFUCM8q5N7Yg5kVQqzYwT3"],
  ["1999 #16 Zapdos-Holo BGS 5 Game", 98, "7D6Sfw7kzxtunbXVk225pjvmRCu2DKNWpoBLEuue4cTF"],
  ["2025 #179 Pikachu EX PSA 8 Prismatic Evolutions", 50, "Fsa4B6ew22a1m86w6CSMzbjkCcCo1zBSnCzRJYZT9Aw9"],
];

// === Gacha Packs (created from scratch, with iconic art).
// Each pack uses a hero CloudFront image already imported earlier.
const PACKS = [
  {
    id: "starter-pokemon-gacha-pack",
    title: "Starter Pokémon Gacha Pack",
    rarity: "Rare",
    price: 49,
    stock: 50,
    description:
      "Entry-level sealed gacha pack with one authenticated Pokémon card worth between $13 and $125+. Perfect for new collectors who want a guaranteed graded pull.",
    tagline: "1 graded card · ~$56 expected value · 85% buyback",
    image: "tKE_lt-wwdVjOcYQ3UHZYfY9eQI9QJBby7GZewiUzrE", // Pikachu Grey Felt
    palette: "rare",
    shape: "shard",
  },
  {
    id: "anime-pop-culture-gacha-pack",
    title: "Anime Pop Culture Gacha Pack",
    rarity: "Epic",
    price: 119,
    stock: 40,
    description:
      "Mixed anime sealed pack featuring Pokémon, One Piece and pop culture cards worth $40–$375+. 20% Big Win chance on every pull, 85% buyback offer.",
    tagline: "1 graded card · Anime · 20% Big Win",
    image: "fMxdXgVEc0rT2gs_-WH2JyI55ITh0i28LIBr-3qeNd4", // Salamence
    palette: "epic",
    shape: "crescent",
  },
  {
    id: "sealed-trove-gacha-pack",
    title: "Sealed Trove Gacha Pack",
    rarity: "Epic",
    price: 159,
    stock: 30,
    description:
      "Mystery sealed trove with one graded card worth $40–$400+. Higher rarity skew (90% buyback offer) and a 20% Big Win chance.",
    tagline: "1 graded card · 90% buyback · 20% Big Win",
    image: "5dAC2g6fi0UZ80RvMXS4329YPZJyw3ArX-gBqJ7JDGk", // Squirtle Reverse Foil
    palette: "epic",
    shape: "void",
  },
  {
    id: "water-pokemon-gacha-pack",
    title: "Water Pokémon Gacha Pack",
    rarity: "Epic",
    price: 199,
    stock: 30,
    description:
      "Water-type themed sealed pack with one graded card worth $50–$500+. 25% Big Win chance, 90% instant buyback offer.",
    tagline: "1 graded Water card · 25% Big Win",
    image: "OIfHpxQfCTVHKJJxFous9M2iPGHDBNJLWQOsOO54aH0", // Tortank Holo 1st Ed
    palette: "epic",
    shape: "halo",
  },
  {
    id: "sports-gacha-pack",
    title: "Sports Gacha Pack",
    rarity: "Epic",
    price: 219,
    stock: 25,
    description:
      "Authenticated sports card sealed pack worth $50–$500+. 25% Big Win chance, 90% buyback. Multi-sport draw pool.",
    tagline: "1 graded sports card · 25% Big Win",
    image: "yxKzwvqr-cG-ORl935AkQLH9ANHr48aThNt7sxBMU24", // Lucky Stadium NY
    palette: "epic",
    shape: "spire",
  },
  {
    id: "one-piece-gacha-pack",
    title: "One Piece Gacha Pack",
    rarity: "Legendary",
    price: 349,
    stock: 20,
    description:
      "Sealed One Piece TCG pack with one graded card worth $150–$2000+. 25% Big Win chance and 90% buyback offer from the CollectorCrypt vault.",
    tagline: "1 graded One Piece card · 25% Big Win",
    image: "GeoRojDTUT2Deu0Q-NWyJ1WgXZCG6vWvNNDxkwWuGrc", // 25th Anniversary Golden
    palette: "legendary",
    shape: "shard",
  },
  {
    id: "legendary-pokemon-gacha-pack",
    title: "Legendary Pokémon Gacha Pack",
    rarity: "Legendary",
    price: 499,
    stock: 15,
    description:
      "Heavy-hitter sealed pack with one graded Legendary-tier Pokémon card worth $150–$2000+. 25% Big Win chance and 90% instant buyback.",
    tagline: "1 graded Legendary pull · 90% buyback",
    image: "l-9UoajDC9LigmGgA5posu9byzBauMDhYUDEDsQiJQ4", // Lugia
    palette: "legendary",
    shape: "halo",
  },
  {
    id: "grail-pokemon-gacha-pack",
    title: "Grail Pokémon Gacha Pack",
    rarity: "Legendary",
    price: 1499,
    stock: 8,
    description:
      "Top-tier sealed pack with one graded Grail-tier Pokémon card worth $600–$8000+. 25% Big Win chance and 93% buyback offer — only for serious collectors.",
    tagline: "1 graded Grail pull · 93% buyback",
    image: "cspQGf1oUPcWoas5H4gZ7NXxabdsrcm5kRUQiSQJMaL", // Full Art Charizard GX
    palette: "legendary",
    shape: "spire",
  },
];

const SHAPES_BY_RARITY = {
  Legendary: ["spire", "halo"],
  Epic: ["void", "crescent"],
  Rare: ["shard", "spire"],
};
const PALETTES = {
  Legendary: { glow: "rgba(212, 173, 91, 0.34)", glowSoft: "rgba(255, 244, 214, 0.88)", core: "#fff5df", ring: "#f2cc7f" },
  Epic: { glow: "rgba(167, 141, 255, 0.34)", glowSoft: "rgba(243, 238, 255, 0.88)", core: "#f6f1ff", ring: "#b5a4ff" },
  Rare: { glow: "rgba(120, 198, 240, 0.34)", glowSoft: "rgba(225, 240, 252, 0.88)", core: "#eef6fc", ring: "#8fc4e8" },
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function rarityFromPrice(price) {
  if (price >= 1000) return "Legendary";
  if (price >= 250) return "Epic";
  return "Rare";
}
function extractGrade(title) {
  const m = title.match(/(PSA|CGC|BGS|Beckett)\s*[\d.]+/i);
  return m ? m[0].toUpperCase().replace(/\s+/g, " ") : "Ungraded";
}

async function fetchImageKey(solanaId) {
  const url = `https://collectorcrypt.com/assets/solana/${solanaId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) throw new Error(`fetch ${solanaId}: ${res.status}`);
  const html = await res.text();
  const m = html.match(/d1xpxki1g4htqu\.cloudfront\.net\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`no image for ${solanaId}`);
  return m[1];
}

async function mapConcurrent(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function w() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch (e) { out[idx] = { __error: e.message }; }
    }
  }
  await Promise.all(Array.from({ length: limit }, w));
  return out;
}

console.log(`Resolving images for ${NEW_CARDS.length} new cards...`);
const cardImages = await mapConcurrent(NEW_CARDS, 6, async ([title, price, sid]) => ({
  title, price, key: await fetchImageKey(sid),
}));

const okCards = cardImages.filter((r) => !r.__error);
const badCards = cardImages.filter((r) => r.__error);
console.log(`Cards resolved: ${okCards.length}, failed: ${badCards.length}`);
if (badCards.length) console.log("Failed:", badCards);

function buildCardProduct(entry, idx) {
  const rarity = rarityFromPrice(entry.price);
  const shapes = SHAPES_BY_RARITY[rarity];
  const shape = shapes[idx % shapes.length];
  const palette = PALETTES[rarity];
  const grade = extractGrade(entry.title);
  const ts = new Date().toISOString();
  return {
    id: slugify(entry.title) || `card-${randomUUID().slice(0, 8)}`,
    title: entry.title,
    rarity, price: entry.price, currency: "USD", stock: 1,
    collection: "Pokémon", category: "Trading Card",
    description: `Authentic graded ${grade} trading card sourced from CollectorCrypt's insured vault. Listed value at the time of import: $${entry.price.toLocaleString("en-US")}.`,
    tagline: `Graded ${grade}`,
    defaultDeliveryType: "physical",
    deliveryDigital: "Digital twin delivered to your Rebohrome vault after settlement.",
    deliveryPhysical: "Sealed and shipped from CollectorCrypt's secure vault with full insurance and tracking.",
    edition: grade, shape,
    imageUrl: `https://d1xpxki1g4htqu.cloudfront.net/${entry.key}`,
    imagePath: null, imageUpdatedAt: ts,
    featured: 0, homepageFeatured: 0, featuredStartedAt: null,
    showcaseFloat: 1, showcaseRotationSeconds: 12,
    status: "active", archived: 0,
    paletteGlow: palette.glow, paletteGlowSoft: palette.glowSoft, paletteCore: palette.core, paletteRing: palette.ring,
    createdAt: ts, updatedAt: ts,
  };
}

function buildPack(p) {
  const palette = PALETTES[p.rarity];
  const ts = new Date().toISOString();
  return {
    id: p.id, title: p.title, rarity: p.rarity, price: p.price, currency: "USD", stock: p.stock,
    collection: "Pokémon", category: "Gacha Pack",
    description: p.description, tagline: p.tagline,
    defaultDeliveryType: "physical",
    deliveryDigital: "Digital twin of the pulled card is delivered to your Rebohrome vault immediately after reveal.",
    deliveryPhysical: "The physical graded card is sealed and shipped from CollectorCrypt's insured vault with tracking.",
    edition: "Limited Drop", shape: p.shape,
    imageUrl: `https://d1xpxki1g4htqu.cloudfront.net/${p.image}`,
    imagePath: null, imageUpdatedAt: ts,
    featured: 1, homepageFeatured: 0, featuredStartedAt: null,
    showcaseFloat: 1, showcaseRotationSeconds: 12,
    status: "active", archived: 0,
    paletteGlow: palette.glow, paletteGlowSoft: palette.glowSoft, paletteCore: palette.core, paletteRing: palette.ring,
    createdAt: ts, updatedAt: ts,
  };
}

const cardProducts = okCards.map(buildCardProduct);
const packProducts = PACKS.map(buildPack);
const all = [...cardProducts, ...packProducts];

const seen = new Set();
const unique = [];
for (const p of all) {
  if (seen.has(p.id)) continue;
  seen.add(p.id);
  unique.push(p);
}

const client = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN });
const existing = await client.execute({
  sql: `select id from products where id in (${unique.map(() => "?").join(",")})`,
  args: unique.map((p) => p.id),
});
const existingIds = new Set(existing.rows.map((r) => r.id));
const toInsert = unique.filter((p) => !existingIds.has(p.id));
console.log(`Total candidates: ${unique.length}, already in DB: ${existingIds.size}, to insert: ${toInsert.length}`);

const apply = process.argv.includes("--apply");
if (!apply) {
  console.log("\nDRY RUN. Sample of new items:");
  for (const p of toInsert.slice(0, 5)) console.log(" -", p.id, "$" + p.price, p.rarity, p.category);
  console.log("Re-run with --apply.");
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
  console.log(`  + ${p.category === "Gacha Pack" ? "[PACK] " : ""}${p.id}  ($${p.price}, ${p.rarity})`);
}

console.log(`\nDone. Inserted ${inserted} new products (${cardProducts.length} cards + ${packProducts.length} packs requested).`);
