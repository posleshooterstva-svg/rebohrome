import { createHash } from "crypto";

export const RANDOMIZED_PACK_TOTAL_BPS = 10_000;
export const RANDOMIZED_PACK_FORMULA_VERSION = "inverse-price-v1";

export type RandomizedPackCandidate = {
  id: string;
  title: string;
  price: number;
  availableUnits?: number;
};

export type RandomizedPackPolicy = {
  productId: string;
  publicTitle: string;
  minimumValue: number;
  maximumValue: number;
  titlePattern?: RegExp;
};

export type GeneratedRandomizedPackOutcome = {
  productId: string;
  probabilityBps: number;
  priceSnapshot: number;
  titleSnapshot: string;
};

export type GeneratedRandomizedPackDistribution = {
  outcomes: GeneratedRandomizedPackOutcome[];
  totalProbabilityBps: number;
  expectedValue: number;
  bigWinProbabilityBps: number;
};

const WATER_CARD_PATTERN =
  /articuno|blastoise|slowpoke|psyduck|poliwrath|magikarp|gyarados|feraligatr|squirtle|golduck|lugia|vaporeon|suicune|kyogre|lapras/i;

export const RANDOMIZED_PACK_POLICIES: readonly RandomizedPackPolicy[] = [
  {
    productId: "starter-pokemon-gacha-pack",
    publicTitle: "Starter Pokemon Gacha Pack",
    minimumValue: 13,
    maximumValue: 125,
  },
  {
    productId: "anime-pop-culture-gacha-pack",
    publicTitle: "Pokemon Discovery Gacha Pack",
    minimumValue: 40,
    maximumValue: 375,
  },
  {
    productId: "sealed-trove-gacha-pack",
    publicTitle: "Sealed Trove Pokemon Gacha Pack",
    minimumValue: 40,
    maximumValue: 400,
  },
  {
    productId: "water-pokemon-gacha-pack",
    publicTitle: "Water Pokemon Gacha Pack",
    minimumValue: 50,
    maximumValue: 500,
    titlePattern: WATER_CARD_PATTERN,
  },
  {
    productId: "sports-gacha-pack",
    publicTitle: "Pokemon Premium Gacha Pack",
    minimumValue: 50,
    maximumValue: 500,
  },
  {
    productId: "one-piece-gacha-pack",
    publicTitle: "Pokemon Master Gacha Pack",
    minimumValue: 150,
    maximumValue: 2_000,
  },
  {
    productId: "legendary-pokemon-gacha-pack",
    publicTitle: "Legendary Pokemon Gacha Pack",
    minimumValue: 150,
    maximumValue: 2_000,
  },
  {
    productId: "elite-pokemon-gacha-pack",
    publicTitle: "Elite Pokemon Gacha Pack",
    minimumValue: 600,
    maximumValue: 3_000,
  },
  {
    productId: "grail-pokemon-gacha-pack",
    publicTitle: "Grail Pokemon Gacha Pack",
    minimumValue: 600,
    maximumValue: 8_000,
  },
] as const;

export function getRandomizedPackPolicy(productId: string) {
  return RANDOMIZED_PACK_POLICIES.find((policy) => policy.productId === productId) ?? null;
}

export function selectEligiblePackCandidates(
  candidates: RandomizedPackCandidate[],
  policy: RandomizedPackPolicy,
) {
  return candidates
    .filter((candidate) => {
      if (
        candidate.id === policy.productId ||
        !Number.isFinite(candidate.price) ||
        candidate.price < policy.minimumValue ||
        candidate.price > policy.maximumValue ||
        (candidate.availableUnits !== undefined && candidate.availableUnits <= 0)
      ) {
        return false;
      }

      return policy.titlePattern ? policy.titlePattern.test(candidate.title) : true;
    })
    .sort((left, right) => left.price - right.price || left.id.localeCompare(right.id));
}

export function getRandomizedPackAvailableUnits(candidates: RandomizedPackCandidate[]) {
  return candidates.reduce(
    (total, candidate) => total + Math.max(0, Math.floor(candidate.availableUnits ?? 1)),
    0,
  );
}

export function hasSameRandomizedPackSnapshot(input: {
  currentFormulaVersion: string | null;
  currentOutcomes: Array<{ productId: string; priceSnapshot: number; titleSnapshot: string }>;
  candidates: RandomizedPackCandidate[];
}) {
  if (input.currentFormulaVersion !== RANDOMIZED_PACK_FORMULA_VERSION) return false;
  if (input.currentOutcomes.length !== input.candidates.length) return false;

  const current = [...input.currentOutcomes].sort((left, right) =>
    left.productId.localeCompare(right.productId),
  );
  const next = [...input.candidates].sort((left, right) => left.id.localeCompare(right.id));
  return current.every((outcome, index) => {
    const candidate = next[index];
    return (
      outcome.productId === candidate.id &&
      outcome.priceSnapshot === candidate.price &&
      outcome.titleSnapshot === candidate.title
    );
  });
}

function seededUnitInterval(seed: string, productId: string) {
  const digest = createHash("sha256").update(`${seed}:${productId}`).digest();
  return digest.readUInt32BE(0) / 0xffff_ffff;
}

