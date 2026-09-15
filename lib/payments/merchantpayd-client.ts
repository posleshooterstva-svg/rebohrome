import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { minorUnits } from "./money.ts";
import { MERCHANTPAYD_METHODS, merchantMethodCode, type MerchantMethodCode } from './merchantpayd-methods.ts';
import { methodCurrency } from './payment-terms.ts';

const amount = z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+(?:\.\d+)?$/)]);
const optionalAmount = amount.nullish();
const paymentSchema = z.object({
  id: z.string().uuid().optional(), payment_link_id: z.string().uuid(),
  transaction_id: z.string().min(1).nullish(),
  status: z.enum(["pending", "attempting", "processing", "completed", "failed", "expired"]),
  fiat_base_amount: amount, fiat_total_amount: amount, fiat_currency: z.string().min(3),
  original_amount: optionalAmount, original_currency: z.string().nullish(), exchange_rate: optionalAmount,
  settled_amount: optionalAmount, paid_at: z.string().nullish(),
  payment_url: z.string().optional(), blockchain_tx_hash: z.string().nullish(),
  payment_method: z.object({type:z.string(),brand:z.string().nullish(),card_last_four:z.string().nullish()}).passthrough().nullish(),
}).passthrough();
export type MerchantPayment = z.infer<typeof paymentSchema>;
export type MerchantConfig = {baseUrl:string;apiKey:string;apiSecret:string;webhookSecret:string;method:string;enabled:boolean;banking?:{apiKey:string;apiSecret:string};bankingWebhookSecret?:string};

export function merchantConfig(): MerchantConfig {
  return {
    baseUrl: (process.env.MERCHANTPAYD_API_BASE_URL || "https://api.merchantpayd.com").replace(/\/+$/, ""),
    apiKey: process.env.MERCHANTPAYD_API_KEY?.trim() || "",
    apiSecret: process.env.MERCHANTPAYD_API_SECRET?.trim() || "",
    webhookSecret: process.env.MERCHANTPAYD_WEBHOOK_SECRET?.trim() || "",
    method: process.env.MERCHANTPAYD_PAYMENT_METHOD?.trim() || "cash-app-v4",
    enabled: process.env.MERCHANTPAYD_ENABLED === "true",
    banking: {
      apiKey: process.env.MERCHANTPAYD_BANKING_API_KEY?.trim() || "",
      apiSecret: process.env.MERCHANTPAYD_BANKING_API_SECRET?.trim() || "",
    },
    bankingWebhookSecret: process.env.MERCHANTPAYD_BANKING_WEBHOOK_SECRET?.trim() || "",
  };
}
export class MerchantApiError extends Error {
  constructor(message:string, publicStatus:number, ambiguous=false) { super(message); this.httpStatus=publicStatus; this.ambiguous=ambiguous; }
  httpStatus:number; ambiguous:boolean;
}

export function verifyMerchantSignature(raw: Uint8Array, header: string | null, secret: string) {
  if (!secret || !header || !/^sha256=[a-fA-F0-9]{64}$/.test(header)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(header.slice(7), "hex"));
}

export function validatePaymentUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid checkout URL.");
  return url.toString();
}

export function verifyPaymentAmount(payment: MerchantPayment, expectedMinor: number, expectedMethod: MerchantMethodCode = 'cash-app-v4',expectedCurrency:'USD'|'EUR'='USD') {
  if(expectedMethod==='banking'&&expectedCurrency==='EUR'&&(payment.fiat_currency!=='EUR'||minorUnits(payment.fiat_base_amount)!==expectedMinor))throw new Error('Bank Transfer amount must match the agreed EUR amount.');
  const converted = payment.original_currency != null || payment.original_amount != null;
  if (converted) {
    if (payment.original_currency !== expectedCurrency || minorUnits(payment.original_amount) !== expectedMinor || !payment.exchange_rate || Number(payment.exchange_rate) <= 0)
      throw new Error("Payment original amount/currency mismatch.");
  } else if (payment.fiat_currency !== expectedCurrency || minorUnits(payment.fiat_base_amount) !== expectedMinor) {
    throw new Error("Payment amount/currency mismatch.");
  }
  if (Number(payment.fiat_base_amount) <= 0 || Number(payment.fiat_total_amount) < Number(payment.fiat_base_amount))
    throw new Error("Invalid provider totals.");
  if (payment.payment_method?.type && payment.payment_method.type !== expectedMethod) throw new Error("Payment method mismatch.");
}

export function merchantClient(config: MerchantConfig, transport: typeof fetch = fetch) {
  async function request(path: string, method: MerchantMethodCode, body?: unknown) {
    const credentials = method === 'banking' ? config.banking : config;
    if (!credentials?.apiKey || !credentials.apiSecret || new URL(config.baseUrl).protocol !== "https:") throw new MerchantApiError(`${MERCHANTPAYD_METHODS[method]} is not configured in RebohromePayment.`,503);
    let response: Response;
    try {
      response = await transport(`${config.baseUrl}${path}`, {
        method: body ? "POST" : "GET", redirect:"error", cache:"no-store",
        headers:{"X-API-Key":credentials.apiKey,"X-API-Secret":credentials.apiSecret,"Content-Type":"application/json"},
        body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(15_000),
      });
    } catch { throw new MerchantApiError("Payment provider did not return a confirmed result.",502,Boolean(body)); }
    if (!response.ok) {
      if (response.status === 422) {
        const rejected = await response.json().catch(() => null);
        // Translate known validation failures; never expose arbitrary upstream bodies,
        // which can contain customer data, credentials or internal diagnostics.
        const disabled = typeof rejected?.message === 'string'
          ? /^payment_method '(cash-app-v4|banking)' is not enabled for this project$/.exec(rejected.message)
          : null;
        const message = disabled
          ? `${MERCHANTPAYD_METHODS[disabled[1] as MerchantMethodCode]} is not enabled for this project by RebohromePayment. Please choose another payment method or contact support.`
          : 'RebohromePayment rejected the payment details. Please check the amount and your account email, or contact support.';
        throw new MerchantApiError(message, 422);
      }
      throw new MerchantApiError(`Payment provider returned HTTP ${response.status}.`,502,Boolean(body) && ![401,403].includes(response.status));
    }
    try {
      const json = await response.json();
      if (json.success !== true) throw new Error("Invalid response.");
      const data = paymentSchema.parse(json.data);
      if (data.id && data.id !== data.payment_link_id) throw new Error("Provider identifiers mismatch.");
      return data;
    } catch { throw new MerchantApiError("Invalid payment provider response.",502,Boolean(body)); }
  }
  return {
    async create(input:{amountMinor:number;email:string;title:string;description:string;intentId:string;paymentMethod?:MerchantMethodCode}) {
      const method=merchantMethodCode(input.paymentMethod ?? config.method);
      const currency=methodCurrency(method);
      const result = await request("/api/v1/payment/create",method,{
        title:input.title,description:input.description,amount:input.amountMinor / 100,currency,
        payment_method:method,customer_details:{email:input.email},is_price_dynamic:false,
        metadata:{intent_id:input.intentId},
      });
      if (!result.payment_url) throw new MerchantApiError("Missing checkout URL.",502,true);
      try { validatePaymentUrl(result.payment_url); verifyPaymentAmount(result,input.amountMinor,method,currency); }
      catch { throw new MerchantApiError("Payment link does not match the requested payment.",502,true); }
      return result;
    },
    status(id:string,method:MerchantMethodCode=merchantMethodCode(config.method)) { if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid payment link id."); return request(`/api/v1/payment/status/${encodeURIComponent(id)}`,method); },
  };
}
