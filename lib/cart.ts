import {
  type CartLine,
  type DeliveryType,
  type ProductRecord,
} from "@/lib/rebohrome-data";

export const PHYSICAL_SHIPPING_FEE = 18;

export type ResolvedCartLine = {
  key: string;
  productId: string;
  quantity: number;
  deliveryType: DeliveryType;
  product: ProductRecord | null;
  lineTotal: number;
  isAvailable: boolean;
};

export function getCartSummary(lines: CartLine[], products: ProductRecord[]) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const items = lines.map((line) => {
    const product = productMap.get(line.productId) ?? null;
    const lineTotal = product ? product.price * line.quantity : 0;
    const isAvailable = product ? product.stock >= line.quantity : false;

    return {
      key: `${line.productId}:${line.deliveryType}`,
      productId: line.productId,
      quantity: line.quantity,
      deliveryType: line.deliveryType,
      product,
      lineTotal,
      isAvailable,
    } satisfies ResolvedCartLine;
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = items.some(
    (item) => item.deliveryType === "physical" && item.quantity > 0,
  )
    ? PHYSICAL_SHIPPING_FEE
    : 0;

  return {
    items,
    subtotal,
    shipping,
    total: subtotal + shipping,
    isEmpty: items.length === 0,
    hasInvalidItems: items.some((item) => !item.isAvailable),
  };
}
