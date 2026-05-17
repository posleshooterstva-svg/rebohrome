import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const mimeTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

type UploadRouteProps = {
  params: Promise<{
    filename: string;
  }>;
};

export async function GET(_: Request, { params }: UploadRouteProps) {
  const { filename } = await params;
  const safeName = path.basename(filename);
  const filePath = path.join(process.cwd(), "public", "uploads", safeName);

  try {
    const file = await readFile(filePath);
    const extension = path.extname(safeName).toLowerCase();

    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": mimeTypes[extension] ?? "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
