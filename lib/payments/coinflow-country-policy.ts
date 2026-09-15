export const COINFLOW_ALLOWED_COUNTRY_CODES = [
  "US",
  "CA",
  "FI",
  "FR",
  "PL",
  "ES",
  "GB",
] as const;

export type CoinflowCountryCode = (typeof COINFLOW_ALLOWED_COUNTRY_CODES)[number];

export const COINFLOW_ALLOWED_COUNTRIES = [
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "FI", name: "Finland", flag: "🇫🇮" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
] as const satisfies readonly {
  code: CoinflowCountryCode;
  name: string;
  flag: string;
}[];

const allowedCountryCodes = new Set<string>(
  COINFLOW_ALLOWED_COUNTRIES.map((country) => country.code),
);

export type CoinflowCountryAccessErrorCode =
  | "COUNTRY_REQUIRED"
  | "COUNTRY_NOT_SUPPORTED"
  | "IP_COUNTRY_UNKNOWN"
  | "IP_COUNTRY_NOT_SUPPORTED";

export class CoinflowCountryAccessError extends Error {
  readonly code: CoinflowCountryAccessErrorCode;

  constructor(code: CoinflowCountryAccessErrorCode, message: string) {
    super(message);
    this.name = "CoinflowCountryAccessError";
    this.code = code;
  }
}

export function normalizeCoinflowCountry(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function isCoinflowCountryAllowed(
  value: string | null | undefined,
): value is CoinflowCountryCode {
  return allowedCountryCodes.has(normalizeCoinflowCountry(value));
}

export function getCoinflowCountryName(value: string | null | undefined) {
  const normalized = normalizeCoinflowCountry(value);
  return (
    COINFLOW_ALLOWED_COUNTRIES.find((country) => country.code === normalized)?.name ??
    normalized
  );
}

export function assertCoinflowCountryAccess(input: {
  selectedCountry: string | null | undefined;
  ipCountry: string | null | undefined;
  enforceIpCountry?: boolean;
}): {
  selectedCountry: CoinflowCountryCode;
  ipCountry: CoinflowCountryCode | null;
} {
  const selectedCountry = normalizeCoinflowCountry(input.selectedCountry);
  const ipCountry = normalizeCoinflowCountry(input.ipCountry);
  const enforceIpCountry = input.enforceIpCountry ?? true;

  if (!selectedCountry) {
    throw new CoinflowCountryAccessError(
      "COUNTRY_REQUIRED",
      "Select your country of residence before opening Coinflow checkout.",
    );
  }

  if (!isCoinflowCountryAllowed(selectedCountry)) {
    throw new CoinflowCountryAccessError(
      "COUNTRY_NOT_SUPPORTED",
      "Coinflow checkout is not available for the selected country.",
    );
  }

  if (!enforceIpCountry) {
    return {
      selectedCountry,
      ipCountry: isCoinflowCountryAllowed(ipCountry) ? ipCountry : null,
    };
  }

  if (!ipCountry || ipCountry === "UNKNOWN") {
    throw new CoinflowCountryAccessError(
      "IP_COUNTRY_UNKNOWN",
      "We could not verify your current country by IP address. Disable VPN or proxy and try again.",
    );
  }

  if (!isCoinflowCountryAllowed(ipCountry)) {
    throw new CoinflowCountryAccessError(
      "IP_COUNTRY_NOT_SUPPORTED",
      "Coinflow checkout is not available from your current IP location.",
    );
  }

  return { selectedCountry, ipCountry };
}
