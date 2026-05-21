"use client";

import { useEffect, useState } from "react";
import {
  PRODUCT_IMAGE_ACCEPT,
  validateProductImageFile,
} from "@/lib/product-image";

export function AdminArtworkUploadField() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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
      {error ? (
        <div className="mt-3 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted">
          PNG, JPG, JPEG, or WEBP up to 5 MB.
        </div>
      )}
      <input
        accept={PRODUCT_IMAGE_ACCEPT}
        className="hidden"
        name="image"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;

          if (!file) {
            setError(null);
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
            setError(
              nextError instanceof Error
                ? nextError.message
                : "Use a PNG, JPG, JPEG, or WEBP image under 5 MB.",
            );
            event.currentTarget.value = "";
            return;
          }

          if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
          }
          setPreviewUrl(file ? URL.createObjectURL(file) : null);
        }}
        type="file"
      />
    </label>
  );
}
