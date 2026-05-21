const PRODUCT_IMAGE_ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;
const PRODUCT_IMAGE_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const PRODUCT_IMAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = PRODUCT_IMAGE_ALLOWED_MIME_TYPES.join(",");

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  return fileName.slice(dotIndex).toLowerCase();
}

export function isAllowedProductImageExtension(fileName: string) {
  const extension = getFileExtension(fileName);
  return PRODUCT_IMAGE_ALLOWED_EXTENSIONS.includes(
    extension as (typeof PRODUCT_IMAGE_ALLOWED_EXTENSIONS)[number],
  );
}

export function isAllowedProductImageType(mimeType: string) {
  return PRODUCT_IMAGE_ALLOWED_MIME_TYPES.includes(
    mimeType as (typeof PRODUCT_IMAGE_ALLOWED_MIME_TYPES)[number],
  );
}

export function validateProductImageFile(
  file: Pick<File, "name" | "size" | "type"> | null | undefined,
) {
  if (!file) {
    throw new Error("Choose an image file before uploading.");
  }

  if (file.size <= 0) {
    throw new Error("The selected image file is empty.");
  }

  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error("Image size must stay under 5 MB.");
  }

  const hasAllowedExtension = isAllowedProductImageExtension(file.name);
  const hasAllowedType = file.type
    ? isAllowedProductImageType(file.type.toLowerCase())
    : false;

  if (!hasAllowedExtension || !hasAllowedType) {
    throw new Error("Use a PNG, JPG, JPEG, or WEBP image under 5 MB.");
  }
}

