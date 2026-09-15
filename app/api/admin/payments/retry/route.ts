import { NextResponse } from 'next/server';
import { getSessionState } from '@/lib/session';
import { getMerchantEngine } from '@/lib/server/payments/merchantpayd-service';
export async function POST(request:Request){
 const session=await getSessionState();
 if(!session.isAdminAuthenticated)return NextResponse.json({error:'Administrator required.'},{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid origin.'},{status:403});
 const data=await request.formData();const id=String(data.get('intentId')||'');
 const engine=getMerchantEngine();if(!await engine.get(id))return NextResponse.json({error:'Payment not found.'},{status:404});
 await engine.reconcile(id);
 return NextResponse.redirect(new URL('/admin/payments',request.url),303);
}
