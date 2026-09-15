import "server-only";
import { createHash } from "node:crypto";
import { getDbClient } from "@/lib/db/client";
export class RateLimitError extends Error { httpStatus=429; constructor(){super("Too many attempts. Try again in 15 minutes.");} }
export async function limitAuthAttempt(identity:string,ip:string,limit=10) {
  const db=getDbClient(),timestamp=Date.now();
  // Account limit still applies when a proxy-supplied IP cannot be trusted.
  for (const value of [`account:${identity.trim().toLowerCase()}`,`ip:${ip}`]) {
    const key=createHash('sha256').update(value).digest('hex');
    const result=await db.execute({sql:`insert into auth_rate_limits(key,attempts,reset_at) values(?,1,?)
      on conflict(key) do update set attempts=case when reset_at<=? then 1 else attempts+1 end,
      reset_at=case when reset_at<=? then excluded.reset_at else reset_at end returning attempts`,args:[key,timestamp+900_000,timestamp,timestamp]});
    if (Number(result.rows[0].attempts)>(value.startsWith('ip:')?limit*5:limit)) throw new RateLimitError();
  }
}
