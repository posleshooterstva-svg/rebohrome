import { merchantCreateRoute } from "@/lib/server/payments/merchantpayd-route";
export const runtime="nodejs";
export function POST(request:Request) {return merchantCreateRoute(request,"purchase");}
