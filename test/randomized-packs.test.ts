import assert from "node:assert/strict";
import test from "node:test";
import {
  RANDOMIZED_PACK_POLICIES,
  drawRandomizedOutcome,
  generateRandomizedPackDistribution,
  getRandomizedPackAvailableUnits,
  getRandomizedPackPolicy,
  hasSameRandomizedPackSnapshot,
  selectEligiblePackCandidates,
} from "../lib/randomized-packs.ts";

const candidates = [
  { id: "cheap-a", title: "Pikachu", price: 20 },
  { id: "cheap-b", title: "Bulbasaur", price: 20 },
  { id: "middle", title: "Blastoise", price: 80 },
  { id: "expensive", title: "Charizard", price: 400 },
];

test("keeps all nine pack policies stable and uniquely addressable", () => {
  assert.equal(RANDOMIZED_PACK_POLICIES.length, 9);
  assert.equal(
    new Set(RANDOMIZED_PACK_POLICIES.map((policy) => policy.productId)).size,
    RANDOMIZED_PACK_POLICIES.length,
  );
  assert.deepEqual(
    RANDOMIZED_PACK_POLICIES.map((policy) => policy.productId),
    [
      "starter-pokemon-gacha-pack",
      "anime-pop-culture-gacha-pack",
      "sealed-trove-gacha-pack",
      "water-pokemon-gacha-pack",
      "sports-gacha-pack",
      "one-piece-gacha-pack",
      "legendary-pokemon-gacha-pack",
      "elite-pokemon-gacha-pack",
      "grail-pokemon-gacha-pack",
    ],
  );
});

test("generates a stable complete distribution", () => {
  const first = generateRandomizedPackDistribution({
    packPrice: 100,
    candidates,
    seed: "version-seed",
  });
  const second = generateRandomizedPackDistribution({
    packPrice: 100,
    candidates,
    seed: "version-seed",
  });

  assert.deepEqual(first, second);
  assert.equal(first.totalProbabilityBps, 10_000);
  assert.ok(first.outcomes.every((outcome) => outcome.probabilityBps >= 1));
});

test("never gives a more expensive card a higher probability", () => {
  const distribution = generateRandomizedPackDistribution({
    packPrice: 100,
    candidates,
    seed: "monotonic-seed",
  });
  const ordered = [...distribution.outcomes].sort(
    (left, right) => left.priceSnapshot - right.priceSnapshot,
  );

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].priceSnapshot > ordered[index - 1].priceSnapshot) {
      assert.ok(ordered[index].probabilityBps <= ordered[index - 1].probabilityBps);
    }
  }
});

test("enforces monotonic chances across complete price groups", () => {
  const distribution = generateRandomizedPackDistribution({
    packPrice: 100,
    seed: "group-monotonicity",
    candidates: [
      { id: "cheap-a", title: "A", price: 20 },
      { id: "cheap-b", title: "B", price: 20 },
      { id: "middle-a", title: "C", price: 80 },
      { id: "middle-b", title: "D", price: 80 },
      { id: "expensive", title: "E", price: 500 },
    ],
  });
  for (const expensive of distribution.outcomes) {
    for (const cheaper of distribution.outcomes) {
      if (expensive.priceSnapshot > cheaper.priceSnapshot) {
        assert.ok(expensive.probabilityBps <= cheaper.probabilityBps);
      }
    }
  }
});

test("keeps every available card at or above the 0.01% minimum", () => {
  const distribution = generateRandomizedPackDistribution({
    packPrice: 10,
    seed: "minimum-chance",
    candidates: Array.from({ length: 100 }, (_, index) => ({
      id: `card-${index}`,
      title: `Card ${index}`,
      price: index === 99 ? 1_000_000 : 10 + index,
    })),
  });
  assert.ok(distribution.outcomes.every((outcome) => outcome.probabilityBps >= 1));
  assert.equal(distribution.totalProbabilityBps, 10_000);
});

test("draws against cumulative basis points", () => {
  const outcomes = [
    { id: "first", probabilityBps: 2_500 },
    { id: "second", probabilityBps: 7_500 },
  ];

  assert.equal(drawRandomizedOutcome(outcomes, 0).id, "first");
  assert.equal(drawRandomizedOutcome(outcomes, 2_499).id, "first");
  assert.equal(drawRandomizedOutcome(outcomes, 2_500).id, "second");
  assert.equal(drawRandomizedOutcome(outcomes, 9_999).id, "second");
});

test("applies the configured thematic and price pool", () => {
  const policy = getRandomizedPackPolicy("water-pokemon-gacha-pack");
  assert.ok(policy);
  const selected = selectEligiblePackCandidates(candidates, policy);
  assert.deepEqual(selected.map((candidate) => candidate.id), ["middle"]);
});

test("counts real available units without changing per-card odds", () => {
  assert.equal(
    getRandomizedPackAvailableUnits([
      { id: "a", title: "A", price: 10, availableUnits: 3 },
      { id: "b", title: "B", price: 20, availableUnits: 1 },
    ]),
    4,
  );
});

test("publishes a new immutable version only when its snapshot changes", () => {
  const currentOutcomes = [
    { productId: "a", priceSnapshot: 10, titleSnapshot: "A" },
    { productId: "b", priceSnapshot: 20, titleSnapshot: "B" },
  ];
  assert.equal(
    hasSameRandomizedPackSnapshot({
      currentFormulaVersion: "inverse-price-v1",
      currentOutcomes,
      candidates: [
        { id: "a", title: "A", price: 10, availableUnits: 1 },
        { id: "b", title: "B", price: 20, availableUnits: 9 },
      ],
    }),
    true,
  );
  assert.equal(
    hasSameRandomizedPackSnapshot({
      currentFormulaVersion: "inverse-price-v1",
      currentOutcomes,
      candidates: [
        { id: "a", title: "A", price: 11 },
        { id: "b", title: "B", price: 20 },
      ],
    }),
    false,
  );
});
