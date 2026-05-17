"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createProduct,
  deleteProduct,
  retryWithdrawalTelegramSync,
  saveUploadedImage,
  updateOrderStatus,
  updateProduct,
  updateUserProfile,
  updateWithdrawalStatus,
} from "@/lib/db/repository";
import { requireAdminSession, requireUserSession } from "@/lib/session";

const productSchema = z.object({
  title: z.string().min(2),
  rarity: z.enum(["Legendary", "Epic", "Rare"]),
  price: z.coerce.number().min(0),
  currency: z.enum(["USD", "EUR"]),
  stock: z.coerce.number().int().min(0),
  collection: z.string().min(2),
  category: z.string().min(2),
  description: z.string().min(10),
  tagline: z.string().min(4),
  defaultDeliveryType: z.enum(["digital", "physical"]),
  deliveryDigital: z.string().min(4),
  deliveryPhysical: z.string().min(4),
  edition: z.string().min(2),
  featured: z.boolean(),
  status: z.enum(["active", "inactive"]),
  shape: z.enum(["spire", "void", "halo", "crescent", "shard"]),
});

const profileSchema = z.object({
  name: z.string().min(2),
  telegramUsername: z.string().min(2),
  telegramId: z.string().optional(),
  withdrawalWallet: z.string().optional(),
});

const statusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["Completed", "Processing", "Pending", "Declined"]),
});

const withdrawalStatusSchema = z.object({
  withdrawalId: z.string().min(1),
  status: z.enum(["pending", "approved", "processing", "completed", "declined"]),
  adminNote: z.string().optional(),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

function parseProductForm(formData: FormData) {
  return productSchema.parse({
    title: readString(formData, "title"),
    rarity: readString(formData, "rarity"),
    price: readString(formData, "price"),
    currency: readString(formData, "currency"),
    stock: readString(formData, "stock"),
    collection: readString(formData, "collection"),
    category: readString(formData, "category"),
    description: readString(formData, "description"),
    tagline: readString(formData, "tagline"),
    defaultDeliveryType: readString(formData, "defaultDeliveryType"),
    deliveryDigital: readString(formData, "deliveryDigital"),
    deliveryPhysical: readString(formData, "deliveryPhysical"),
    edition: readString(formData, "edition"),
    featured: readBoolean(formData, "featured"),
    status: readString(formData, "status"),
    shape: readString(formData, "shape"),
  });
}

export async function saveProfileAction(formData: FormData) {
  const session = await requireUserSession("/login");

  const values = profileSchema.parse({
    name: readString(formData, "name"),
    telegramUsername: readString(formData, "telegramUsername"),
    telegramId: readString(formData, "telegramId"),
    withdrawalWallet: readString(formData, "withdrawalWallet"),
  });

  await updateUserProfile(session.userId, {
    name: values.name,
    telegramUsername: values.telegramUsername,
    telegramId: values.telegramId ?? "",
    withdrawalWallet: values.withdrawalWallet ?? "",
  });

  redirect("/dashboard/settings?saved=1");
}

export async function createProductAction(formData: FormData) {
  const session = await requireAdminSession("/");
  let imageUrl: string | null = null;
  let values: ReturnType<typeof parseProductForm>;

  try {
    values = parseProductForm(formData);
    const imageValue = formData.get("image");
    const imageFile =
      imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
    imageUrl = imageFile ? await saveUploadedImage(imageFile) : null;
  } catch (error) {
    redirect(
      `/admin/upload?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to publish product."),
      )}`,
    );
  }

  await createProduct({
    ...values,
    imageUrl,
    adminUserId: session.userId,
  });

  redirect("/admin/products?created=1");
}

export async function updateProductAction(formData: FormData) {
  const session = await requireAdminSession("/");
  let id = "";
  let values: ReturnType<typeof parseProductForm>;

  try {
    id = readString(formData, "id");
    values = parseProductForm(formData);

    if (!id) {
      throw new Error("Missing product id");
    }
  } catch (error) {
    redirect(
      `/admin/products?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to update product."),
      )}`,
    );
  }

  await updateProduct(id, {
    ...values,
    adminUserId: session.userId,
  });
  redirect("/admin/products?updated=1");
}

export async function deleteProductAction(formData: FormData) {
  const session = await requireAdminSession("/");

  const id = readString(formData, "id");

  if (!id) {
    redirect("/admin/products?error=Missing%20product%20id");
  }

  await deleteProduct(id, session.userId);
  redirect("/admin/products?deleted=1");
}

export async function updateOrderStatusAction(formData: FormData) {
  await requireAdminSession("/");

  const values = statusSchema.parse({
    orderId: readString(formData, "orderId"),
    status: readString(formData, "status"),
  });

  await updateOrderStatus(values.orderId, values.status);
  redirect("/admin/orders?updated=1");
}

export async function updateWithdrawalStatusAction(formData: FormData) {
  const session = await requireAdminSession("/");

  const values = withdrawalStatusSchema.parse({
    withdrawalId: readString(formData, "withdrawalId"),
    status: readString(formData, "status"),
    adminNote: readString(formData, "adminNote"),
  });

  await updateWithdrawalStatus({
    withdrawalId: values.withdrawalId,
    status: values.status,
    adminUserId: session.userId,
    adminNote: values.adminNote,
  });

  redirect("/admin/users?withdrawalUpdated=1");
}

export async function retryWithdrawalTelegramSyncAction(formData: FormData) {
  const session = await requireAdminSession("/");
  const withdrawalId = readString(formData, "withdrawalId");

  if (!withdrawalId) {
    throw new Error("Missing withdrawal id");
  }

  await retryWithdrawalTelegramSync(withdrawalId, session.userId);
  redirect("/admin/users?telegramSynced=1");
}
