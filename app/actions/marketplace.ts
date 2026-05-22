"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createProduct,
  deleteProduct,
  getMaintenanceModeConfig,
  removeManagedProductImage,
  refreshTransVoucherTransactionStatus,
  retryWithdrawalTelegramSync,
  setHomepageFeaturedProduct,
  updateMaintenanceModeConfig,
  updateAdminManagedUser,
  updateOrderStatus,
  updateProduct,
  updateUserEmailAddress,
  updateUserProfile,
  updateWithdrawalStatus,
} from "@/lib/db/repository";
import { getRequestMeta, requireAdminSession, requireUserSession } from "@/lib/session";

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

const emailUpdateSchema = z
  .object({
    email: z.string().email(),
    confirmEmail: z.string().email(),
    currentPassword: z.string().min(1),
  })
  .refine((value) => value.email === value.confirmEmail, {
    message: "Email addresses do not match.",
    path: ["confirmEmail"],
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

const maintenanceModeSchema = z.object({
  enabled: z.boolean(),
  title: z.string().max(120).optional(),
  message: z.string().max(600).optional(),
  estimatedReturnAt: z.string().optional(),
  internalNote: z.string().max(300).optional(),
  redirectTo: z.string().optional(),
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

function normalizeOptionalText(value: string) {
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

function normalizeDateTimeInput(value: string) {
  const next = value.trim();

  if (!next) {
    return null;
  }

  const parsed = new Date(next);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Enter a valid estimated return time.");
  }

  return parsed.toISOString();
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
  const nextImageUrl = readString(formData, "imageUrl") || null;
  const nextImagePath = readString(formData, "imagePath") || null;
  const nextImageUpdatedAt = readString(formData, "imageUpdatedAt") || null;
  const imageUploadState = readString(formData, "imageUploadState");

  if (imageUploadState === "uploading") {
    throw new Error("Wait for the image upload to finish before saving.");
  }

  if (imageUploadState === "error") {
    throw new Error("Fix the image upload before saving this product.");
  }

  const hasReplacementImage = Boolean(nextImageUrl || nextImagePath);

  return {
    currentImageUrl,
    currentImagePath,
    uploadedImage:
      hasReplacementImage && nextImagePath && nextImagePath !== currentImagePath
        ? {
            imageUrl: nextImageUrl ?? "",
            imagePath: nextImagePath,
            imageUpdatedAt: nextImageUpdatedAt ?? new Date().toISOString(),
          }
        : null,
    imageUrl: hasReplacementImage ? nextImageUrl : removeImage ? null : currentImageUrl,
    imagePath: hasReplacementImage ? nextImagePath : removeImage ? null : currentImagePath,
    imageUpdatedAt: hasReplacementImage
      ? nextImageUpdatedAt ?? new Date().toISOString()
      : removeImage
        ? new Date().toISOString()
        : currentImageUpdatedAt,
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

export async function changeEmailAction(formData: FormData) {
  const session = await requireUserSession("/login");

  let values: z.infer<typeof emailUpdateSchema>;

  try {
    values = emailUpdateSchema.parse({
      email: readString(formData, "email"),
      confirmEmail: readString(formData, "confirmEmail"),
      currentPassword: readString(formData, "currentPassword"),
    });
  } catch (error) {
    redirect(
      `/dashboard/settings?emailError=${encodeURIComponent(
        getErrorMessage(error, "Unable to update email."),
      )}`,
    );
  }

  try {
    const meta = await getRequestMeta("/dashboard/settings");
    await updateUserEmailAddress({
      userId: session.userId,
      currentPassword: values.currentPassword,
      newEmail: values.email,
      ipAddress: meta.ipAddress,
      country: meta.country,
      userAgent: meta.userAgent,
      language: meta.language,
      route: meta.route,
      timestamp: meta.timestamp,
    });
  } catch (error) {
    redirect(
      `/dashboard/settings?emailError=${encodeURIComponent(
        getErrorMessage(error, "Unable to update email."),
      )}`,
    );
  }

  redirect("/dashboard/settings?emailUpdated=1");
}

export async function createProductAction(formData: FormData) {
  const session = await requireAdminSession("/");
  let values: ReturnType<typeof parseProductForm>;
  let uploadedImage:
    | {
        imageUrl: string;
        imagePath: string;
        imageUpdatedAt: string;
      }
    | null = null;

  try {
    values = parseProductForm(formData);
    const imageUploadState = readString(formData, "imageUploadState");

    if (imageUploadState === "uploading") {
      throw new Error("Wait for the image upload to finish before publishing.");
    }

    if (imageUploadState === "error") {
      throw new Error("Fix the artwork upload before publishing.");
    }

    const imageUrl = readString(formData, "imageUrl");
    const imagePath = readString(formData, "imagePath");
    const imageUpdatedAt = readString(formData, "imageUpdatedAt");

    uploadedImage =
      imageUrl || imagePath
        ? {
            imageUrl,
            imagePath,
            imageUpdatedAt: imageUpdatedAt || new Date().toISOString(),
          }
        : null;
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

export async function saveMaintenanceModeAction(formData: FormData) {
  const session = await requireAdminSession("/");

  let values: z.infer<typeof maintenanceModeSchema>;

  try {
    values = maintenanceModeSchema.parse({
      enabled: readBoolean(formData, "enabled"),
      title: readString(formData, "title"),
      message: readString(formData, "message"),
      estimatedReturnAt: readString(formData, "estimatedReturnAt"),
      internalNote: readString(formData, "internalNote"),
      redirectTo: readString(formData, "redirectTo"),
    });
  } catch (error) {
    redirect(
      `/admin/settings?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to update maintenance mode."),
      )}`,
    );
  }

  try {
    const meta = await getRequestMeta("/admin/settings");
    await updateMaintenanceModeConfig({
      adminUserId: session.userId,
      adminUsername: session.user.username,
      enabled: values.enabled,
      title: normalizeOptionalText(values.title ?? ""),
      message: normalizeOptionalText(values.message ?? ""),
      estimatedReturnAt: normalizeDateTimeInput(values.estimatedReturnAt ?? ""),
      internalNote: normalizeOptionalText(values.internalNote ?? ""),
      ipAddress: meta.ipAddress,
      route: meta.route,
    });
  } catch (error) {
    redirect(
      `/admin/settings?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to update maintenance mode."),
      )}`,
    );
  }

  redirect("/admin/settings?saved=1");
}

export async function disableMaintenanceModeQuickAction(formData: FormData) {
  const session = await requireAdminSession("/");
  const redirectTo = readString(formData, "redirectTo") || "/";

  try {
    const meta = await getRequestMeta(redirectTo);
    const currentConfig = await getMaintenanceModeConfig();

    await updateMaintenanceModeConfig({
      adminUserId: session.userId,
      adminUsername: session.user.username,
      enabled: false,
      title: currentConfig.title,
      message: currentConfig.message,
      estimatedReturnAt: null,
      internalNote: currentConfig.internalNote,
      ipAddress: meta.ipAddress,
      route: meta.route,
    });
  } catch (error) {
    redirect(
      `/admin/settings?error=${encodeURIComponent(
        getErrorMessage(error, "Unable to disable maintenance mode."),
      )}`,
    );
  }

  redirect(redirectTo === "/maintenance" ? "/" : redirectTo);
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
