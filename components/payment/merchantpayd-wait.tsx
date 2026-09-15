"use client";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useEffect,useState } from "react";
import { completePaymentRequest } from "@/lib/payments/request-key";
type Status={id:string;requestKey:string;paymentMethod:string;kind:string;status:string;amount:number;currency:string;usdAmount:number;eurUsdRate:number;paymentUrl:string|null;closedAt:string|null;canClose:boolean;reviewRequired:boolean;message:string|null;resultUrl:string|null};
export function MerchantPaydWait({initial}:{initial:Status}) {
  const [payment,setPayment]=useState(initial),[error,setError]=useState<string|null>(null);
  const router=useRouter();const [closing,setClosing]=useState(false);
  useEffect(()=>{if(payment.status==='completed'||payment.closedAt)completePaymentRequest(payment.requestKey);},[payment.status,payment.closedAt,payment.requestKey]);
  async function closeSession(){
    setClosing(true);setError(null);
    try{
      const response=await fetch('/api/payments/cancel-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:payment.id,type:payment.kind})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to close payment session.');
      completePaymentRequest(payment.requestKey);router.push(payment.kind==='deposit'?'/dashboard/deposit':'/checkout');router.refresh();
    }catch(error){setError(error instanceof Error?error.message:'Unable to close payment session.');setClosing(false);}
  }
  useEffect(()=>{
    let canceled=false,timer:ReturnType<typeof setTimeout>;let interval=5000;
    const controller=new AbortController();
    async function poll() {
      if (document.visibilityState!=='visible') {timer=setTimeout(poll,5000);return;}
      try {
        const response=await fetch(`/api/payments/merchantpayd/session/${encodeURIComponent(initial.id)}`,{cache:'no-store',signal:controller.signal});
        if (!response.ok) throw new Error('Could not check payment status.');
        const result=await response.json() as Status;
        if (canceled) return;
        setPayment(result);setError(null);interval=5000;
        if (result.status==='completed') return;
      } catch {if (!canceled) {setError('Could not check payment status. Retrying.');interval=Math.min(interval*2,60000);}}
      if (!canceled) timer=setTimeout(poll,interval);
    }
    if (initial.status!=='completed') timer=setTimeout(poll,5000);
    return ()=>{canceled=true;controller.abort();clearTimeout(timer);};
  },[initial.id,initial.status]);
  const waitingForDelivery=payment.status==='paid_unfulfilled';
  return <section className="mx-auto my-12 max-w-xl rounded-3xl border border-line bg-panel p-8">
    <h1 className="text-3xl font-semibold">{payment.status==='completed'?'Payment completed':waitingForDelivery?'Payment received':payment.closedAt?'Payment session closed':payment.reviewRequired?'Payment under review':`Pay with ${payment.paymentMethod}`}</h1>
    <p className="mt-4 text-2xl">{new Intl.NumberFormat('en-US',{style:'currency',currency:payment.currency}).format(payment.amount)}</p>
    {payment.currency==='EUR'?<p className="mt-2 text-sm text-muted">Site rate: 1 EUR = {payment.eurUsdRate} USD. {payment.kind==='deposit'?'Balance credit':'Order value'}: {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(payment.usdAmount)}.</p>:null}
    <p className="mt-3 text-muted">{waitingForDelivery?'Your payment is confirmed. We are resolving delivery. Do not pay again.':payment.closedAt?'Do not pay the old link. Any late payment will still be checked.':payment.reviewRequired?'Support must check this payment. Do not create another payment.':'Keep this page open while completing payment in the checkout tab. Your status updates automatically.'}</p>
    <p className="mt-3" role="status">{payment.status.replaceAll('_',' ')}{error?` · ${error}`:''}</p>
    {payment.paymentUrl && !payment.closedAt && !payment.reviewRequired && !['completed','paid_unfulfilled','creation_unknown'].includes(payment.status) ? <a className="mt-6 block rounded-xl bg-indigo-600 p-4 text-center text-white" href={payment.paymentUrl} target="_blank" rel="noopener noreferrer">Open {payment.paymentMethod} checkout</a>:null}
    {payment.canClose?<><p className="mt-5 text-sm text-muted">If you have not paid, you can close this session. Closing it does not cancel a transfer already sent.</p><button className="mt-3 underline disabled:opacity-50" disabled={closing} onClick={closeSession}>{closing?'Closing...':'Close session'}</button></>:null}
    {payment.closedAt&&payment.status!=='completed'?<Link className="mt-6 block underline" href={payment.kind==='deposit'?'/dashboard/deposit':'/checkout'}>Return to payment methods</Link>:null}
    {payment.resultUrl?<Link className="mt-6 block underline" href={payment.resultUrl}>Open receipt</Link>:null}
    <Link className="mt-6 block underline" href="/dashboard/transactions">View transactions</Link>
    {payment.reviewRequired||waitingForDelivery?<Link className="mt-3 block underline" href="/contact">Contact support</Link>:null}
  </section>;
}
