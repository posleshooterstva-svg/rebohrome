import { NextResponse } from "next/server";
export async function POST() {
 return NextResponse.json({ error: "This payment entrypoint is retired. Use the current checkout or deposit page." }, { status: 410 });
}
