import { createClient, type Transaction } from "@libsql/client";
import { promises as fs } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import {
  RANDOMIZED_PACK_FORMULA_VERSION,
  RANDOMIZED_PACK_POLICIES,
  buildRandomizedPackCopy,
  generateRandomizedPackDistribution,
  getRandomizedPackAvailableUnits,
  selectEligiblePackCandidates,
  type GeneratedRandomizedPackDistribution,
  type RandomizedPackCandidate,
  type RandomizedPackPolicy,
} from "../lib/randomized-packs.ts";
import {
  RANDOMIZED_PACK_CREATE_STATEMENTS,
  RANDOMIZED_PACK_ORDER_ITEM_COLUMNS,
} from "../lib/randomized-pack-schema.ts";

type PackAnalysis = {
  policy: RandomizedPackPolicy;
  packPrice: number | null;
  eligible: RandomizedPackCandidate[];
  seed: string | null;
  distribution: GeneratedRandomizedPackDistribution | null;
  errors: string[];
};

function parseEnv(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function insertVersion(input: {
  transaction: Transaction;
  analysis: PackAnalysis;
  version: number;
  timestamp: string;
}) {
  const { analysis, timestamp, transaction, version } = input;
  if (!analysis.seed || !analysis.distribution) {
    throw new Error(`${analysis.policy.productId} does not have a valid draft.`);
  }

  const versionId = randomUUID();
  await transaction.execute({
    sql: `insert into randomized_pack_versions (
      id, pack_product_id, version, status, seed, formula_version,
      total_probability_bps, expected_value, big_win_probability_bps,
      created_at, published_at
    ) values (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, null)`,
    args: [
      versionId,
      analysis.policy.productId,
      version,
      analysis.seed,
      RANDOMIZED_PACK_FORMULA_VERSION,
      analysis.distribution.totalProbabilityBps,
      analysis.distribution.expectedValue,
      analysis.distribution.bigWinProbabilityBps,
      timestamp,
    ],
  });
  for (const [index, outcome] of analysis.distribution.outcomes.entries()) {
    await transaction.execute({
      sql: `insert into randomized_pack_outcomes (
        id, version_id, outcome_product_id, probability_bps,
        price_snapshot, title_snapshot, ordinal
      ) values (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        versionId,
        outcome.productId,
        outcome.probabilityBps,
        outcome.priceSnapshot,
        outcome.titleSnapshot,
        index,
      ],
    });
  }
  return versionId;
}

async function main() {
  const root = process.cwd();
  const publish = process.argv.includes("--publish");
  const localEnv = await fs.readFile(path.join(root, ".env.local"), "utf8").catch(() => "");
  const env = { ...parseEnv(localEnv), ...process.env };
  const url = env.DATABASE_URL || env.LOCAL_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or LOCAL_DATABASE_URL is required.");

  const client = createClient({
    url,
    authToken: env.DATABASE_AUTH_TOKEN || undefined,
  });
  try {
    for (const statement of RANDOMIZED_PACK_CREATE_STATEMENTS) {
      await client.execute(statement);
    }
    for (const definition of [
      "is_randomized integer not null default 0",
      "randomized_outcomes_json text not null default '[]'",
    ]) {
      await client.execute(`alter table products add column ${definition}`).catch((error) => {
        if (!String(error).toLowerCase().includes("duplicate column")) throw error;
      });
    }
    for (const definition of RANDOMIZED_PACK_ORDER_ITEM_COLUMNS) {
      await client.execute(`alter table order_items add column ${definition}`).catch((error) => {
        if (!String(error).toLowerCase().includes("duplicate column")) throw error;
      });
    }

    const cardsResult = await client.execute(
      `select id, title, price, stock from products
       where category = 'Trading Card' and archived = 0 and status = 'active' and stock > 0
       order by price asc, id asc`,
    );
    const candidates: RandomizedPackCandidate[] = cardsResult.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      price: Number(row.price),
      availableUnits: Number(row.stock),
    }));
    const analyses: PackAnalysis[] = [];

    for (const policy of RANDOMIZED_PACK_POLICIES) {
      const packResult = await client.execute({
        sql: "select id, price from products where id = ? and archived = 0 limit 1",
        args: [policy.productId],
      });
      const pack = packResult.rows[0];
      const eligible = selectEligiblePackCandidates(candidates, policy);
      const errors: string[] = [];
      const packPrice = pack ? Number(pack.price) : null;
      if (!pack) errors.push("Pack product is missing.");
      if (pack && (!Number.isFinite(packPrice) || Number(packPrice) <= 0)) {
        errors.push("Pack price must be greater than zero.");
      }
      if (eligible.length < 2) errors.push("At least two eligible cards are required.");

      let seed: string | null = null;
      let distribution: GeneratedRandomizedPackDistribution | null = null;
      if (errors.length === 0 && packPrice !== null) {
        seed = randomBytes(32).toString("hex");
        try {
          distribution = generateRandomizedPackDistribution({
            packPrice,
            candidates: eligible,
            seed,
          });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Distribution generation failed.");
        }
      }
      analyses.push({ policy, packPrice, eligible, seed, distribution, errors });
    }

    const allPacksValid =
      analyses.length === RANDOMIZED_PACK_POLICIES.length &&
      analyses.every((analysis) => analysis.errors.length === 0 && analysis.distribution);
    const report = {
      generatedAt: new Date().toISOString(),
      mode: publish ? "publish" : "draft",
      expectedPackCount: RANDOMIZED_PACK_POLICIES.length,
      validPackCount: analyses.filter((analysis) => analysis.errors.length === 0).length,
      allPacksValid,
      packs: analyses.map((analysis) => ({
        productId: analysis.policy.productId,
        publicTitle: analysis.policy.publicTitle,
        packPrice: analysis.packPrice,
        eligibleCardCount: analysis.eligible.length,
        availableUnits: getRandomizedPackAvailableUnits(analysis.eligible),
        totalProbabilityBps: analysis.distribution?.totalProbabilityBps ?? 0,
        expectedValue: analysis.distribution?.expectedValue ?? null,
        bigWinProbabilityBps: analysis.distribution?.bigWinProbabilityBps ?? null,
        errors: analysis.errors,
      })),
    };
    const artifactDirectory = path.join(root, "artifacts");
    await fs.mkdir(artifactDirectory, { recursive: true });
    await fs.writeFile(
      path.join(artifactDirectory, "randomized-pack-migration-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );

    if (publish && !allPacksValid) {
      throw new Error(
        `Publication blocked: ${report.validPackCount}/${report.expectedPackCount} packs are valid. Review artifacts/randomized-pack-migration-report.json.`,
      );
    }

    const timestamp = new Date().toISOString();
    const transaction = await client.transaction("write");
    try {
      for (const analysis of analyses.filter((entry) => entry.errors.length === 0)) {
        const { policy, distribution } = analysis;
        if (!distribution) continue;
        await transaction.execute({
          sql: `insert into randomized_pack_policies (
            pack_product_id, minimum_value, maximum_value, title_pattern,
            formula_version, enabled, created_at, updated_at
          ) values (?, ?, ?, ?, ?, 1, ?, ?)
          on conflict(pack_product_id) do update set
            minimum_value = excluded.minimum_value,
            maximum_value = excluded.maximum_value,
            title_pattern = excluded.title_pattern,
            formula_version = excluded.formula_version,
            enabled = 1,
            updated_at = excluded.updated_at`,
          args: [
            policy.productId,
            policy.minimumValue,
            policy.maximumValue,
            policy.titlePattern?.source ?? null,
            RANDOMIZED_PACK_FORMULA_VERSION,
            timestamp,
            timestamp,
          ],
        });
        const versionResult = await transaction.execute({
          sql: "select coalesce(max(version), 0) as version from randomized_pack_versions where pack_product_id = ?",
          args: [policy.productId],
        });
        const version = Number(versionResult.rows[0]?.version ?? 0) + 1;
        const versionId = await insertVersion({ transaction, analysis, version, timestamp });

        if (publish) {
          const copy = buildRandomizedPackCopy({
            policy,
            outcomeCount: distribution.outcomes.length,
            bigWinProbabilityBps: distribution.bigWinProbabilityBps,
            minimumOutcomeValue: Math.min(
              ...distribution.outcomes.map((outcome) => outcome.priceSnapshot),
            ),
            maximumOutcomeValue: Math.max(
              ...distribution.outcomes.map((outcome) => outcome.priceSnapshot),
            ),
          });
          await transaction.execute({
            sql: `update randomized_pack_versions set status = 'retired'
              where pack_product_id = ? and status = 'published'`,
            args: [policy.productId],
          });
          await transaction.execute({
            sql: "update randomized_pack_versions set status = 'published', published_at = ? where id = ?",
            args: [timestamp, versionId],
          });
          await transaction.execute({
            sql: `update products set title = ?, description = ?, tagline = ?,
              is_randomized = 1, randomized_outcomes_json = ?, stock = ?,
              status = 'active', updated_at = ? where id = ?`,
            args: [
              policy.publicTitle,
              copy.description,
              copy.tagline,
              JSON.stringify(
                distribution.outcomes.map((outcome) => ({
                  productId: outcome.productId,
                  probabilityBps: outcome.probabilityBps,
                })),
              ),
              getRandomizedPackAvailableUnits(analysis.eligible),
              timestamp,
              policy.productId,
            ],
          });
        }
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    console.log(
      publish
        ? `Published ${analyses.length} validated randomized pack versions.`
        : `Created ${report.validPackCount} draft versions. No product or sales state was changed.`,
    );
    console.log("Report: artifacts/randomized-pack-migration-report.json");
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
