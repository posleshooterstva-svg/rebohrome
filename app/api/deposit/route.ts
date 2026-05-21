import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Direct deposit completion is disabled. Initialize a TransVoucher session instead.",
    },
    { status: 400 },
  );
}
