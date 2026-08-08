import { withdrawalsDisabledResponse } from "@/lib/server/maintenance-guard";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;
  void params;
  return withdrawalsDisabledResponse();
}
