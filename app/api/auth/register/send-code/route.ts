import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Telegram code registration is disabled. Create an account directly and complete Veriff verification after registration.",
    },
    { status: 410 },
  );
}
