import { NextResponse } from "next/server";
import { getMaintenanceApiResponse } from "@/lib/server/maintenance-guard";

export async function POST() {
  const maintenanceResponse = await getMaintenanceApiResponse();
  if (maintenanceResponse) {
    return maintenanceResponse;
  }

  return NextResponse.json(
    {
      error:
        "Direct deposit completion is disabled. Initialize a TransVoucher session instead.",
    },
    { status: 400 },
  );
}
