import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db/client";
export const dynamic='force-dynamic';
export async function GET(){try{
 const db=getDbClient();await db.execute('select 1');
 const migration=await db.execute("select id from app_migrations where id='merchantpayd-v1'");
 if(!migration.rows.length)throw new Error('Migration missing');
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch{return NextResponse.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}}
