import { NextResponse } from "next/server";
import { getSessionState,getRequestMeta } from "@/lib/session";
import { verifyPassword,hashPassword } from "@/lib/auth/password";
import { limitAuthAttempt } from "@/lib/auth/rate-limit";
import { getDbClient } from "@/lib/db/client";
import { createSessionForUser } from "@/lib/db/repository";
import { buildSessionCookieDescriptor } from "@/lib/auth/session-cookie";
export async function POST(request:Request) {
  const session=await getSessionState({allowPasswordReset:true});
  if (!session.userId) return NextResponse.json({error:"Authentication required."},{status:401});
  try {
    const meta=await getRequestMeta();await limitAuthAttempt(`password:${session.userId}`,meta.ipAddress);
    const body=await request.json();
    if (typeof body.newPassword!=='string' || body.newPassword.length<8 || body.newPassword.length>128 || !/[A-Za-z]/.test(body.newPassword)|| !/\d/.test(body.newPassword)) throw new Error("Use 8–128 characters with letters and numbers.");
    if (typeof body.currentPassword!=='string'||body.currentPassword.length>128) throw new Error("Current password required.");
    const tx=await getDbClient().transaction('write');
    try {
      const user=(await tx.execute({sql:"select password_hash from users where id=? and status='active' and coalesce(is_deleted,0)=0",args:[session.userId]})).rows[0];
      if(!user||!verifyPassword(body.currentPassword,String(user.password_hash))) throw new Error("Current password is incorrect.");
      if(verifyPassword(body.newPassword,String(user.password_hash))) throw new Error("Choose a different password.");
      await tx.execute({sql:"update users set password_hash=?,require_password_reset=0,updated_at=? where id=?",args:[hashPassword(body.newPassword),new Date().toISOString(),session.userId]});
      await tx.execute({sql:"delete from sessions where user_id=?",args:[session.userId]});await tx.commit();
    } catch(e){await tx.rollback();throw e;}finally{tx.close();}
    const token=await createSessionForUser({userId:session.userId,userAgent:meta.userAgent,ipAddress:meta.ipAddress});
    const response=NextResponse.json({ok:true});const cookie=buildSessionCookieDescriptor(token,request.headers);response.cookies.set(cookie.name,cookie.value,cookie.options);return response;
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to change password.'},{status:e&&typeof e==='object'&&'httpStatus'in e?Number(e.httpStatus):400});}
}
