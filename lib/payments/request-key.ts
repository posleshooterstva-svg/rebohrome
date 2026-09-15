/** Persist keys across retries, including an interrupted browser request. */
export function paymentRequestKey(userId:string,fingerprint:string) {
  const key=`rebohrome-payment:${userId}:${fingerprint}`;
  const previous=window.sessionStorage.getItem(key);
  if (previous) return previous;
  const id=crypto.randomUUID();window.sessionStorage.setItem(key,id);return id;
}
export function completePaymentRequest(key:string) {
  for (let index=window.sessionStorage.length-1;index>=0;index--) {
    const name=window.sessionStorage.key(index);
    if (name?.startsWith('rebohrome-payment:') && window.sessionStorage.getItem(name)===key) window.sessionStorage.removeItem(name);
  }
}
