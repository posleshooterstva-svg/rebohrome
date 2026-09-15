import type { MerchantMethodCode } from './merchantpayd-methods.ts';

export type PaymentTerms = {currency:'USD'|'EUR';amountMinor:number;usdAmountMinor:number;eurUsdRate:number};
export function methodCurrency(method:MerchantMethodCode) {return method==='banking'?'EUR':'USD';}

/** Round once to cents, using integer arithmetic and the disclosed site rate. */
export function convertMinor(amount:number,rate:number,direction:'toUsd'|'toEur') {
  if(!Number.isSafeInteger(amount)||amount<0||!Number.isFinite(rate)||rate<=0)throw new Error('Invalid currency conversion.');
  const units=BigInt(Math.round(rate*100_000_000));
  if(units<=BigInt(0))throw new Error('Invalid exchange rate.');
  const numerator=direction==='toUsd'?BigInt(amount)*units:BigInt(amount)*BigInt(100_000_000);
  const denominator=direction==='toUsd'?BigInt(100_000_000):units;
  const result=Number((numerator+denominator/BigInt(2))/denominator);
  if(!Number.isSafeInteger(result))throw new Error('Converted amount is too large.');
  return result;
}
export function paymentTerms(method:MerchantMethodCode,kind:'deposit'|'purchase',amountMinor:number,eurUsdRate:number):PaymentTerms {
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('Payment amount must be positive.');
  if(method!=='banking')return {currency:'USD',amountMinor,usdAmountMinor:amountMinor,eurUsdRate:1};
  const terms={currency:'EUR' as const,amountMinor:kind==='deposit'?amountMinor:convertMinor(amountMinor,eurUsdRate,'toEur'),usdAmountMinor:kind==='deposit'?convertMinor(amountMinor,eurUsdRate,'toUsd'):amountMinor,eurUsdRate};
  if(terms.amountMinor<=0||terms.usdAmountMinor<=0)throw new Error('Payment amount is too small.');
  return terms;
}
/** Old links keep their original USD terms, including pre-EUR banking links. */
export function savedPaymentTerms(snapshot:unknown,usdAmountMinor:number):PaymentTerms {
  const terms=snapshot&&typeof snapshot==='object'&&'paymentTerms' in snapshot?snapshot.paymentTerms:null;
  if(!terms)return {currency:'USD',amountMinor:usdAmountMinor,usdAmountMinor,eurUsdRate:1};
  const value=terms as PaymentTerms;
  if(!['EUR','USD'].includes(value.currency)||!Number.isSafeInteger(value.amountMinor)||value.amountMinor<=0||value.usdAmountMinor!==usdAmountMinor||!Number.isFinite(value.eurUsdRate)||value.eurUsdRate<=0)throw new Error('Invalid saved payment terms.');
  return value;
}
