export type PrintFieldType = "text" | "textarea" | "barcode" | "checkbox";

export type PrintField = {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  required?: boolean;
  type?: PrintFieldType;
  fontSize?: number;
  maxFontSize?: number;
  minFontSize?: number;
  align?: "left" | "center" | "right";
  weight?: "normal" | "medium" | "semibold" | "bold";
  baselineOffset?: number;
};

export type PrintZone = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

export type PrintTemplate = {
  id: string;
  name: string;
  carrier: string;
  version: string;
  page: "A4";
  orientation?: "portrait" | "landscape";
  widthMm: number;
  heightMm: number;
  description: string;
  backgroundImageUrl?: string;
  zones: Record<string, PrintZone>;
  protectedZones?: PrintZone[];
  fields: PrintField[];
};

export type PrintDocumentData = {
  sender: {
    name: string;
    phone: string;
    address: string;
    country: string;
  };
  receiver: {
    name: string;
    phone: string;
    address: string;
    country: string;
  };
  package: {
    tracking_id: string;
    weight: string;
    description: string;
  };
  payment: {
    method: string;
    currency: string;
    amount: string;
  };
  meta: {
    timestamp: string;
    order_id: string;
  };
};

export const defaultPrintData: PrintDocumentData = {
  sender: {
    name: "",
    phone: "",
    address: "",
    country: "",
  },
  receiver: {
    name: "",
    phone: "",
    address: "",
    country: "",
  },
  package: {
    tracking_id: "",
    weight: "",
    description: "",
  },
  payment: {
    method: "",
    currency: "",
    amount: "",
  },
  meta: {
    timestamp: new Date().toISOString(),
    order_id: "",
  },
};

const commonA4 = {
  page: "A4" as const,
  orientation: "portrait" as const,
  widthMm: 210,
  heightMm: 297,
};

const commonA4Landscape = {
  page: "A4" as const,
  orientation: "landscape" as const,
  widthMm: 297,
  heightMm: 210,
};