function applyMonotonicRepair(allocated: GeneratedRandomizedPackOutcome[]) {
  const sorted = [...allocated].sort(
    (left, right) => left.priceSnapshot - right.priceSnapshot || left.productId.localeCompare(right.productId),
  );
  let reclaimed = 0;
  let previousPrice: number | null = null;
  let cheaperGroupCeiling = Number.POSITIVE_INFINITY;
  let currentGroup: GeneratedRandomizedPackOutcome[] = [];

  for (const current of sorted) {
    if (previousPrice !== null && current.priceSnapshot !== previousPrice) {
      cheaperGroupCeiling = Math.min(
        cheaperGroupCeiling,
        ...currentGroup.map((outcome) => outcome.probabilityBps),
      );
      currentGroup = [];
    }
    if (current.probabilityBps > cheaperGroupCeiling) {
      reclaimed += current.probabilityBps - cheaperGroupCeiling;
      current.probabilityBps = cheaperGroupCeiling;
    }
    currentGroup.push(current);
    previousPrice = current.priceSnapshot;
  }

  if (reclaimed > 0) {
    const cheapestPrice = sorted[0].priceSnapshot;
    const cheapest = sorted.filter((outcome) => outcome.priceSnapshot === cheapestPrice);
    for (let index = 0; index < reclaimed; index += 1) {
      cheapest[index % cheapest.length].probabilityBps += 1;
    }
  }

  return sorted;
}

export function generateRandomizedPackDistribution(input: {
  packPrice: number;
  candidates: RandomizedPackCandidate[];
  seed: string;
}): GeneratedRandomizedPackDistribution {
  const { candidates, packPrice, seed } = input;
  if (!Number.isFinite(packPrice) || packPrice <= 0) {
    throw new Error("Randomized pack price must be greater than zero.");
  }
  if (candidates.length < 2) {
    throw new Error("A randomized pack requires at least two eligible cards.");
  }
  if (candidates.length > RANDOMIZED_PACK_TOTAL_BPS) {
    throw new Error("A randomized pack cannot contain more than 10,000 outcomes.");
  }

  const uniqueIds = new Set(candidates.map((candidate) => candidate.id));
  if (uniqueIds.size !== candidates.length) {
    throw new Error("Randomized pack outcomes must be unique.");
  }

  const priceGroupSizes = new Map<number, number>();
  for (const candidate of candidates) {
    priceGroupSizes.set(candidate.price, (priceGroupSizes.get(candidate.price) ?? 0) + 1);
  }
  const weighted = candidates.map((candidate) => {
    const relativePrice = Math.max(candidate.price / packPrice, 0.000_001);
    const jitter =
      (priceGroupSizes.get(candidate.price) ?? 0) > 1
        ? 0.92 + seededUnitInterval(seed, candidate.id) * 0.16
        : 1;
    return {
      candidate,
      rawWeight: Math.pow(1 / relativePrice, 1.15) * jitter,
    };
  });
  const rawTotal = weighted.reduce((sum, entry) => sum + entry.rawWeight, 0);
  const distributable = RANDOMIZED_PACK_TOTAL_BPS - candidates.length;
  const floors = weighted.map((entry) => {
    const exact = (entry.rawWeight / rawTotal) * distributable;
    return {
      ...entry,
      probabilityBps: 1 + Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining =
    RANDOMIZED_PACK_TOTAL_BPS - floors.reduce((sum, entry) => sum + entry.probabilityBps, 0);
  const remainderOrder = [...floors].sort(
    (left, right) => right.remainder - left.remainder || left.candidate.id.localeCompare(right.candidate.id),
  );
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    remainderOrder[index % remainderOrder.length].probabilityBps += 1;
  }

  const outcomes = applyMonotonicRepair(
    floors.map((entry) => ({
      productId: entry.candidate.id,
      probabilityBps: entry.probabilityBps,
      priceSnapshot: entry.candidate.price,
      titleSnapshot: entry.candidate.title,
    })),
  );
  const totalProbabilityBps = outcomes.reduce(
    (sum, outcome) => sum + outcome.probabilityBps,
    0,
  );
  if (totalProbabilityBps !== RANDOMIZED_PACK_TOTAL_BPS) {
    throw new Error("Generated randomized pack probabilities do not total 100%.");
  }

  return {
    outcomes,
    totalProbabilityBps,
    expectedValue: outcomes.reduce(
      (sum, outcome) => sum + (outcome.priceSnapshot * outcome.probabilityBps) / 10_000,
      0,
    ),
    bigWinProbabilityBps: outcomes
      .filter((outcome) => outcome.priceSnapshot > packPrice)
      .reduce((sum, outcome) => sum + outcome.probabilityBps, 0),
  };
}

export function drawRandomizedOutcome<T extends { probabilityBps: number }>(
  outcomes: readonly T[],
  roll: number,
) {
  if (!Number.isInteger(roll) || roll < 0 || roll >= RANDOMIZED_PACK_TOTAL_BPS) {
    throw new Error("Randomized pack roll must be an integer between 0 and 9,999.");
  }

  let cursor = 0;
  for (const outcome of outcomes) {
    cursor += outcome.probabilityBps;
    if (roll < cursor) return outcome;
  }

  throw new Error("Randomized pack distribution is incomplete.");
}

export function buildRandomizedPackCopy(input: {
  policy: RandomizedPackPolicy;
  outcomeCount: number;
  bigWinProbabilityBps: number;
  minimumOutcomeValue?: number;
  maximumOutcomeValue?: number;
}) {
  const bigWinPercent = (input.bigWinProbabilityBps / 100).toFixed(2);
  const minimumValue = input.minimumOutcomeValue ?? input.policy.minimumValue;
  const maximumValue = input.maximumOutcomeValue ?? input.policy.maximumValue;
  return {
    description: `One authenticated Pokemon card is selected from ${input.outcomeCount} currently available cards valued from $${minimumValue} to $${maximumValue}. The complete per-card probabilities are published before checkout. The current chance of receiving a card valued above the pack price is ${bigWinPercent}%.`,
    tagline: `1 authenticated Pokemon card - ${bigWinPercent}% current Big Win chance`,
  };
}
