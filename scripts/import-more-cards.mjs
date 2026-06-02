// Import a wider sample of CollectorCrypt cards (price range ~$15–$5000).
//
// Each entry below is [title, price, solana_asset_id]. The script fetches each
// asset page and extracts the CloudFront image key from the rendered HTML.
//
// Usage: node scripts/import-more-cards.mjs [--apply]

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

// [title, price USD, solana asset id]
const CARDS = [
  ["2025 #161 Articuno PSA 8 Journey Together", 15, "AL1rwaXh56kZZhHyJwvKj8YxCsAFMofQW3Cq3d8HKscG"],
  ["2025 #167 N's Reshiram PSA 9 Journey Together", 26, "EPbxEwt9svCz8zLKnZG2KA3wP4mi9YSTgLSKjJzeB39N"],
  ["2017 #SM108 Ash's Pikachu PSA 7 SM Black Star Promo", 27, "9caMMKpvGeB2E4HcLiXbLRvqc7EgfPKxp2RCVTpdJu2V"],
  ["2023 #284 Galarian Moltres PSA 9 Swsh Black Star Promo", 30, "4fiRcQHrnfJwRAysk95N7X87VJZuikzwxJw441cRWBSe"],
  ["2023 #204 Slowpoke PSA 7 Scarlet & Violet", 30, "6YWjn4gRT1brSqKjEpu2HtTpzgk7wEmxpjxDVh49TkJT"],
  ["2025 #098 Emboar PSA 9 White Flare", 31, "4TwuBYq16jyQB8JvFD5oM9mkGJtSgSsLpTFASxPJjE46"],
  ["2023 #006 Charizard EX PSA 10 Japanese 151", 44, "3sKN9cPJyjCYW5GNCN6XxKUnsJRRfukvFX2Zfga3HwVS"],
  ["2023 #137 Porygon Master Ball Reverse Holo CGC 10 Pristine", 44, "Gx5MFME4arxfe4VYgHLEJzeS76sz7xzAPLqWQoH5MpMd"],
  ["1999 #46 Charmander PSA 9 Game", 45, "HytyYBnsAHjwHoaVXfvnq9amU1Hq1TZQZqqnmRXpZa7X"],
  ["2025 #187 Salamence EX CGC 9 Journey Together", 50, "AqaStE3s1ifDTQowirpmxYz13sF6i2Q7VaXVDkh8hKjY"],
  ["2023 #160 Full Art Pikachu PSA 9 Crown Zenith", 51, "DZaCab69vY3yNvNzYJcPRe7emJkdWBwiNeeej4BZjff"],
  ["2019 #SM195 Charizard GX PSA 9 SM Black Star Promo", 57, "8q9m5smkveb23bq9H6J3QtS7oQHVj3Lp37RgdvpNXiMr"],
  ["2025 #075 Eevee EX PSA 10 Prismatic Evolutions", 60, "HUzBm6Gvh5Wtqk5kaQkGfneUVcJ4DRoAxgPyPmdyR1eA"],
  ["2000 #70 Pikachu PSA 9 Neo Genesis", 60, "DFs9JsSkLxa42JU4cir6UHGW6N5C2uJW4EukCHR9ggAY"],
  ["2010 #13 Blastoise-Holo PSA 6 HeartGold & SoulSilver", 65, "2tnYEjzQQMZx1F3hGMNuPxKGkh2DTaXMzoo9Pj6Wgeoi"],
  ["2022 #139 Lugia VSTAR PSA 10 Silver Tempest", 70, "EwhzBm5r7BGBRnbrBdiMLaUba1LExMJQ7S5DoHrEU1BY"],
  ["2023 #GG50 Full Art Darkrai VSTAR PSA 8 Crown Zenith", 70, "CjLusFnVvFWS7Ct1zoWu9ZifzxnEc8jM4C2z41EzgRek"],
  ["2019 #094 Togepi Cleffa Igglybuff GX PSA 10 Tag Team All Stars", 76, "FSgTR96h6EBbydryouCnutNK7DM5nEtEgC1iLsFg7iku"],
  ["2024 #033 Pikachu EX PSA 10 Super Electric Breaker", 77, "2AtzyWVuyBfTtBQfFaLSSZ6CrKhkHJuWeEiUp13QY7LK"],
  ["2024 #051 Jolteon Master Ball Reverse Holo PSA 10 Terastal Fest", 78, "43M4R9jLHV3Vh5BiXPwUKHG4Jys1kzadY7rbpKq3shaN"],
  ["2010 #1 Arcanine-Holo PSA 8 HeartGold & SoulSilver", 79, "3bqj8fk9iFNhKz4QqFUfSgTV1LgiXPu13pCsLpMBKwdx"],
  ["2025 #071 Misty's Psyduck CGC 10 Heat Wave Arena", 80, "9u5ugjZMkUSiQML6c6CGeM5npErZqUgUkixQeZffc765"],
  ["1999 #13 Poliwrath-Holo PSA 6 Game", 80, "AfS7a5TXfWfRKryDGFac8kVqePTJYppvhcWWiu7MtbWL"],
  ["2022 #077 Full Art Snorlax PSA 10 Dark Phantasma", 80, "J6KCDthAHvDTUeGAzCS79U4hqDdcCYtU8Xd7NNT5BYQL"],
  ["2022 #261 Full Art Charizard VMAX PSA 9 Swsh Black Star Promo", 80, "ByhRsGQBpK9QsSaUYYLYARkzwQBMmV1DALvM1bSPg8LE"],
  ["2025 #022 Haunter PSA 10 Mega Starter Set", 85, "DY8JmX9V31hnsWhmQvGDpcQjH5epMrH5Km5cgA5BYZxL"],
  ["2022 #175 Full Art Hisuian Sneasler V PSA 10 Astral Radiance", 85, "8j6ZvmRWGhHHj3mFxWEyycJjoCiJpwdA3QzDtzsM38UR"],
  ["2024 #197 Pikachu CGC 10 Pristine SV-P Promo", 85, "6xKr4pNFs9jvf8bwqwHto8PB4X7xw335oqtcmMFVggwf"],
  ["2024 #203 Iron Leaves EX PSA 10 Temporal Forces", 86, "AXjvMP6nyJgPKbXZ7mE6FyZXr6vXnVLknyyc6WfwdvyN"],
  ["2021 #66 Shining Magikarp-Holo CGC 10 Celebrations", 88, "EiK1sMV33dDz3Lf6rYTwpEbVMWFoCLHKewkH7bbMfEG4"],
  ["1999 #30 Ivysaur Shadowless PSA 9 Game", 89, "FbZW8jUERKvvQmLPscXx6LugGipoboVsrsf8YjVxbm6L"],
  ["2024 #057 Pikachu EX PSA 10 Surging Sparks", 90, "4cuE74Q4eLUhuWBmRpSL311iH4fmBB1hacdCei9DWuvc"],
  ["2023 #229 Dudunsparce PSA 10 Paldea Evolved", 90, "HLSMgVrcTuy7cocnVhsyKKR8zH9XAFCS5zMwWkW9ViRF"],
  ["2000 #14 Rocket's Mewtwo CGC Gym Challenge", 90, "FnGuvT4dKARtbZzHYu6hhAVBpXgycaHWXPMZ8q3uBtux"],
  ["2025 #078 Mega Lucario EX PSA 10 Mega Brave Japanese", 95, "CcVFvuKKrKMUrWtQLPWP15TP5TBeUyWpATUHLkid1p3N"],
  ["2024 #80 AR Gastly CGC 10 Wild Force Japanese", 99, "6aGsMbEBSU8UfyCi3bZz1Nmuh74uitE8Src5QsN4w8JH"],
  ["2000 #12 Misty's Golduck PSA 8 Gym Challenge", 99, "HhvWsUeM82sHdDSCwqHX1XmJ6Dv3SQEwaNkcHAxR5LZp"],
  ["2023 #258 Skeledirge EX PSA 10 Paldea Evolved", 100, "4DeRPgHyTRBPQkg2gK5X2FhdCb4fLMPFU52KAGYTZPF8"],
  ["2016 #378 Eevee CGC 10 Pristine Sun & Moon Promos Japanese", 100, "4AgxrfYyTuReoiFzcsEtLuAHCwoZooijwFaKnKztbNr6"],
  ["2021 #167 Full Art Leafeon V CGC 9.5 Evolving Skies", 100, "3jqVaZZwRh1EiyaG6bVDMjvHaCn6vRMRH1To3NezK5M5"],
  ["2023 #195 Mew EX CGC 10 Pristine 151 Japanese", 100, "HEuiXE2rDHJE8CUxXRwiEr3M5kfgCZifqcNcgfmGRepr"],
  ["2023 #148 Dragonair Master Ball Reverse Holo PSA 10 151 Japanese", 100, "AnoU8mHGjfB3XdvEzS3f3rkGRW3ukBiMqSkCJjeDQRcS"],
  ["2000 #8 LT. Surge's Magneton Holo 1st Edition BGS 8.5 Gym Heroes", 100, "FniFjzxUDSjqjLHUvKcHkYfC2HZk8UJk5ggmbCqzEpTJ"],
  ["2021 #049 Pikachu PSA 10 Evolving Skies", 100, "HKycAq9rbRBE3v6azxrFS2A3rSGtomLXzi5fuzWe8nB7"],
  ["2021 #172 Full Art Shadow Rider Calyrex V PSA 10 Chilling Reign", 100, "HoaPDKhdc9XBvQxh71RNDFH6cBgxyqwFw1V7AQHG1TPz"],
  ["2025 #208 Team Rocket's Moltres EX PSA 10 Destined Rivals", 100, "FEeykYwBAp2beJwoyEhjN88E96GLLqW4rKXsewmeCXsb"],
  ["2025 #173 Eevee PSA 9 SV Black Star Promo", 100, "CKRQiHjAxUahCNBzvhTUmGZhBrRUgT7CEGRYR2ga5Qe1"],
  ["2023 #120 Pikachu PSA 10 SV-P Promo Japanese", 100, "26ShLVrHXm2J48f7ysva51SSRi5LkBTRyekWeomjUM3C"],
  ["2023 #125 Steelix PSA 10 Paradox Rift", 105, "AyqKGH5YTe6EKBsNDaSswTgJomj8T52fJHBewee7QRy3"],
  ["2024 #097 Morty's Conviction PSA 10 Wild Force Korean", 110, "FgATgmfTNDrvHjSDJeHgUMLAMnFTMC9AkUcoe7ajnm8b"],
  ["2019 #072 Greninja & Zoroark GX PSA 10 Tag Team All Stars Japanese", 110, "EeiNbLuiXajUAPDgvuFAHWeHUQu5Ua5vKtqabKuDLMKq"],
  ["2019 #099 Garchomp & Giratina GX PSA 10 Tag Team All Stars Japanese", 111, "yZzDVZR3rTRmtxjTJbKX2sRK77Te2sJ9d3Zbt6dMfnR"],
  ["2021 #113 Full Art Reshiram PSA 10 Celebrations Classic Collection", 115, "FS6qBfNc6YXenkWpyW1zW8Vk14G1miwy3h2ZngVBzHVj"],
  ["2021 #017 Charizard-Holo PSA 10 VMAX Climax Japanese", 117, "AKdELWsNiXjusGwVdSmBgT6a3aR74qkUE7WyEEJr6rgE"],
  ["2005 #61 Larvitar-Reverse Foil PSA 9 EX Unseen Forces", 119, "GkZuUSxt3XgwkXAAZpcht8ieVpLoDxvEfoSj1wj8oip3"],
  ["1996 #82 Magneton-Holo PSA 9 Japanese Basic", 120, "8AsypBAvnGzJN7DxUd1VjUnK1253FZtRStKJQLAbQhzH"],
  ["2021 #127 Pikachu-Reverse Foil PSA 10 Sword & Shield Start Deck 100 Japanese", 120, "DwL5yuKtifzqGj8kgxozVXpbjW9aBUEuwq1B2aapJvkY"],
  ["2005 #032 Articuno EX-Holo PSA 4 Black Star Promos", 125, "aUzNG9GdidQBhFpXJnrKMZoDEazL7qCxUXszvvnRM9D"],
  ["1998 #123 Rocket's Scyther-Holo PSA 9 Japanese Gym", 130, "A84iAbF6dPQ53PixBvHf1e5kEUZgw89rTKnmZDV8ESVD"],
  ["2000 #22 Dark Dragonite 1st Edition PSA 8 Rocket", 136, "iWPk8xGVQzpxLgmTJV7uKhtn5BugMa4k3nBmgkSN82M"],
  ["1999 #3 Mewtwo CGC 10 Game Movie", 145, "5ChapTygkyrezNXcC9nc8QQe1zrPdmHqygY1D3A2WszQ"],
  ["1997 #75 Graveler PSA 10 Japanese Fossil", 160, "A8EB7NEH2e3TcKrxBaANwb6yT9S5xyBdH59v1ZFtLxVC"],
  ["2008 #52 Seviper CGC 10 Perfect Great Encounters Reverse Holo", 170, "7vbxihT1j29YEj5knzE2jyV2DG5ZGDERw9Xb3MfgaRXD"],
  ["2019 #54 Raichu & Alolan Raichu GX PSA 10 Unified Minds", 180, "GtNcSbGHApXxbvhhFF8MY6jFXEpAqidsALRsAaocgUUu"],
  ["2019 #249 Full Art Venusaur & Snivy GX PSA 10 Cosmic Eclipse", 180, "24tgEazxrUYMagfL7cVj2DkLJ6CwwiCLtAfuyJ6Bbddo"],
  ["2021 #4 Charizard CGC 9.5 Celebrations Classic Collection", 180, "GEZjJpUue1pxuA85twcKoZow38UKkrym9k6r5f3PmAF8"],
  ["2021 #4 Charizard Base Set Holo CGC 9.5 Celebrations Classic Collection", 200, "8wKFHpywVzcjk8ca332KBVF4g5seXYHG19sZGmjQB6Wt"],
  ["2019 #126 Mega Sableye & Tyranitar GX PSA 10 Unified Minds", 235, "CJn4E4abyttz2wDH5kUM8tWSxU6HM64i3M1gHwjqjH7s"],
  ["2016 #45 Nidoking-Reverse Foil PSA 10 XY Evolutions", 250, "9xq5oMwb3xdEY5UcRoLcm3pYdT2zauthKM7EXBTF5LHn"],
  ["2005 #94 Dusclops EX-Holo PSA 9 EX Emerald", 258, "5JVj9Fo4hyunuydWzK1DEkqJPEDbNm23TVwUhtk3VyYn"],
  ["2023 #054 Psyduck Master Ball Reverse Holo PSA 10 151 Japanese", 275, "ArTVbjpvWKiySpkGsxJDbALvDMGin6fEg4fmCAWrGtNX"],
  ["2002 #41 Dodrio-Reverse Foil CGC 9 Legendary Collection", 300, "7ysDi3rtHsJKgnjiCrr7LCWhDyfFV2zKDUqrTrFACpWC"],
  ["2023 #169 Charmeleon PSA 10 Mew 151", 499, "2EcjLehP4eFEmJj6xB9NU5rfFXrh5kTNJpEVE1sJn5pa"],
  ["2019 #SM229 Full Art Venusaur & Snivy GX PSA 10 SM Black Star Promo", 499, "HMHjtGxbVEuX8cgMCyS7uf4FGPW5Af2dBeQiLy8ME6N6"],
  ["2021 #030 Full Art Mew PSA 10 25th Anniversary Collection Japanese", 600, "6iK3kDCrBs39pWfkbgnZeNh5AcebRnfvi8C4423iaSaq"],
  ["2019 #SV49 Full Art Charizard GX PSA 10 Hidden Fates", 1799, "cspQGf1oUPcWoas5H4gZ7NXxabdsrcm5kRUQiSQJMaL"],
  ["2025 #288 Victini PSA 10 SV-P Promo Japanese", 1999, "DFsK7ATvTmpgTeiwk3XkBV6ETvPiSeBzxQ2Ytt4V6i1W"],
  ["2000 #3 Brock's Ninetales Holo 1st Edition PSA 10 Gym Challenge", 2300, "7dikRBuG1aLTsfPf9Dgi5MbKRc72BzobqBrRah9uiZLu"],
  ["1999 #15 Venusaur CGC 10 Base Set 1st Edition French", 2495, "CPw1e3huNFaEtQoYhYDgJJHkH3fbawuWCkNUiwRkCWCN"],
  ["2005 #41 Rayquaza PSA 10 Japanese Promo", 3000, "5VQcP5LtB9De4pVkdL64eNHCWVmPDL8ermPgCua95vPP"],
];

