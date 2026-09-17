export const MERCHANTPAYD_METHODS = {
  'cash-app-v4': 'Cash App',
  banking: 'Bank Transfer',
} as const;
export type MerchantMethodCode = keyof typeof MERCHANTPAYD_METHODS;
/** Closing dismisses an unpaid session; it does not cancel a provider transfer. */
export function isClosableMerchantStatus(status:unknown) {
  return ['pending','attempting','failed','expired'].includes(String(status));
}
export function canCloseMerchantIntent(intent:{status:unknown;provider_transaction_id?:unknown;review_required?:unknown;last_error?:unknown}) {
  // An age-only review flag does not indicate a financial mismatch. Preserve that
  // flag for reconciliation, but allow the user to dismiss the unpaid session.
  const financialReview=Boolean(intent.review_required)&&Boolean(intent.last_error)&&intent.last_error!=='Provider status check failed; will retry.';
  return isClosableMerchantStatus(intent.status)&&!intent.provider_transaction_id&&!financialReview;
}
export function merchantMethodCode(value: unknown): MerchantMethodCode {
  if (value === 'cash-app-v4' || value === 'Cash App' || value === 'Cash App 4') return 'cash-app-v4';
  if (value === 'banking' || value === 'Bank Transfer') return 'banking';
  throw new Error('Unsupported RebohromePayment payment method.');
}
export function savedMerchantMethod(snapshot: unknown): MerchantMethodCode {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Payment snapshot missing.');
  // Intents created before multiple methods were supported used Cash App 4.
  return merchantMethodCode('paymentMethod' in snapshot ? snapshot.paymentMethod : 'cash-app-v4');
}
