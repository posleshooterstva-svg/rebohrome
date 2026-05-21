import "server-only";

import path from "path";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/product-image";

let bucketReady = false;
const PUBLIC_OBJECT_PATH_MARKER = "/storage/v1/object/public/";

function getStorageConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    "";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
    bucket: PRODUCT_IMAGE_BUCKET,
  };
}

function getSupabaseStorageClient() {
  const config = getStorageConfig();

  if (!config) {
    return null;
  }

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function ensureStorageBucket() {
  if (bucketReady) {
    return;
  }

  const client = getSupabaseStorageClient();
  const config = getStorageConfig();

  if (!client || !config) {
    throw new Error(
      "Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before uploading artwork in production.",
    );
  }

  const bucketResult = await client.storage.getBucket(config.bucket);

  if (bucketResult.error) {
    const createResult = await client.storage.createBucket(config.bucket, {
      public: true,
      fileSizeLimit: "5MB",
      allowedMimeTypes: [
        "image/jpeg",
        "image/png",
        "image/webp",
      ],
    });

    if (
      createResult.error &&
      !createResult.error.message.toLowerCase().includes("already exists")
    ) {
      throw new Error(
        `Unable to prepare Supabase Storage bucket "${config.bucket}": ${createResult.error.message}`,
      );
    }
  }

  bucketReady = true;
}

export function isSupabaseStorageAvailable() {
  return Boolean(getStorageConfig());
}

export function parseSupabaseManagedImageUrl(imageUrl: string | null | undefined) {
  if (!imageUrl) {
    return null;
  }

  const markerIndex = imageUrl.indexOf(PUBLIC_OBJECT_PATH_MARKER);

  if (markerIndex === -1) {
    return null;
  }

  const remainder = imageUrl.slice(markerIndex + PUBLIC_OBJECT_PATH_MARKER.length);
  const [bucket, ...objectPathParts] = remainder.split("/");
  const objectPath = objectPathParts.join("/");

  if (!bucket || !objectPath) {
    return null;
  }

  return {
    bucket,
    objectPath,
  };
}

export async function uploadImageToSupabaseStorage(file: File) {
  const client = getSupabaseStorageClient();
  const config = getStorageConfig();

  if (!client || !config) {
    throw new Error(
      "Image uploads require Supabase Storage configuration in production.",
    );
  }

  await ensureStorageBucket();

  const bytes = await file.arrayBuffer();
  const extension = path.extname(file.name).toLowerCase() || ".png";
  const fileName = `products/${randomUUID()}${extension}`;

  const uploadResult = await client.storage
    .from(config.bucket)
    .upload(fileName, Buffer.from(bytes), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadResult.error) {
    throw new Error(`Unable to upload artwork: ${uploadResult.error.message}`);
  }

  const publicUrlResult = client.storage.from(config.bucket).getPublicUrl(fileName);
  const publicUrl = publicUrlResult.data.publicUrl;

  if (!publicUrl) {
    throw new Error("Supabase Storage did not return a public image URL.");
  }

  return {
    publicUrl,
    objectPath: fileName,
  };
}

export async function removeImageFromSupabaseStorage(input: {
  imageUrl?: string | null;
  imagePath?: string | null;
}) {
  const client = getSupabaseStorageClient();

  if (!client) {
    return;
  }

  if (input.imagePath) {
    const config = getStorageConfig();

    if (!config) {
      return;
    }

    await client.storage.from(config.bucket).remove([input.imagePath]);
    return;
  }

  const parsed = parseSupabaseManagedImageUrl(input.imageUrl);

  if (!parsed) {
    return;
  }

  await client.storage.from(parsed.bucket).remove([parsed.objectPath]);
}

export function isSupabaseManagedImageUrl(imageUrl: string | null | undefined) {
  return Boolean(parseSupabaseManagedImageUrl(imageUrl));
}