export const printTemplates: PrintTemplate[] = [
  {
    ...commonA4Landscape,
    id: "POST_SERBIA_EXPRESS",
    name: "Serbian Post Express",
    carrier: "Post Express Serbia",
    version: "1.0",
    description: "Real Post Express Serbia receipt overlay using /uploads/check.jpg as a locked A4 landscape form.",
    backgroundImageUrl: "/uploads/check.jpg",
    zones: {
      header: { x: 9, y: 9, w: 279, h: 20 },
      sender: { x: 9, y: 29, w: 130, h: 50 },
      receiver: { x: 9, y: 80, w: 130, h: 49 },
      service: { x: 139, y: 29, w: 77, h: 63 },
      payment: { x: 216, y: 29, w: 72, h: 63 },
      services: { x: 139, y: 93, w: 149, h: 66 },
      description: { x: 139, y: 159, w: 149, h: 24 },
      note: { x: 9, y: 185, w: 279, h: 16 },
    },
    protectedZones: [
      { label: "Main header", x: 8, y: 7, w: 280, h: 12 },
      { label: "Top row labels", x: 9, y: 23.8, w: 279, h: 1.4 },
      { label: "Sender title", x: 9, y: 29.5, w: 130, h: 6 },
      { label: "Sender right labels", x: 91, y: 36, w: 46, h: 34 },
      { label: "Sender phone label", x: 9, y: 73, w: 45, h: 5 },
      { label: "Receiver title", x: 9, y: 82, w: 130, h: 6 },
      { label: "Receiver right labels", x: 91, y: 88, w: 46, h: 34 },
      { label: "Receiver phone label", x: 9, y: 125.8, w: 45, h: 4.2 },
      { label: "Service options", x: 139, y: 29, w: 77, h: 64 },
      { label: "Payment options", x: 216, y: 29, w: 72, h: 64 },
      { label: "Requested services", x: 139, y: 93, w: 149, h: 65 },
      { label: "Signature area", x: 9, y: 139, w: 130, h: 43 },
      { label: "Description labels", x: 139, y: 159, w: 149, h: 7 },
      { label: "Footer legal text", x: 9, y: 189, w: 279, h: 16 },
    ],
    fields: [
      { key: "meta.timestamp", label: "Date/time", x: 22, y: 20.3, w: 41, h: 3.1, minFontSize: 1.62, maxFontSize: 1.82 },
      { key: "package.tracking_id", label: "Tracking", x: 124.5, y: 20.3, w: 38, h: 3.1, required: true, minFontSize: 1.62, maxFontSize: 1.82 },
      { key: "package.weight", label: "Weight", x: 178.5, y: 20.3, w: 18, h: 3.1, required: true, minFontSize: 1.62, maxFontSize: 1.82 },
      { key: "sender.name", label: "Sender name", x: 14, y: 39.4, w: 72, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "sender.street", label: "Sender street", x: 14, y: 49.5, w: 72, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "sender.city", label: "Sender city", x: 14, y: 59.8, w: 72, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "sender.country", label: "Sender country", x: 14, y: 68.8, w: 72, h: 4.2, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "sender.phone", label: "Sender phone", x: 56.5, y: 76, w: 42, h: 4.2, required: true, minFontSize: 2.15, maxFontSize: 2.35 },
      { key: "receiver.name", label: "Receiver name", x: 14, y: 91.8, w: 72, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "receiver.street", label: "Receiver street", x: 14, y: 101.9, w: 72, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "receiver.city", label: "Receiver city", x: 14, y: 112.2, w: 72, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "receiver.country", label: "Receiver country", x: 14, y: 121, w: 72, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.48 },
      { key: "receiver.phone", label: "Receiver phone", x: 56.5, y: 128.2, w: 42, h: 4.2, required: true, minFontSize: 2.15, maxFontSize: 2.35 },
      { key: "package.description", label: "Description", x: 143, y: 167.2, w: 91, h: 4.2, required: true, minFontSize: 2.25, maxFontSize: 2.42 },
    ],
  },
  {
    ...commonA4,
    id: "DHL_A4_STANDARD",
    name: "DHL A4 Standard",
    carrier: "DHL",
    version: "1.0",
    description: "Clean DHL-style internal shipping label layout.",
    zones: {
      sender: { x: 12, y: 40, w: 82, h: 46 },
      receiver: { x: 12, y: 96, w: 88, h: 52 },
      package: { x: 112, y: 40, w: 84, h: 48 },
      meta: { x: 112, y: 98, w: 84, h: 42 },
    },
    fields: [
      { key: "package.tracking_id", label: "Tracking", x: 116, y: 20, w: 74, h: 12, required: true, type: "barcode", align: "center" },
      { key: "sender.name", label: "Sender name", x: 16, y: 46, w: 70, h: 7, required: true },
      { key: "sender.address", label: "Sender address", x: 16, y: 58, w: 70, h: 18, required: true, type: "textarea" },
      { key: "receiver.name", label: "Receiver name", x: 16, y: 104, w: 76, h: 8, required: true, weight: "bold" },
      { key: "receiver.address", label: "Receiver address", x: 16, y: 116, w: 76, h: 20, required: true, type: "textarea" },
      { key: "receiver.phone", label: "Receiver phone", x: 16, y: 140, w: 76, h: 7 },
      { key: "package.weight", label: "Weight", x: 118, y: 48, w: 36, h: 8, required: true },
      { key: "package.description", label: "Description", x: 118, y: 62, w: 68, h: 16, type: "textarea" },
      { key: "meta.order_id", label: "Order ID", x: 118, y: 104, w: 68, h: 7, required: true },
    ],
  },
  {
    ...commonA4,
    id: "BPOST_BE_A4",
    name: "Bpost Belgium",
    carrier: "Bpost",
    version: "1.0",
    description: "Belgium courier receipt template.",
    zones: {
      receiver: { x: 18, y: 52, w: 92, h: 58 },
      package: { x: 118, y: 52, w: 74, h: 48 },
      meta: { x: 18, y: 128, w: 174, h: 40 },
    },
    fields: [
      { key: "package.tracking_id", label: "Tracking", x: 24, y: 24, w: 154, h: 12, required: true, type: "barcode", align: "center" },
      { key: "receiver.name", label: "Receiver name", x: 24, y: 62, w: 78, h: 8, required: true, weight: "bold" },
      { key: "receiver.address", label: "Receiver address", x: 24, y: 76, w: 78, h: 22, required: true, type: "textarea" },
      { key: "receiver.country", label: "Receiver country", x: 24, y: 102, w: 78, h: 7, required: true },
      { key: "package.weight", label: "Weight", x: 124, y: 62, w: 32, h: 8 },
      { key: "meta.order_id", label: "Order ID", x: 24, y: 138, w: 72, h: 7, required: true },
      { key: "payment.amount", label: "Amount", x: 124, y: 138, w: 38, h: 7 },
    ],
  },
  {
    ...commonA4,
    id: "LA_POSTE_FR_A4",
    name: "La Poste France",
    carrier: "La Poste",
    version: "1.0",
    description: "French A4 shipment receipt.",
    zones: {
      sender: { x: 14, y: 38, w: 82, h: 42 },
      receiver: { x: 14, y: 92, w: 94, h: 54 },
      package: { x: 116, y: 38, w: 80, h: 60 },
    },
    fields: [
      { key: "package.tracking_id", label: "Tracking", x: 118, y: 18, w: 72, h: 12, required: true, type: "barcode", align: "center" },
      { key: "sender.name", label: "Sender name", x: 20, y: 46, w: 68, h: 7, required: true },
      { key: "sender.address", label: "Sender address", x: 20, y: 58, w: 68, h: 16, type: "textarea" },
      { key: "receiver.name", label: "Receiver name", x: 20, y: 102, w: 82, h: 8, required: true, weight: "bold" },
      { key: "receiver.address", label: "Receiver address", x: 20, y: 116, w: 82, h: 20, required: true, type: "textarea" },
      { key: "receiver.phone", label: "Receiver phone", x: 20, y: 140, w: 82, h: 7 },
      { key: "package.description", label: "Description", x: 122, y: 54, w: 64, h: 18, type: "textarea" },
      { key: "package.weight", label: "Weight", x: 122, y: 78, w: 30, h: 8 },
      { key: "meta.order_id", label: "Order ID", x: 122, y: 88, w: 60, h: 7 },
    ],
  },
  {
    ...commonA4,
    id: "POSTE_ITALIANE_A4",
    name: "Poste Italiane",
    carrier: "Poste Italiane",
    version: "1.0",
    description: "Italian postal receipt layout.",
    zones: {
      sender: { x: 16, y: 42, w: 80, h: 40 },
      receiver: { x: 16, y: 94, w: 92, h: 54 },
      payment: { x: 118, y: 94, w: 76, h: 40 },
    },
    fields: [
      { key: "package.tracking_id", label: "Tracking", x: 116, y: 20, w: 74, h: 12, required: true, type: "barcode", align: "center" },
      { key: "sender.name", label: "Sender name", x: 22, y: 50, w: 66, h: 7, required: true },
      { key: "sender.address", label: "Sender address", x: 22, y: 62, w: 66, h: 15, type: "textarea" },
      { key: "receiver.name", label: "Receiver name", x: 22, y: 104, w: 78, h: 8, required: true, weight: "bold" },
      { key: "receiver.address", label: "Receiver address", x: 22, y: 118, w: 78, h: 20, required: true, type: "textarea" },
      { key: "payment.method", label: "Payment method", x: 124, y: 104, w: 44, h: 7 },
      { key: "payment.amount", label: "Amount", x: 124, y: 118, w: 44, h: 7 },
      { key: "meta.order_id", label: "Order ID", x: 124, y: 132, w: 58, h: 7 },
    ],
  },
  {
    ...commonA4,
    id: "GENERIC_EU_COURIER",
    name: "Generic EU Courier",
    carrier: "EU Courier",
    version: "1.0",
    description: "Neutral EU courier template for fallback shipments.",
    zones: {
      sender: { x: 12, y: 36, w: 82, h: 46 },
      receiver: { x: 12, y: 92, w: 90, h: 56 },
      package: { x: 112, y: 36, w: 86, h: 50 },
      payment: { x: 112, y: 96, w: 86, h: 38 },
    },
    fields: [
      { key: "package.tracking_id", label: "Tracking", x: 24, y: 18, w: 154, h: 12, required: true, type: "barcode", align: "center" },
      { key: "sender.name", label: "Sender name", x: 18, y: 44, w: 68, h: 7, required: true },
      { key: "sender.phone", label: "Sender phone", x: 18, y: 55, w: 68, h: 7 },
      { key: "sender.address", label: "Sender address", x: 18, y: 66, w: 68, h: 14, required: true, type: "textarea" },
      { key: "receiver.name", label: "Receiver name", x: 18, y: 102, w: 78, h: 8, required: true, weight: "bold" },
      { key: "receiver.phone", label: "Receiver phone", x: 18, y: 114, w: 78, h: 7 },
      { key: "receiver.address", label: "Receiver address", x: 18, y: 125, w: 78, h: 18, required: true, type: "textarea" },
      { key: "package.weight", label: "Weight", x: 118, y: 46, w: 34, h: 8, required: true },
      { key: "package.description", label: "Description", x: 118, y: 60, w: 68, h: 18, type: "textarea" },
      { key: "payment.method", label: "Payment method", x: 118, y: 106, w: 40, h: 7 },
      { key: "payment.amount", label: "Amount", x: 162, y: 106, w: 28, h: 7 },
      { key: "meta.order_id", label: "Order ID", x: 118, y: 122, w: 60, h: 7, required: true },
    ],
  },
];

export function getPrintTemplate(templateId: string) {
  return printTemplates.find((template) => template.id === templateId) ?? printTemplates[0];
}

export function getPrintDataValue(data: PrintDocumentData, key: string) {
  if (key === "sender.street") {
    return splitPostalAddress(data.sender.address, data.sender.country).street;
  }
  if (key === "sender.city") {
    return splitPostalAddress(data.sender.address, data.sender.country).city;
  }
  if (key === "receiver.street") {
    return splitPostalAddress(data.receiver.address, data.receiver.country).street;
  }
  if (key === "receiver.city") {
    return splitPostalAddress(data.receiver.address, data.receiver.country).city;
  }

  return key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return "";
    }
    return (current as Record<string, unknown>)[segment];
  }, data) ?? "";
}

function splitPostalAddress(address: string, fallbackCountry: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    street: parts[0] ?? "",
    city: parts[1] ?? "",
    country: parts[2] ?? fallbackCountry,
  };
}
