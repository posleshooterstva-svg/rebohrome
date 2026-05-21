"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createProduct,
  deleteProduct,
  removeManagedProductImage,
  refreshTransVoucherTransactionStatus,
  retryWithdrawalTelegramSync,
  saveUploadedImage,
  setHomepageFeaturedProduct,
  updateAdminManagedUser,
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
  homepageFeatured: z.boolean().default(false),
  status: z.enum(["active", "inactive"]),
  shape: z.enum(["spire", "void", "halo", "crescent", "shard"]),
});

const profileSchema = z.object({
  name: z.string().min(2),
  telegramUsername: z.string().min(2),
  telegramId: z.string().optional(),
  withdrawalWallet: z.string().optional(),
});

const adminUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(2),
  role: z.enum(["user", "admin"]),
  status: z.enum(["active", "suspended"]),
  telegramUsername: z.string().min(2),
  telegramId: z.string().optional(),
  withdrawalWallet: z.string().optional(),
  verified: z.boolean(),
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
    homepageFeatured: readBoolean(formData, "homepageFeatured"),
    status: readString(formData, "status"),
    shape: readString(formData, "shape"),
  });
}

async function resolveProductImageChange(formData: FormData) {
  const currentImageUrl = readString(formData, "currentImageUrl") || null;
  const currentImagePath = readString(formData, "currentImagePath") || null;
  const currentImageUpdatedAt = readString(formData, "currentImageUpdatedAt") || null;
  const removeImage = readBoolean(formData, "removeImage");
  const imageValue = formData.get("image");
  const imageFile =
    imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  const uploadedImage = imageFile ? await saveUploadedImage(imageFile) : null;

  return {
    currentImageUrl,
    currentImagePath,
    uploadedImage,
    imageUrl: uploadedImage?.imageUrl ?? (removeImage ? null : currentImageUrl),
    imagePath: uploadedImage?.imagePath ?? (removeImage ? null : currentImagePath),
    imageUpdatedAt:
      uploadedImage?.imageUpdatedAt ??
      (removeImage ? new Date().toISOString() : currentImageUpdatedAt),
  };
}

type ProductMutationResult =
  | {
      ok: true;
      message: string;
      productId?: string;
      product?: Awaited<ReturnType<typeof updateProduct>>;
    }
  | {
      ok: false;
      error: string;
    };

type AdminUserMutationResult =
  | {
      ok: true;
      message: string;
      userEntry: Awaited<ReturnType<typeof updateAdminManagedUser>>;
    }
  | {
      ok: false;
      error: string;
    };

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
  let uploadedImage:
    | {
        imageUrl: string;
        imagePath: string;
        imageUpdatedAt: string;
      }
    | null = null;
  let values: ReturnType<typeof parseProductForm>;

  try {
    values = parseProductForm(formData);
    const imageValue = formData.get("image");
    const imageFile =
      imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
    uploadedImage = imageFile ? await saveUploadedImage(imageFile) : null;
  } catch (error) {
    redirect(
      `/admin/upload?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to publish product."),
      )}`,
    );
  }

  try {
    await createProduct({
      ...values,
      imageUrl: uploadedImage?.imageUrl ?? null,
      imagePath: uploadedImage?.imagePath ?? null,
      imageUpdatedAt: uploadedImage?.imageUpdatedAt ?? null,
      adminUserId: session.userId,
    });
  } catch (error) {
    if (uploadedImage) {
      await removeManagedProductImage(uploadedImage).catch(() => null);
    }

    redirect(
      `/admin/upload?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to publish product."),
      )}`,
    );
  }

  redirect("/admin/products?created=1");
}

