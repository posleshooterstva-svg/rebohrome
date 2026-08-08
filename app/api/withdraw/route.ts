import { withdrawalsDisabledResponse } from "@/lib/server/maintenance-guard";

export async function POST(request: Request) {
  void request;
  return withdrawalsDisabledResponse();
}

export async function GET() {
  return withdrawalsDisabledResponse();
}
