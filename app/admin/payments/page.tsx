import Link from 'next/link';
import { getDbClient } from '@/lib/db/client';
import { requireAdminSession } from '@/lib/session';

export const dynamic='force-dynamic';
export default async function PaymentReviewPage(){
 await requireAdminSession();
 const db=getDbClient();
 const intents=(await db.execute("select id,reference_id,kind,amount_minor,status,last_error,created_at from payment_intents where review_required=1 or status in ('paid_unfulfilled','creation_unknown') order by created_at desc limit 100")).rows;
 const inbox=(await db.execute("select id,payment_link_id,event_type,last_error,created_at from payment_inbox where status='unmatched' order by created_at desc limit 100")).rows;
 return <main className="mx-auto max-w-6xl space-y-8 p-6">
  <Link href="/admin" className="underline">Admin overview</Link>
  <h1 className="text-3xl font-semibold">Payment review</h1>
  <p>Confirmed payments with delivery problems remain here for investigation. Retrying checks the provider and applies an unpaid financial effect only once.</p>
  <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Order / deposit</th><th>Amount</th><th>Status</th><th>Issue</th><th>Action</th></tr></thead><tbody>
   {intents.map(row=><tr key={String(row.id)} className="border-b border-line"><td className="py-4">{String(row.reference_id)}</td><td>${(Number(row.amount_minor)/100).toFixed(2)}</td><td>{String(row.status)}</td><td>{String(row.last_error||'Review required')}</td><td><form action="/api/admin/payments/retry" method="post"><input type="hidden" name="intentId" value={String(row.id)}/><button type="submit" className="underline">Check again</button></form></td></tr>)}
  </tbody></table>{!intents.length?<p className="py-4">No payments need review.</p>:null}</div>
  <h2 className="text-xl font-semibold">Unmatched webhook events</h2>
  <p>Match these payment link IDs in RebohromePayment before taking action. Email and payment titles do not establish payment ownership.</p>
  <ul>{inbox.map(row=><li key={String(row.id)} className="break-all border-b border-line py-3">{String(row.payment_link_id)} — {String(row.event_type)} — {String(row.last_error||'Unmatched')}</li>)}</ul>
 </main>;
}
