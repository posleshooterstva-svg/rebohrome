import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

function loadEnv() {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

function allocateEvenly(items, totalBps) {
  if (items.length === 0) {
    return [];
  }

  const base = Math.floor(totalBps / items.length);
  let remainder = totalBps - base * items.length;

  return items.map((item) => ({
    productId: item.id,
    probabilityBps: base + (remainder-- > 0 ? 1 : 0),
  }));
}

function buildDistribution(cards, rule) {
  let candidates = cards.filter(
    (card) => card.price >= rule.minimumValue && card.price <= rule.maximumValue,
  );

  if (rule.titlePattern) {
    candidates = candidates.filter((card) => rule.titlePattern.test(card.title));
  }

  if (!rule.bigWinBps || !rule.bigWinMinimumValue) {
    return allocateEvenly(candidates, 10_000);
  }

  const regular = candidates.filter(
    (card) => card.price < rule.bigWinMinimumValue,
  );
  const bigWins = candidates.filter(
    (card) => card.price >= rule.bigWinMinimumValue,
  );

  if (regular.length === 0 || bigWins.length === 0) {
    return allocateEvenly(candidates, 10_000);
  }

  return [
    ...allocateEvenly(regular, 10_000 - rule.bigWinBps),
    ...allocateEvenly(bigWins, rule.bigWinBps),
  ];
}

const WATER_CARD_PATTERN =
  /articuno|blastoise|slowpoke|psyduck|poliwrath|magikarp|gyarados|feraligatr|squirtle|golduck|lugia/i;
const SPORTS_CARD_PATTERN =
  /baseball|basketball|football|soccer|hockey|stadium|festival/i;
const ONE_PIECE_CARD_PATTERN =
  /one piece|bartholomew|luffy|zoro|nami|sanji/i;

const RULES = [
  {
    productId: "starter-pokemon-gacha-pack",
    minimumValue: 13,
    maximumValue: 125,
  },
  {
    productId: "anime-pop-culture-gacha-pack",
    minimumValue: 40,
    maximumValue: 375,
    bigWinMinimumValue: 119,
    bigWinBps: 2_000,
  },
  {
    productId: "sealed-trove-gacha-pack",
    minimumValue: 40,
    maximumValue: 400,
    bigWinMinimumValue: 159,
    bigWinBps: 2_000,
  },
  {
    productId: "water-pokemon-gacha-pack",
    minimumValue: 50,
    maximumValue: 500,
    bigWinMinimumValue: 199,
    bigWinBps: 2_500,
    titlePattern: WATER_CARD_PATTERN,
  },
  {
    productId: "sports-gacha-pack",
    minimumValue: 50,
    maximumValue: 500,
    bigWinMinimumValue: 219,
    bigWinBps: 2_500,
    titlePattern: SPORTS_CARD_PATTERN,
  },
  {
    productId: "one-piece-gacha-pack",
    minimumValue: 150,
    maximumValue: 2_000,
    bigWinMinimumValue: 349,
    bigWinBps: 2_500,
    titlePattern: ONE_PIECE_CARD_PATTERN,
  },
  {
    productId: "legendary-pokemon-gacha-pack",
    minimumValue: 150,
    maximumValue: 2_000,
    bigWinMinimumValue: 499,
    bigWinBps: 2_500,
  },
  {
    productId: "elite-pokemon-gacha-pack",
    minimumValue: 600,
    maximumValue: 3_000,
    bigWinMinimumValue: 999,
    bigWinBps: 2_000,
  },
  {
    productId: "grail-pokemon-gacha-pack",
    minimumValue: 600,
    maximumValue: 8_000,
    bigWinMinimumValue: 1_499,
    bigWinBps: 2_500,
  },
];

const env = loadEnv();
if (!env.DATABASE_URL || !env.DATABASE_AUTH_TOKEN) {
  throw new Error("DATABASE_URL and DATABASE_AUTH_TOKEN are required.");
}

const apply = process.argv.includes("--apply");
const db = createClient({
  url: env.DATABASE_URL,
  authToken: env.DATABASE_AUTH_TOKEN,
});

try {
  const result = await db.execute(
    `select id, title, price
     from products
     where category = 'Trading Card'
       and archived = 0
       and status = 'active'
       and stock > 0
     order by price asc, id asc`,
  );
  const cards = result.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    price: Number(row.price),
  }));
  const timestamp = new Date().toISOString();

  for (const rule of RULES) {
    const distribution = buildDistribution(cards, rule);
    const total = distribution.reduce(
      (sum, outcome) => sum + outcome.probabilityBps,
      0,
    );
    const ready = distribution.length > 1 && total === 10_000;

    console.log(
      `${rule.productId}: ${distribution.length} outcomes, ${(total / 100).toFixed(2)}%, ${
        ready ? "ready" : "paused"
      }`,
    );

    if (!apply) {
      continue;
    }

    await db.execute({
      sql: `update products set
        is_randomized = 1,
        randomized_outcomes_json = ?,
        status = ?,
        updated_at = ?
       where id = ?`,
      args: [
        JSON.stringify(ready ? distribution : []),
        ready ? "active" : "inactive",
        timestamp,
        rule.productId,
      ],
    });
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to publish these probabilities.");
  }
} finally {
  db.close();
}
