"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ImagePlus,
  Loader2,
  PencilLine,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteProductInlineAction,
  featureHomepageProductInlineAction,
  updateProductInlineAction,
} from "@/app/actions/marketplace";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { Button } from "@/components/ui/button";
import {
  getPaletteByRarity,
  formatCurrency,
  productRarities,
  productShapes,
  supportedCurrencies,
  type DeliveryType,
  type ProductRecord,
  type ProductStatus,
  type Rarity,
  type SupportedCurrency,
} from "@/lib/rebohrome-data";
import {
  PRODUCT_IMAGE_ACCEPT,
  validateProductImageFile,
} from "@/lib/product-image";
import { cn } from "@/lib/utils";

type AdminProductsManagerProps = {
  initialProducts: ProductRecord[];
  initialBanner?: string | null;
  initialError?: string | null;
};

type ProductDraft = {
  title: string;
  collection: string;
  category: string;
  edition: string;
  rarity: Rarity;
  shape: ProductRecord["shape"];
  price: string;
  currency: SupportedCurrency;
  stock: string;
  defaultDeliveryType: DeliveryType;
  status: ProductStatus;
  tagline: string;
  description: string;
  deliveryDigital: string;
  deliveryPhysical: string;
  featured: boolean;
  homepageFeatured: boolean;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
} | null;

function createDraft(product: ProductRecord): ProductDraft {
  return {
    title: product.title,
    collection: product.collection,
    category: product.category,
    edition: product.edition,
    rarity: product.rarity,
    shape: product.shape,
    price: String(product.price),
    currency: product.currency,
    stock: String(product.stock),
    defaultDeliveryType: product.defaultDeliveryType,
    status: product.status,
    tagline: product.tagline,
    description: product.description,
    deliveryDigital: product.deliveryDigital,
    deliveryPhysical: product.deliveryPhysical,
    featured: product.featured,
    homepageFeatured: product.homepageFeatured,
  };
}

function normalizeDraft(draft: ProductDraft) {
  return JSON.stringify({
    ...draft,
    price: draft.price.trim(),
    stock: draft.stock.trim(),
    title: draft.title.trim(),
    collection: draft.collection.trim(),
    category: draft.category.trim(),
    edition: draft.edition.trim(),
    tagline: draft.tagline.trim(),
    description: draft.description.trim(),
    deliveryDigital: draft.deliveryDigital.trim(),
    deliveryPhysical: draft.deliveryPhysical.trim(),
  });
}

function matchesFeaturedFilter(product: ProductRecord, filter: string) {
  if (filter === "homepage") {
    return product.homepageFeatured;
  }

  if (filter === "featured") {
    return product.featured;
  }

  if (filter === "regular") {
    return !product.homepageFeatured && !product.featured;
  }

  return true;
}

function sortProducts(products: ProductRecord[], sortBy: string) {
  const next = [...products];

  switch (sortBy) {
    case "price-high":
      next.sort((left, right) => right.price - left.price);
      break;
    case "price-low":
      next.sort((left, right) => left.price - right.price);
      break;
    case "stock-high":
      next.sort((left, right) => right.stock - left.stock);
      break;
    case "stock-low":
      next.sort((left, right) => left.stock - right.stock);
      break;
    case "newest":
    default:
      next.sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
      break;
  }

  return next;
}