export async function updateProductAction(formData: FormData) {
  const session = await requireAdminSession("/");
  let id = "";
  let values: ReturnType<typeof parseProductForm>;
  let uploadedImage:
    | {
        imageUrl: string;
        imagePath: string;
        imageUpdatedAt: string;
      }
    | null = null;
  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  let imageUpdatedAt: string | null = null;

  try {
    id = readString(formData, "id");
    values = parseProductForm(formData);
    const imageState = await resolveProductImageChange(formData);
    uploadedImage = imageState.uploadedImage;
    imageUrl = imageState.imageUrl;
    imagePath = imageState.imagePath;
    imageUpdatedAt = imageState.imageUpdatedAt;

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

  try {
    await updateProduct(id, {
      ...values,
      imageUrl,
      imagePath,
      imageUpdatedAt,
      adminUserId: session.userId,
    });
  } catch (error) {
    if (uploadedImage) {
      await removeManagedProductImage(uploadedImage).catch(() => null);
    }

    redirect(
      `/admin/products?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to update product."),
      )}`,
    );
  }

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

export async function updateProductInlineAction(
  formData: FormData,
): Promise<ProductMutationResult> {
  const session = await requireAdminSession("/");
  let id = "";
  let values: ReturnType<typeof parseProductForm>;
  let uploadedImage:
    | {
        imageUrl: string;
        imagePath: string;
        imageUpdatedAt: string;
      }
    | null = null;
  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  let imageUpdatedAt: string | null = null;

  try {
    id = readString(formData, "id");
    values = parseProductForm(formData);

    if (!id) {
      throw new Error("Missing product id.");
    }

    const imageState = await resolveProductImageChange(formData);
    uploadedImage = imageState.uploadedImage;
    imageUrl = imageState.imageUrl;
    imagePath = imageState.imagePath;
    imageUpdatedAt = imageState.imageUpdatedAt;
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Unable to update product."),
    };
  }

  try {
    const product = await updateProduct(id, {
      ...values,
      imageUrl,
      imagePath,
      imageUpdatedAt,
      adminUserId: session.userId,
    });

    return {
      ok: true,
      message: "Product updated successfully.",
      product,
      productId: id,
    };
  } catch (error) {
    if (uploadedImage) {
      await removeManagedProductImage(uploadedImage).catch(() => null);
    }

    return {
      ok: false,
      error: getErrorMessage(error, "Unable to update product."),
    };
  }
}

export async function featureHomepageProductInlineAction(
  formData: FormData,
): Promise<ProductMutationResult> {
  const session = await requireAdminSession("/");
  const id = readString(formData, "id");

  if (!id) {
    return {
      ok: false,
      error: "Missing product id.",
    };
  }

  try {
    const product = await setHomepageFeaturedProduct(id, session.userId);
    return {
      ok: true,
      message: "Homepage feature updated successfully.",
      product,
      productId: id,
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Unable to feature product on the homepage."),
    };
  }
}

export async function deleteProductInlineAction(
  formData: FormData,
): Promise<ProductMutationResult> {
  const session = await requireAdminSession("/");
  const id = readString(formData, "id");

  if (!id) {
    return {
      ok: false,
      error: "Missing product id.",
    };
  }

  try {
    await deleteProduct(id, session.userId);
    return {
      ok: true,
      message: "Product archived successfully.",
      productId: id,
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Unable to archive product."),
    };
  }
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

export async function refreshTransVoucherStatusAction(formData: FormData) {
  await requireAdminSession("/");

  const transactionId = readString(formData, "transactionId");

  if (!transactionId) {
    redirect("/admin/analytics?error=Missing%20transaction%20id");
  }

  try {
    await refreshTransVoucherTransactionStatus(transactionId);
    redirect("/admin/analytics?refreshed=1");
  } catch (error) {
    redirect(
      `/admin/analytics?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to refresh TransVoucher status."),
      )}`,
    );
  }
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

export async function updateAdminUserInlineAction(
  formData: FormData,
): Promise<AdminUserMutationResult> {
  const session = await requireAdminSession("/");

  let values: z.infer<typeof adminUserSchema>;

  try {
    values = adminUserSchema.parse({
      userId: readString(formData, "userId"),
      name: readString(formData, "name"),
      role: readString(formData, "role"),
      status: readString(formData, "status"),
      telegramUsername: readString(formData, "telegramUsername"),
      telegramId: readString(formData, "telegramId"),
      withdrawalWallet: readString(formData, "withdrawalWallet"),
      verified: readBoolean(formData, "verified"),
    });
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Unable to update user."),
    };
  }

  try {
    const userEntry = await updateAdminManagedUser({
      adminUserId: session.userId,
      userId: values.userId,
      name: values.name,
      role: values.role,
      status: values.status,
      telegramUsername: values.telegramUsername,
      telegramId: values.telegramId ?? "",
      withdrawalWallet: values.withdrawalWallet ?? "",
      verified: values.verified,
    });

    return {
      ok: true,
      message: "User updated successfully.",
      userEntry,
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, "Unable to update user."),
    };
  }
}
