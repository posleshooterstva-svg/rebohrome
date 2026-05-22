import { NextResponse } from "next/server";
import { getMaintenanceModeConfig } from "@/lib/db/repository";

export async function GET() {
  const maintenance = await getMaintenanceModeConfig().catch(() => ({
    enabled: false,
  }));

  return NextResponse.json({
    ok: true,
    maintenance: Boolean(maintenance.enabled),
    timestamp: new Date().toISOString(),
  });
}
