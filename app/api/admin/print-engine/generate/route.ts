import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db/client";
import { getRequestMeta, requireAdminSession } from "@/lib/session";

export const runtime = "nodejs";

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "receipt";
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession("/");
    const payload = (await request.json()) as Record<string, unknown>;
    const templateId = safeString(payload.templateId);
    const trackingId = safeString(payload.trackingId);
    const orderId = safeString(payload.orderId) || null;
    const inputData = payload.inputData ?? {};

    if (!templateId || !trackingId) {
      return NextResponse.json(
        { ok: false, error: "Template and tracking ID are required." },
        { status: 400 },
      );
    }

    const generatedAt = new Date().toISOString();
    const dataHash = createHash("sha256")
      .update(JSON.stringify(inputData))
      .digest("hex");
    const fileName = `receipt-${safeFilePart(templateId)}-${safeFilePart(trackingId)}.pdf`;
    const meta = await getRequestMeta("/api/admin/print-engine/generate");
    const db = getDbClient();

    await db.execute(
      `create table if not exists print_receipt_audit_logs (
        id text primary key,
        admin_id text not null,
        template_id text not null,
        tracking_id text not null,
        order_id text,
        generated_at text not null,
        input_data_hash text not null,
        file_name text not null,
        ip_address text,
        user_agent text
      )`,
    );
    await db.execute(
      `insert into print_receipt_audit_logs (
        id, admin_id, template_id, tracking_id, order_id, generated_at,
        input_data_hash, file_name, ip_address, user_agent
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        session.userId,
        templateId,
        trackingId,
        orderId,
        generatedAt,
        dataHash,
        fileName,
        meta.ipAddress,
        meta.userAgent,
      ],
    );

    return NextResponse.json({ ok: true, fileName, dataHash, generatedAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to audit receipt generation." },
      { status: 400 },
    );
  }
}
