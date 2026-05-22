import { NextResponse } from "next/server";
import { saveUploadedImage } from "@/lib/db/repository";
import { validateProductImageFile } from "@/lib/product-image";
import { getSessionState } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getSessionState();

    if (!session.isAdminAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "Admin authentication required." },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const imageValue = formData.get("image");
    const imageFile =
      imageValue instanceof File && imageValue.size > 0 ? imageValue : null;

    if (!imageFile) {
      return NextResponse.json(
        { ok: false, error: "Choose an image file before uploading." },
        { status: 400 },
      );
    }

    validateProductImageFile(imageFile);
    const uploaded = await saveUploadedImage(imageFile);

    if (!uploaded) {
      return NextResponse.json(
        { ok: false, error: "The image upload did not return a file." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      imageUrl: uploaded.imageUrl,
      imagePath: uploaded.imagePath,
      imageUpdatedAt: uploaded.imageUpdatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload product artwork.",
      },
      { status: 400 },
    );
  }
}
