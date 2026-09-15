import { NextResponse } from "next/server";
import { processTelegramUpdate } from "@/lib/db/repository";
import { TELEGRAM_WEBHOOK_SECRET } from "@/lib/server-config";
import { equalSecret } from "@/lib/security";
import type { TelegramUpdate } from "@/lib/telegram";
export async function POST(request: Request) {
 if (!equalSecret(request.headers.get("x-telegram-bot-api-secret-token"), TELEGRAM_WEBHOOK_SECRET))
   return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
 let update: TelegramUpdate;
 try { update = await request.json(); } catch { return NextResponse.json({error:"Invalid JSON."},{status:400}); }
 try { return NextResponse.json(await processTelegramUpdate(update)); }
 catch { return NextResponse.json({error:"Unable to process Telegram update."},{status:500}); }
}
