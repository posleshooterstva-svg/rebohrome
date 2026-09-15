import { createClient } from "@libsql/client";
import { migratePayments } from "../lib/payments/schema.ts";

// Require an explicit target. Never silently inherit the developer's production .env.local.
const url=process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL explicitly for this migration.");
if (!url.startsWith("file:") && !process.argv.includes("--remote")) throw new Error("Remote migration requires the explicit --remote option.");
const db=createClient({url,authToken:process.env.DATABASE_AUTH_TOKEN || undefined});
try {await migratePayments(db);console.log("Payment migration applied.");} finally {db.close();}
