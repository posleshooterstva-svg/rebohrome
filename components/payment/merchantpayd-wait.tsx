"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { completePaymentRequest } from "@/lib/payments/request-key";
type Status={id:string;requestKey:string;paymentMethod:string;kind:string;status:string;amount:number;currency:string;paymentUrl:string|null;reviewRequired:boolean;message:string|null;resultUrl:string|null};
export function MerchantPaydWait({initial}:{initial:Status}) {
  const [payment,setPayment]=useState(initial),[error,setError]=useState<string|null>(null);
  useEffect(()=>{if(payment.status==='completed')completePaymentRequest(payment.requestKey);},[payment.status,payment.requestKey]);
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
    <h1 className="text-3xl font-semibold">{payment.status==='completed'?'Payment completed':waitingForDelivery?'Payment received':payment.reviewRequired?'Payment under review':`Pay with ${payment.paymentMethod}`}</h1>
    <p className="mt-4 text-2xl">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(payment.amount)}</p>
    <p className="mt-3 text-muted">{waitingForDelivery?'Your payment is confirmed. We are resolving delivery. Do not pay again.':payment.reviewRequired?'Support must check this payment. Do not create another payment.':'Keep this page open while completing payment in the checkout tab. Your status updates automatically.'}</p>
    <p className="mt-3" role="status">{payment.status.replaceAll('_',' ')}{error?` · ${error}`:''}</p>
    {payment.paymentUrl && !payment.reviewRequired && !['completed','paid_unfulfilled','creation_unknown'].includes(payment.status) ? <a className="mt-6 block rounded-xl bg-indigo-600 p-4 text-center text-white" href={payment.paymentUrl} target="_blank" rel="noopener noreferrer">Open {payment.paymentMethod} checkout</a>:null}
    {payment.resultUrl?<Link className="mt-6 block underline" href={payment.resultUrl}>Open receipt</Link>:null}
    <Link className="mt-6 block underline" href="/dashboard/transactions">View transactions</Link>
    {payment.reviewRequired||waitingForDelivery?<Link className="mt-3 block underline" href="/contact">Contact support</Link>:null}
  </section>;
}
