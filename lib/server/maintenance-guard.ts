import { NextResponse } from "next/server";
import { getMaintenanceModeConfig } from "@/lib/db/repository";

export async function getMaintenanceApiResponse() {
  const maintenance = await getMaintenanceModeConfig().catch(() => null);

  if (!maintenance?.enabled) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      maintenance: true,
      error: "ReboHrome is currently undergoing scheduled maintenance.",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function withdrawalsDisabledResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Withdrawals are currently disabled.",
    },
    { status: 410 },
  );
}
