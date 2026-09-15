import { NextResponse } from "next/server";
import { getSessionState } from "@/lib/session";
import { merchantStatus } from "@/lib/server/payments/merchantpayd-service";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{sessionId:string}>}) {
  const session=await getSessionState();
  if (!session.userId) return NextResponse.json({error:"Authentication required."},{status:401});
  const {sessionId}=await params;const status=await merchantStatus(sessionId,session.userId);
  return NextResponse.json(status?{ok:true,...status}:{error:"Payment not found."},{status:status?200:404,headers:{'Cache-Control':'no-store'}});
}
