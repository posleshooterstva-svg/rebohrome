"use client";

import { useEffect, useState } from "react";

export function AdminArtworkUploadField() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      <input
        accept="image/*"
        className="hidden"
        name="image"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
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