const SHAPES = ["spire", "halo", "void", "crescent", "shard"];
const PALETTES = {
  Legendary: { glow: "rgba(212, 173, 91, 0.34)", glowSoft: "rgba(255, 244, 214, 0.88)", core: "#fff5df", ring: "#f2cc7f" },
  Epic: { glow: "rgba(167, 141, 255, 0.34)", glowSoft: "rgba(243, 238, 255, 0.88)", core: "#f6f1ff", ring: "#b5a4ff" },
  Rare: { glow: "rgba(120, 198, 240, 0.34)", glowSoft: "rgba(225, 240, 252, 0.88)", core: "#eef6fc", ring: "#8fc4e8" },
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
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`fetch ${solanaId}: ${res.status}`);
  const html = await res.text();
  const m = html.match(/d1xpxki1g4htqu\.cloudfront\.net\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`no image found for ${solanaId}`);
  return m[1];
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (e) {
        results[idx] = { __error: e.message };
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

console.log(`Resolving ${CARDS.length} cards (concurrency 8)...`);
const resolved = await mapWithConcurrency(CARDS, 8, async ([title, price, solanaId]) => {
  const key = await fetchImageKey(solanaId);
  return { title, price, solanaId, key };
});

const ok = resolved.filter((r) => !r.__error);
const failed = resolved.filter((r) => r.__error);
console.log(`Resolved: ${ok.length}, failed: ${failed.length}`);
if (failed.length) console.log("Failures:", failed);

function buildProduct(entry, index) {
  const rarity = rarityFromPrice(entry.price);
  const shape = SHAPES[index % SHAPES.length];
  const palette = PALETTES[rarity];
  const grade = extractGrade(entry.title);
  const id = slugify(entry.title) || `card-${randomUUID().slice(0, 8)}`;
  const imageUrl = `https://d1xpxki1g4htqu.cloudfront.net/${entry.key}`;
  const timestamp = new Date().toISOString();

  return {
    id,
    title: entry.title,
    rarity,
    price: entry.price,
    currency: "USD",
    stock: 1,
    collection: "Pokémon",
    category: "Trading Card",
    description: `Authentic graded ${grade} trading card sourced from CollectorCrypt's insured vault. Listed value at the time of import: $${entry.price.toLocaleString("en-US")}.`,
    tagline: `Graded ${grade}`,
    defaultDeliveryType: "physical",
    deliveryDigital: "Digital twin delivered to your Rebohrome vault after settlement.",
    deliveryPhysical: "Sealed and shipped from CollectorCrypt's secure vault with full insurance and tracking.",
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

const products = ok.map(buildProduct);
// Deduplicate by id within this batch.
const seen = new Set();
const unique = [];
for (const p of products) {
  if (seen.has(p.id)) {
    console.log(`Dup in batch, skipping: ${p.id}`);
    continue;
  }
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
console.log(`Already in DB: ${existingIds.size}, to insert: ${toInsert.length}`);

const apply = process.argv.includes("--apply");
if (!apply) {
  console.log("\nDRY RUN. Sample:");
  console.log(toInsert.slice(0, 5).map((p) => ({ id: p.id, price: p.price, rarity: p.rarity, image: p.imageUrl })));
  console.log("\nRe-run with --apply to write.");
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
  console.log(`  + ${p.id}  ($${p.price}, ${p.rarity})`);
}

console.log(`\nDone. Inserted ${inserted} products.`);
