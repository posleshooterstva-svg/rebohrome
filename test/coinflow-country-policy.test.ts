import assert from "node:assert/strict";
import test from "node:test";
import {
  COINFLOW_ALLOWED_COUNTRY_CODES,
  COINFLOW_ALLOWED_COUNTRIES,
  CoinflowCountryAccessError,
  assertCoinflowCountryAccess,
  isCoinflowCountryAllowed,
} from "../lib/payments/coinflow-country-policy.ts";

test("keeps the Coinflow country allowlist exact and stable", () => {
  assert.deepEqual(COINFLOW_ALLOWED_COUNTRY_CODES, [
    "US",
    "CA",
    "FI",
    "FR",
    "PL",
    "ES",
    "GB",
  ]);
  assert.equal(COINFLOW_ALLOWED_COUNTRIES.length, 7);
  assert.equal(new Set(COINFLOW_ALLOWED_COUNTRY_CODES).size, 7);
});

test("accepts every allowed country when residence and IP match", () => {
  for (const country of COINFLOW_ALLOWED_COUNTRY_CODES) {
    assert.deepEqual(
      assertCoinflowCountryAccess({
        selectedCountry: country.toLowerCase(),
        ipCountry: country,
      }),
      { selectedCountry: country, ipCountry: country },
    );
    assert.equal(isCoinflowCountryAllowed(country), true);
  }
});

test("rejects missing and unsupported residence countries", () => {
  assert.throws(
    () => assertCoinflowCountryAccess({ selectedCountry: "", ipCountry: "US" }),
    (error: unknown) =>
      error instanceof CoinflowCountryAccessError && error.code === "COUNTRY_REQUIRED",
  );
  assert.throws(
    () => assertCoinflowCountryAccess({ selectedCountry: "DE", ipCountry: "DE" }),
    (error: unknown) =>
      error instanceof CoinflowCountryAccessError &&
      error.code === "COUNTRY_NOT_SUPPORTED",
  );
});

test("fails closed when the IP country is unknown or unsupported", () => {
  assert.throws(
    () => assertCoinflowCountryAccess({ selectedCountry: "US", ipCountry: "Unknown" }),
    (error: unknown) =>
      error instanceof CoinflowCountryAccessError && error.code === "IP_COUNTRY_UNKNOWN",
  );
  assert.throws(
    () => assertCoinflowCountryAccess({ selectedCountry: "US", ipCountry: "DE" }),
    (error: unknown) =>
      error instanceof CoinflowCountryAccessError &&
      error.code === "IP_COUNTRY_NOT_SUPPORTED",
  );
});

test("allows residence and IP to be different when both countries are supported", () => {
  assert.deepEqual(
    assertCoinflowCountryAccess({ selectedCountry: "CA", ipCountry: "US" }),
    { selectedCountry: "CA", ipCountry: "US" },
  );
});

test("supports an explicit local-development IP enforcement override", () => {
  assert.deepEqual(
    assertCoinflowCountryAccess({
      selectedCountry: "FR",
      ipCountry: "Unknown",
      enforceIpCountry: false,
    }),
    { selectedCountry: "FR", ipCountry: null },
  );
});