export function AdminProductsManager({
  initialProducts,
  initialBanner,
  initialError,
}: AdminProductsManagerProps) {
  const [products, setProducts] = useState(initialProducts);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [rarityFilter, setRarityFilter] = useState<"all" | Rarity>("all");
  const [featuredFilter, setFeaturedFilter] = useState<
    "all" | "homepage" | "featured" | "regular"
  >("all");
  const [sortBy, setSortBy] = useState<
    "newest" | "price-high" | "price-low" | "stock-high" | "stock-low"
  >("newest");
  const [toast, setToast] = useState<ToastState>(
    initialError
      ? { tone: "error", message: initialError }
      : initialBanner
        ? { tone: "success", message: initialBanner }
        : null,
  );
  const [featurePendingId, setFeaturePendingId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [, startFeatureTransition] = useTransition();
  const [, startDeleteTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3400);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const matching = products.filter((product) => {
      const queryMatches =
        !normalizedQuery ||
        product.title.toLowerCase().includes(normalizedQuery) ||
        product.collection.toLowerCase().includes(normalizedQuery);

      const statusMatches = statusFilter === "all" || product.status === statusFilter;
      const rarityMatches = rarityFilter === "all" || product.rarity === rarityFilter;
      const featuredMatches = matchesFeaturedFilter(product, featuredFilter);

      return queryMatches && statusMatches && rarityMatches && featuredMatches;
    });

    return sortProducts(matching, sortBy);
  }, [deferredQuery, featuredFilter, products, rarityFilter, sortBy, statusFilter]);

  const activeProduct =
    products.find((product) => product.id === activeProductId) ?? null;

  function applyProductPatch(nextProduct: ProductRecord) {
    setProducts((current) =>
      current
        .map((product) => {
          if (product.id === nextProduct.id) {
            return nextProduct;
          }

          if (nextProduct.homepageFeatured) {
            return {
              ...product,
              homepageFeatured: false,
              featuredStartedAt: null,
            };
          }

          return product;
        })
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        ),
    );
  }

  function handleFeature(productId: string) {
    startFeatureTransition(async () => {
      setFeaturePendingId(productId);
      try {
        const formData = new FormData();
        formData.append("id", productId);
        const result = await featureHomepageProductInlineAction(formData);

        if (!result.ok) {
          setToast({
            tone: "error",
            message: result.error,
          });
          return;
        }

        if (!result.product) {
          setToast({
            tone: "error",
            message: "The featured product response was incomplete.",
          });
          return;
        }

        applyProductPatch(result.product);
        setToast({
          tone: "success",
          message: result.message,
        });
      } finally {
        setFeaturePendingId(null);
      }
    });
  }

  function handleDelete(product: ProductRecord) {
    if (
      !window.confirm(
        `Archive ${product.title}? This will remove it from the marketplace and clear any homepage feature state.`,
      )
    ) {
      return;
    }

    startDeleteTransition(async () => {
      setDeletePendingId(product.id);
      try {
        const formData = new FormData();
        formData.append("id", product.id);
        const result = await deleteProductInlineAction(formData);

        if (!result.ok) {
          setToast({
            tone: "error",
            message: result.error,
          });
          return;
        }

        setProducts((current) => current.filter((item) => item.id !== product.id));
        if (activeProductId === product.id) {
          setActiveProductId(null);
        }
        setToast({
          tone: "success",
          message: result.message,
        });
      } finally {
        setDeletePendingId(null);
      }
    });
  }

  return (
    <>
      <AnimatePresence>
        {toast ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "fixed right-5 top-5 z-[220] w-[min(420px,calc(100vw-2rem))] rounded-[16px] border px-4 py-3 text-sm shadow-[0_24px_64px_rgba(15,23,42,0.12)] backdrop-blur",
              toast.tone === "success"
                ? "border-emerald-200 bg-white/96 text-emerald-700"
                : "border-rose-200 bg-white/96 text-rose-700",
            )}
            exit={{ opacity: 0, y: -12 }}
            initial={{ opacity: 0, y: -18 }}
          >
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="rounded-[18px] border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
              Product Control
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
              Clean archive product management
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              Scan published collectibles quickly, feature a single homepage hero
              object, and open full edit mode only when you need the complete metadata.
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/upload">Add Product</Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.4fr_repeat(4,minmax(0,0.68fr))]">
          <label className="flex items-center gap-3 rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3">
            <Search className="size-4 text-muted" />
            <input
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or collection"
              value={query}
            />
          </label>

          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | ProductStatus)
            }
            value={statusFilter}
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setRarityFilter(event.target.value as "all" | Rarity)
            }
            value={rarityFilter}
          >
            <option value="all">All rarity</option>
            {productRarities.map((rarity) => (
              <option key={rarity} value={rarity}>
                {rarity}
              </option>
            ))}
          </select>

          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setFeaturedFilter(
                event.target.value as "all" | "homepage" | "featured" | "regular",
              )
            }
            value={featuredFilter}
          >
            <option value="all">All feature states</option>
            <option value="homepage">Homepage hero</option>
            <option value="featured">Featured releases</option>
            <option value="regular">Regular products</option>
          </select>

          <select
            className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none"
            onChange={(event) =>
              setSortBy(
                event.target.value as
                  | "newest"
                  | "price-high"
                  | "price-low"
                  | "stock-high"
                  | "stock-low",
              )
            }
            value={sortBy}
          >
            <option value="newest">Newest</option>
            <option value="price-high">Price high</option>
            <option value="price-low">Price low</option>
            <option value="stock-high">Stock high</option>
            <option value="stock-low">Stock low</option>
          </select>
        </div>

        {products.length === 0 ? (
          <div className="mt-6 rounded-[18px] border border-dashed border-line bg-[var(--background-soft)] px-6 py-14 text-center">
            <div className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
              No products yet. Upload your first archive collectible.
            </div>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted">
              Once your first product is published, it will appear here with homepage
              controls, editing tools, and image management.
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href="/admin/upload">Add Product</Link>
              </Button>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="mt-6 rounded-[18px] border border-dashed border-line bg-[var(--background-soft)] px-6 py-12 text-center text-sm leading-7 text-muted">
            No products match the current filters.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="grid gap-4 rounded-[18px] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(250,250,252,0.98)_100%)] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] lg:grid-cols-[108px_minmax(0,1fr)_auto]"
              >
                <div className="w-[92px] sm:w-[108px]">
                  <CardArtwork card={product} className="aspect-[4/5] w-full" compact />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-start gap-2">
                    <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                      {product.title}
                    </h3>
                    {product.homepageFeatured ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(120,112,241,0.12)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
                        <Sparkles className="size-3.5" />
                        Homepage Hero
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-muted">{product.collection}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <InfoPill>{formatCurrency(product.price, product.currency)}</InfoPill>
                    <InfoPill>{product.rarity}</InfoPill>
                    <InfoPill>{product.status === "active" ? "Active" : "Inactive"}</InfoPill>
                    <InfoPill>Stock {product.stock}</InfoPill>
                    {product.featured ? <InfoPill>Featured release</InfoPill> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:max-w-[248px] lg:flex-col xl:flex-row xl:justify-end">
                  <Button
                    onClick={() => setActiveProductId(product.id)}
                    type="button"
                    variant="secondary"
                  >
                    <PencilLine className="size-4" />
                    Edit
                  </Button>
                  <Button
                    disabled={featurePendingId === product.id}
                    onClick={() => handleFeature(product.id)}
                    type="button"
                    variant="secondary"
                  >
                    <Star className="size-4" />
                    {product.homepageFeatured ? "Featured on Homepage" : "Feature on Homepage"}
                  </Button>
                  <Button
                    className="text-rose-600 hover:text-rose-700"
                    disabled={deletePendingId === product.id}
                    onClick={() => handleDelete(product)}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {activeProduct ? (
          <ProductEditDrawer
            key={activeProduct.id}
            onClose={() => setActiveProductId(null)}
            onFeature={handleFeature}
            onNotify={setToast}
            onSaved={(nextProduct) => {
              applyProductPatch(nextProduct);
              setActiveProductId(null);
            }}
            product={activeProduct}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function ProductEditDrawer({
  product,
  onClose,
  onSaved,
  onNotify,
  onFeature,
}: {
  product: ProductRecord;
  onClose: () => void;
  onSaved: (product: ProductRecord) => void;
  onNotify: (toast: ToastState) => void;
  onFeature: (productId: string) => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(() => createDraft(product));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(createDraft(product));
    setImageFile(null);
    setRemoveImage(false);
    setPreviewUrl(null);
  }, [product]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const isDirty =
    normalizeDraft(draft) !== normalizeDraft(createDraft(product)) ||
    Boolean(imageFile) ||
    (removeImage && Boolean(product.imageUrl));

  const displayedImageUrl = previewUrl ?? (removeImage ? null : product.imageUrl);
  const previewProduct: ProductRecord = {
    ...product,
    title: draft.title,
    collection: draft.collection,
    category: draft.category,
    edition: draft.edition,
    rarity: draft.rarity,
    shape: draft.shape,
    price: Number(draft.price || product.price),
    currency: draft.currency,
    stock: Number(draft.stock || product.stock),
    defaultDeliveryType: draft.defaultDeliveryType,
    status: draft.status,
    tagline: draft.tagline,
    description: draft.description,
    deliveryDigital: draft.deliveryDigital,
    deliveryPhysical: draft.deliveryPhysical,
    featured: draft.featured,
    homepageFeatured: draft.homepageFeatured,
    imageUrl: displayedImageUrl,
    palette: getPaletteByRarity(draft.rarity),
  };

  function updateField<Key extends keyof ProductDraft>(key: Key, value: ProductDraft[Key]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleIncomingFile(file: File | null) {
    if (!file) {
      return;
    }

    try {
      validateProductImageFile(file);
    } catch (error) {
      onNotify({
        tone: "error",
        message: error instanceof Error ? error.message : "Upload a valid image file.",
      });
      return;
    }

    setRemoveImage(false);
    setImageFile(file);
  }

  function handleSubmit() {
    if (!isDirty || isPending) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("id", product.id);
      formData.append("title", draft.title);
      formData.append("collection", draft.collection);
      formData.append("category", draft.category);
      formData.append("edition", draft.edition);
      formData.append("rarity", draft.rarity);
      formData.append("shape", draft.shape);
      formData.append("price", draft.price);
      formData.append("currency", draft.currency);
      formData.append("stock", draft.stock);
      formData.append("defaultDeliveryType", draft.defaultDeliveryType);
      formData.append("status", draft.status);
      formData.append("tagline", draft.tagline);
      formData.append("description", draft.description);
      formData.append("deliveryDigital", draft.deliveryDigital);
      formData.append("deliveryPhysical", draft.deliveryPhysical);
      formData.append("featured", draft.featured ? "true" : "false");
      formData.append(
        "homepageFeatured",
        draft.homepageFeatured ? "true" : "false",
      );
      formData.append("currentImageUrl", product.imageUrl ?? "");
      formData.append("currentImagePath", product.imagePath ?? "");
      formData.append("currentImageUpdatedAt", product.imageUpdatedAt ?? "");
      formData.append("removeImage", removeImage ? "true" : "false");

      if (imageFile) {
        formData.append("image", imageFile);
      }

      const result = await updateProductInlineAction(formData);

      if (!result.ok) {
        onNotify({
          tone: "error",
          message: result.error,
        });
        return;
      }

      if (!result.product) {
        onNotify({
          tone: "error",
          message: "The updated product response was incomplete.",
        });
        return;
      }

      onSaved(result.product);
      onNotify({
        tone: "success",
        message: result.message,
      });
    });
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[210] bg-[rgba(248,248,251,0.54)] backdrop-blur-[10px]"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.aside
        animate={{ x: 0 }}
        className="absolute inset-y-0 right-0 w-full max-w-[680px] overflow-y-auto border-l border-line bg-[rgba(255,255,255,0.94)] shadow-[0_20px_90px_rgba(15,23,42,0.12)]"
        exit={{ x: 48 }}
        initial={{ x: 60 }}
        onClick={(event) => event.stopPropagation()}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sticky top-0 z-10 border-b border-line bg-[rgba(255,255,255,0.92)] px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
                Edit Product
              </div>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {product.title}
              </h3>
              <div className="mt-2 text-sm text-muted">
                {product.collection} · {product.status}
              </div>
            </div>
            <button
              className="rounded-full border border-line bg-white p-2 text-muted transition hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="space-y-6 p-5">
          <section className="rounded-[18px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#fbfbfd_100%)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Archive preview
                </div>
                <div className="mt-1 text-sm leading-6 text-muted">
                  Change the artwork, replace the featured visual, or remove the image entirely.
                </div>
              </div>
              {draft.homepageFeatured ? (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(120,112,241,0.18)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]"
                  onClick={() => onFeature(product.id)}
                  type="button"
                >
                  <Star className="size-3.5" />
                  Homepage Hero
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(260px,0.92fr)]">
              <div className="rounded-[18px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#f6f8fc_100%)] p-3">
                <FeaturedArtifactPreview product={previewProduct} />
              </div>

              <div className="space-y-4">
                <div className="rounded-[16px] border border-line bg-white p-3">
                  <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted">
                    Artwork Source
                  </div>
                  <div className="w-full max-w-[220px]">
                    {displayedImageUrl ? (
                      <div className="overflow-hidden rounded-[16px] border border-line bg-white p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={draft.title}
                          className="aspect-[4/5] w-full rounded-[12px] object-cover"
                          src={displayedImageUrl}
                        />
                      </div>
                    ) : (
                      <CardArtwork
                        card={{ ...product, imageUrl: null }}
                        className="aspect-[4/5] w-full"
                      />
                    )}
                  </div>
                </div>

                <div
                className={cn(
                  "rounded-[16px] border border-dashed border-line bg-[var(--background-soft)] p-5 transition",
                  isDragActive &&
                    "border-[rgba(120,112,241,0.5)] bg-[rgba(120,112,241,0.06)]",
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                  handleIncomingFile(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                  <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <div className="flex size-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                      <ImagePlus className="size-5" />
                    </div>
                    Drag new artwork here or choose an image
                  </div>
                  <div className="mt-3 text-sm leading-6 text-muted">
                    PNG, JPG, JPEG, or WEBP up to 5 MB. The archive preview updates before saving.
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                      variant="secondary"
                    >
                      Change Image
                    </Button>
                    <Button
                      onClick={() => {
                        setImageFile(null);
                        setRemoveImage(Boolean(product.imageUrl));
                      }}
                      type="button"
                      variant="ghost"
                    >
                      Remove Image
                    </Button>
                  </div>
                  <input
                    accept={PRODUCT_IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(event) =>
                      handleIncomingFile(event.target.files?.[0] ?? null)
                    }
                    ref={fileInputRef}
                    type="file"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[18px] border border-line bg-white p-5">
            <div className="text-sm font-semibold text-foreground">Product fields</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field
                label="Product Title"
                value={draft.title}
                onChange={(value) => updateField("title", value)}
              />
              <Field
                label="Collection"
                value={draft.collection}
                onChange={(value) => updateField("collection", value)}
              />
              <Field
                label="Series / Archive ID"
                value={draft.edition}
                onChange={(value) => updateField("edition", value)}
              />
              <Field
                label="Category"
                value={draft.category}
                onChange={(value) => updateField("category", value)}
              />
              <SelectField
                label="Rarity"
                onChange={(value) => updateField("rarity", value as Rarity)}
                options={productRarities}
                value={draft.rarity}
              />
              <SelectField
                label="Shape"
                onChange={(value) =>
                  updateField("shape", value as ProductRecord["shape"])
                }
                options={productShapes}
                value={draft.shape}
              />
              <Field
                label="Price"
                onChange={(value) => updateField("price", value)}
                type="number"
                value={draft.price}
              />
              <SelectField
                label="Currency"
                onChange={(value) => updateField("currency", value as SupportedCurrency)}
                options={supportedCurrencies}
                value={draft.currency}
              />
              <Field
                label="Stock"
                onChange={(value) => updateField("stock", value)}
                type="number"
                value={draft.stock}
              />
              <SelectField
                label="Delivery Type"
                onChange={(value) =>
                  updateField("defaultDeliveryType", value as DeliveryType)
                }
                options={["digital", "physical"]}
                value={draft.defaultDeliveryType}
              />
              <SelectField
                label="Status"
                onChange={(value) => updateField("status", value as ProductStatus)}
                options={["active", "inactive"]}
                value={draft.status}
              />
              <Field
                label="Tagline"
                value={draft.tagline}
                onChange={(value) => updateField("tagline", value)}
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ToggleField
                checked={draft.featured}
                description="Highlight this card inside discovery and archive release surfaces."
                label="Featured release"
                onChange={(value) => updateField("featured", value)}
              />
              <ToggleField
                checked={draft.homepageFeatured}
                description="Only one product can occupy the homepage hero object at a time."
                label="Show on Homepage Hero"
                onChange={(value) => updateField("homepageFeatured", value)}
              />
            </div>

            <div className="mt-4 space-y-3">
              <TextAreaField
                label="Description"
                onChange={(value) => updateField("description", value)}
                value={draft.description}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <TextAreaField
                  label="Digital Delivery"
                  onChange={(value) => updateField("deliveryDigital", value)}
                  value={draft.deliveryDigital}
                />
                <TextAreaField
                  label="Physical Delivery"
                  onChange={(value) => updateField("deliveryPhysical", value)}
                  value={draft.deliveryPhysical}
                />
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-[rgba(255,255,255,0.92)] px-4 py-4 shadow-[0_-18px_36px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="text-sm leading-6 text-muted">
              {isDirty
                ? "Unsaved changes are ready to publish across the marketplace."
                : "No unsaved changes yet."}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={onClose} type="button" variant="secondary">
                Cancel
              </Button>
              <Button disabled={!isDirty || isPending} onClick={handleSubmit} type="button">
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

function InfoPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-muted">
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <input
        className="w-full rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none transition focus:border-[rgba(120,112,241,0.3)]"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <select
        className="w-full rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-foreground outline-none transition focus:border-[rgba(120,112,241,0.3)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <textarea
        className="min-h-[120px] w-full rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm leading-7 text-foreground outline-none transition focus:border-[rgba(120,112,241,0.3)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      className={cn(
        "flex items-start justify-between gap-4 rounded-[16px] border px-4 py-4 text-left transition",
        checked
          ? "border-[rgba(120,112,241,0.32)] bg-[rgba(120,112,241,0.08)]"
          : "border-line bg-[var(--background-soft)]",
      )}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-2 text-sm leading-6 text-muted">{description}</div>
      </div>
      <div
        className={cn(
          "mt-1 flex size-6 items-center justify-center rounded-full border transition",
          checked
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-line bg-white text-transparent",
        )}
      >
        <Check className="size-3.5" />
      </div>
    </button>
  );
}

function FeaturedArtifactPreview({ product }: { product: ProductRecord }) {
  return (
    <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-[16px] border border-white/60 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.94),rgba(245,247,252,0.88)_48%,rgba(238,242,248,0.92)_100%)] p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(139,124,255,0.14),transparent_34%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.84),transparent_32%)]" />
      <div className="absolute inset-x-[18%] top-[16%] h-[34%] rounded-full border border-[rgba(218,223,235,0.8)]" />
      <div className="absolute inset-x-[28%] top-[22%] h-[24%] rounded-full border border-[rgba(230,234,244,0.92)]" />
      <motion.div
        animate={{ y: [0, -4, 0] }}
        className="relative z-10 w-full max-w-[250px]"
        transition={{ duration: 5.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <div className="absolute inset-x-[12%] bottom-[-24px] h-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(139,124,255,0.14),transparent_72%)] blur-xl" />
        <div className="overflow-hidden rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-[rgba(255,255,255,0.56)] p-3 shadow-[0_24px_48px_rgba(15,23,42,0.08)]">
          <div className="rounded-[8px] border border-[rgba(255,255,255,0.9)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(245,247,251,0.9))] p-3">
            <CardArtwork card={product} className="aspect-[4/5] w-full" />
          </div>
        </div>
        <div className="mx-auto h-8 w-[88%] rounded-b-[8px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#eceff5_100%)]" />
      </motion.div>
      <div className="absolute bottom-5 left-5 rounded-full border border-white/80 bg-white/86 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-muted shadow-[0_10px_20px_rgba(15,23,42,0.04)] backdrop-blur">
        Homepage Preview
      </div>
    </div>
  );
}
