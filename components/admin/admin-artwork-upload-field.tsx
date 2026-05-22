"use client";

import { useEffect, useState } from "react";
import {
  PRODUCT_IMAGE_ACCEPT,
  validateProductImageFile,
} from "@/lib/product-image";

type UploadedArtworkState = {
  imageUrl: string;
  imagePath: string;
  imageUpdatedAt: string;
};

export function AdminArtworkUploadField() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedArtwork, setUploadedArtwork] = useState<UploadedArtworkState | null>(
    null,
  );
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "uploaded" | "error"
  >("idle");

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleFileChange(file: File | null) {
    if (!file) {
      setError(null);
      setUploadedArtwork(null);
      setUploadState("idle");
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      return;
    }

    try {
      validateProductImageFile(file);
      setError(null);
    } catch (nextError) {
      setUploadState("error");
      setUploadedArtwork(null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Use a PNG, JPG, JPEG, or WEBP image under 5 MB.",
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    setUploadState("uploading");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/admin/products/upload-image", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as
        | {
            ok: true;
            imageUrl: string;
            imagePath: string;
            imageUpdatedAt: string;
          }
        | {
            ok: false;
            error?: string;
          };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Unable to upload artwork." : payload.error);
      }

      setUploadedArtwork({
        imageUrl: payload.imageUrl,
        imagePath: payload.imagePath,
        imageUpdatedAt: payload.imageUpdatedAt,
      });
      setUploadState("uploaded");
    } catch (uploadError) {
      setUploadedArtwork(null);
      setUploadState("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload artwork right now.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="mt-4 block cursor-pointer">
      <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-line bg-panel">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Artwork preview"
            className="h-full min-h-[260px] w-full object-cover"
            src={previewUrl}
          />
        ) : (
          <div className="px-6 text-center text-sm leading-7 text-muted">
            Upload product artwork to preview the archive card before publishing.
          </div>
        )}
      </div>
      <input name="imageUrl" type="hidden" value={uploadedArtwork?.imageUrl ?? ""} />
      <input name="imagePath" type="hidden" value={uploadedArtwork?.imagePath ?? ""} />
      <input
        name="imageUpdatedAt"
        type="hidden"
        value={uploadedArtwork?.imageUpdatedAt ?? ""}
      />
      <input name="imageUploadState" type="hidden" value={uploadState} />
      {error ? (
        <div className="mt-3 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : uploading ? (
        <div className="mt-3 rounded-[14px] border border-[rgba(120,112,241,0.14)] bg-[rgba(120,112,241,0.06)] px-4 py-3 text-sm text-[var(--accent)]">
          Uploading artwork…
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted">
          PNG, JPG, JPEG, or WEBP up to 5 MB.
        </div>
      )}
      <input
        accept={PRODUCT_IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleFileChange(file);
        }}
        type="file"
      />
    </label>
  );
}
