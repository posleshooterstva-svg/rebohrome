export const MERCHANTPAYD_METHODS = {
  'cash-app-v4': 'Cash App',
  banking: 'Bank Transfer',
} as const;
export type MerchantMethodCode = keyof typeof MERCHANTPAYD_METHODS;
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
