import { withdrawalsDisabledResponse } from "@/lib/server/maintenance-guard";

export async function GET(request: Request) {
  void request;
  return withdrawalsDisabledResponse();
}
