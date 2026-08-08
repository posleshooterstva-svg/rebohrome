"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Download,
  Eye,
  Grid2X2,
  Highlighter,
  Printer,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  defaultPrintData,
  getPrintDataValue,
  getPrintTemplate,
  printTemplates,
  type PrintDocumentData,
  type PrintField,
  type PrintZone,
} from "@/lib/print-engine/templates";
import { cn } from "@/lib/utils";

type FlatField = {
  key: string;
  label: string;
  value: string;
  type?: "text" | "textarea";
  required?: boolean;
};

const fieldGroups: Array<{ title: string; fields: FlatField[] }> = [
  {
    title: "Sender",
    fields: [
      { key: "sender.name", label: "Name", value: "", required: true },
      { key: "sender.phone", label: "Phone", value: "", required: true },
      { key: "sender.address", label: "Address", value: "", type: "textarea", required: true },
      { key: "sender.country", label: "Country", value: "" },
    ],
  },
  {
    title: "Receiver",
    fields: [
      { key: "receiver.name", label: "Name", value: "", required: true },
      { key: "receiver.phone", label: "Phone", value: "", required: true },
      { key: "receiver.address", label: "Address", value: "", type: "textarea", required: true },
      { key: "receiver.country", label: "Country", value: "", required: true },
    ],
  },
  {
    title: "Package",
    fields: [
      { key: "package.tracking_id", label: "Tracking ID", value: "", required: true },
      { key: "package.weight", label: "Weight", value: "", required: true },
      { key: "package.description", label: "Description", value: "", type: "textarea", required: true },
    ],
  },
  {
    title: "Payment / Meta",
    fields: [
      { key: "payment.method", label: "Payment method", value: "" },
      { key: "payment.currency", label: "Currency", value: "" },
      { key: "payment.amount", label: "Amount", value: "" },
      { key: "meta.order_id", label: "Order ID", value: "", required: true },
      { key: "meta.timestamp", label: "Timestamp", value: "" },
    ],
  },
];

function setNestedValue(data: PrintDocumentData, key: string, value: string): PrintDocumentData {
  const [group, field] = key.split(".") as [keyof PrintDocumentData, string];
  return {
    ...data,
    [group]: {
      ...(data[group] as Record<string, string>),
      [field]: value,
    },
  };
}

function normalizeDataForTemplate(data: PrintDocumentData) {
  return {
    ...data,
    meta: {
      ...data.meta,
      timestamp: data.meta.timestamp || new Date().toISOString(),
    },
  };
}

function estimateFontSize(field: PrintField, value: string) {
  const max = field.maxFontSize ?? field.fontSize ?? 3.4;
  const min = field.minFontSize ?? 2.05;
  const cleanValue = value.replace(/\s+/g, " ").trim();
  if (!cleanValue) {
    return max;
  }
  const lines = field.type === "textarea" ? Math.max(1, Math.ceil(cleanValue.length / Math.max(12, field.w / 1.8))) : 1;
  const horizontalFit = (field.w / Math.max(cleanValue.length, 1)) * 1.95;
  const verticalFit = field.h / (lines * 1.45);
  return Math.max(min, Math.min(max, horizontalFit, verticalFit));
}

function getPrintFontSize(field: PrintField, value: string) {
  if (!value.trim()) {
    return field.maxFontSize ?? field.fontSize ?? 2.3;
  }
  return estimateFontSize(field, value);
}

function hasOverflowRisk(field: PrintField, value: string) {
  if (!value.trim()) {
    return false;
  }
  const fontSize = estimateFontSize(field, value);
  return fontSize <= (field.minFontSize ?? 2.05) && value.length > field.w * (field.type === "textarea" ? 2.8 : 1.9);
}

function rectanglesOverlap(first: PrintField | PrintZone, second: PrintField | PrintZone) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function validateDocument(data: PrintDocumentData, templateId: string) {
  const template = getPrintTemplate(templateId);
  const issues: string[] = [];
  const filledFields = template.fields
    .map((field) => ({
      field,
      value: String(getPrintDataValue(data, field.key) ?? "").trim(),
    }))
    .filter((entry) => entry.value);

  if (filledFields.length === 0) {
    issues.push("Template loaded. Fill receipt data.");
  }

  if (template.widthMm !== (template.orientation === "landscape" ? 297 : 210)) {
    issues.push("Template width does not match A4 orientation.");
  }
  if (template.heightMm !== (template.orientation === "landscape" ? 210 : 297)) {
    issues.push("Template height does not match A4 orientation.");
  }
  if (template.id === "POST_SERBIA_EXPRESS" && !template.backgroundImageUrl) {
    issues.push("Serbian Post Express base image is missing.");
  }

  for (const field of template.fields) {
    const value = String(getPrintDataValue(data, field.key) ?? "");
    if (field.x < 0 || field.y < 0 || field.x + field.w > template.widthMm || field.y + field.h > template.heightMm) {
      issues.push(`${field.label} is outside the A4 page boundary.`);
    }
    if (field.required && !value.trim()) {
      issues.push(`${field.label} is required.`);
    }
    if (hasOverflowRisk(field, value)) {
      issues.push(`${field.label} may overflow its print box.`);
    }
    for (const zone of template.protectedZones ?? []) {
      if (value.trim() && rectanglesOverlap(field, zone)) {
        issues.push(`${field.label} overlaps protected template area: ${zone.label ?? "protected zone"}.`);
      }
    }
  }

  const phoneValues = [data.sender.phone, data.receiver.phone].filter(Boolean);
  for (const phone of phoneValues) {
    if (!/^[+\d][\d\s().-]{5,24}$/.test(phone.trim())) {
      issues.push(`Phone format looks invalid: ${phone}`);
    }
  }
  if (!data.package.tracking_id.trim()) {
    issues.push("Shipment entry cannot be empty.");
  }
  if (data.receiver.address.trim().length > 180) {
    issues.push("Receiver address is too long for postal labels.");
  }
  if (data.sender.address.trim().length > 180) {
    issues.push("Sender address is too long for postal labels.");
  }
  for (let index = 0; index < filledFields.length; index += 1) {
    const current = filledFields[index].field;
    for (let nextIndex = index + 1; nextIndex < filledFields.length; nextIndex += 1) {
      const next = filledFields[nextIndex].field;
      if (rectanglesOverlap(current, next)) {
        issues.push(`${current.label} overlaps ${next.label}.`);
      }
    }
  }
  return issues;
}

function formatPrintValue(field: PrintField, value: string) {
  if (field.key !== "meta.timestamp") {
    return value;
  }
  if (!value.trim()) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function PrintEngineClient() {
  const [templateId, setTemplateId] = useState(printTemplates[0].id);
  const [data, setData] = useState<PrintDocumentData>(defaultPrintData);
  const [showGrid, setShowGrid] = useState(false);
  const [showBoxes, setShowBoxes] = useState(false);
  const [highlightOverflow, setHighlightOverflow] = useState(true);
  const [calibrationX, setCalibrationX] = useState(0);
  const [calibrationY, setCalibrationY] = useState(0);
  const [zoom, setZoom] = useState(0.68);
  const [exportAttempted, setExportAttempted] = useState(false);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [templateImageReady, setTemplateImageReady] = useState(false);
  const [templateImageError, setTemplateImageError] = useState(false);
  const template = getPrintTemplate(templateId);
  const normalizedData = useMemo(() => normalizeDataForTemplate(data), [data]);
  const issues = useMemo(() => {
    const nextIssues = validateDocument(normalizedData, templateId);
    if (template.backgroundImageUrl && !templateImageReady) {
      nextIssues.push(
        templateImageError
          ? "Template image failed to load. PDF export was cancelled."
          : "Template image is still loading.",
      );
    }
    return nextIssues;
  }, [normalizedData, template.backgroundImageUrl, templateId, templateImageError, templateImageReady]);

  useEffect(() => {
    if (!template.backgroundImageUrl) {
      setTemplateImageReady(true);
      setTemplateImageError(false);
      return;
    }

    let cancelled = false;
    setTemplateImageError(false);
    setTemplateImageReady(false);
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setTemplateImageReady(true);
        setTemplateImageError(false);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setTemplateImageReady(false);
        setTemplateImageError(true);
      }
    };
    image.src = template.backgroundImageUrl;

    return () => {
      cancelled = true;
    };
  }, [template.backgroundImageUrl, templateId]);

  function updateField(key: string, value: string) {
    setData((current) => setNestedValue(current, key, value));
  }

  function loadSample() {
    setData({
      sender: {
        name: "Mark Kozlov",
        phone: "+381 64 528 9137",
        address: "Kralja Petra 22, 11000 Belgrade, Serbia",
        country: "Serbia",
      },
      receiver: {
        name: "Oliver Wersen",
        phone: "+32 470 583 219",
        address: "Rue de Flandre 58, 1000 Brussels, Belgium",
        country: "Belgium",
      },
      package: {
        tracking_id: "RH-9F3K-2026-BE71",
        weight: "0.1 kg",
        description: "Pokemon Card",
      },
      payment: {
        method: "card",
        currency: "RSD",
        amount: "",
      },
      meta: {
        timestamp: "2026-06-09 12:00:00",
        order_id: "RH-9F3K-2026-BE71",
      },
    });
  }

  async function auditGeneration() {
    setAuditError(null);
    setAuditMessage(null);
    const response = await fetch("/api/admin/print-engine/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        trackingId: normalizedData.package.tracking_id,
        orderId: normalizedData.meta.order_id,
        inputData: normalizedData,
      }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      fileName?: string;
      error?: string;
    };
    if (!payload.ok) {
      throw new Error(payload.error ?? "Receipt audit failed.");
    }
    setAuditMessage(`Generation logged: ${payload.fileName}`);
  }

  async function printDocument() {
    setExportAttempted(true);
    if (issues.length > 0) {
      return;
    }
    try {
      await auditGeneration();
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Receipt audit failed.");
      return;
    }
    window.print();
  }

  async function exportPdf() {
    setExportAttempted(true);
    if (issues.length > 0) {
      return;
    }
    try {
      await auditGeneration();
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Receipt audit failed.");
      return;
    }
    window.print();
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 ${template.orientation === "landscape" ? "landscape" : "portrait"};
          margin: 0;
        }

        .print-engine-print {
          display: none;
        }

        @media print {
          html,
          body {
            width: ${template.widthMm}mm;
            height: ${template.heightMm}mm;
            min-height: ${template.heightMm}mm;
            background: #fff !important;
            overflow: hidden !important;
          }

          .print-engine-screen {
            display: none !important;
          }

          .print-engine-print {
            display: block !important;
            position: fixed !important;
            inset: 0 auto auto 0 !important;
            width: ${template.widthMm}mm !important;
            height: ${template.heightMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #fff !important;
          }

          #print-engine-sheet {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: ${template.widthMm}mm !important;
            height: ${template.heightMm}mm !important;
            min-width: ${template.widthMm}mm !important;
            min-height: ${template.heightMm}mm !important;
            margin: 0 !important;
            transform: none !important;
            box-shadow: none !important;
            border: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-engine-preview-scale {
            width: ${template.widthMm}mm !important;
            height: ${template.heightMm}mm !important;
            margin: 0 !important;
            transform: none !important;
          }

          .print-debug-layer {
            display: none !important;
          }
        }
      `}</style>

      <div className="print-engine-screen space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-line bg-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Template Engine</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">Print Label Engine</h2>
              </div>
              <Boxes className="size-5 text-muted" />
            </div>
            <label className="mt-5 grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Template</span>
              <select
                className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
                onChange={(event) => setTemplateId(event.target.value)}
                value={templateId}
              >
                {printTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm leading-6 text-muted">
              {template.description}
            </div>
          </div>

          <div className="rounded-[24px] border border-line bg-panel p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Data Engine</div>
            <div className="mt-4 grid gap-4">
              {fieldGroups.map((group) => (
                <fieldset className="grid gap-3 rounded-[18px] border border-line bg-panel-strong p-4" key={group.title}>
                  <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">{group.title}</legend>
                  {group.fields.map((field) => {
                    const value = String(getPrintDataValue(data, field.key) ?? "");
                    return (
                      <label className="grid gap-2" key={field.key}>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                        {field.type === "textarea" ? (
                          <textarea
                            className="min-h-20 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                            onChange={(event) => updateField(field.key, event.target.value)}
                            value={value}
                          />
                        ) : (
                          <input
                            className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
                            onChange={(event) => updateField(field.key, event.target.value)}
                            value={value}
                          />
                        )}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-line bg-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Render Engine</div>
                <div className="mt-2 text-sm text-muted">A4 locked / millimeter positioning / overflow-safe fields</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={loadSample} type="button" variant="secondary">
                  <Eye className="size-4" />
                  Sample
                </Button>
                <Button onClick={() => setData(defaultPrintData)} type="button" variant="secondary">
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
                <Button disabled={issues.length > 0} onClick={exportPdf} type="button" variant="secondary">
                  <Download className="size-4" />
                  PDF
                </Button>
                <Button disabled={issues.length > 0} onClick={printDocument} type="button">
                  <Printer className="size-4" />
                  Print
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Toggle active={showGrid} icon={Grid2X2} label="Grid" onClick={() => setShowGrid((value) => !value)} />
              <Toggle active={showBoxes} icon={Boxes} label="Boxes" onClick={() => setShowBoxes((value) => !value)} />
              <Toggle active={highlightOverflow} icon={Highlighter} label="Overflow" onClick={() => setHighlightOverflow((value) => !value)} />
            </div>

            <label className="mt-4 grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Preview zoom</span>
              <select
                className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
                onChange={(event) => setZoom(Number(event.target.value))}
                value={zoom}
              >
                <option value={0.55}>55%</option>
                <option value={0.68}>68%</option>
                <option value={0.82}>82%</option>
                <option value={1}>100%</option>
              </select>
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <CalibrationInput label="Calibration X mm" onChange={setCalibrationX} value={calibrationX} />
              <CalibrationInput label="Calibration Y mm" onChange={setCalibrationY} value={calibrationY} />
            </div>

            {issues.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4" />
                  Validation warnings
                </div>
                <ul className="mt-3 list-inside list-disc space-y-1">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Self-check passed. Use Paper A4, scale 100%, margins none.
              </div>
            )}
            {exportAttempted && issues.length > 0 ? (
              <div className="mt-3 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                Export blocked until self-check passes.
              </div>
            ) : null}
            {auditError ? (
              <div className="mt-3 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {auditError}
              </div>
            ) : null}
            {auditMessage ? (
              <div className="mt-3 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                {auditMessage}
              </div>
            ) : null}
          </div>

          <div className="overflow-auto rounded-[24px] border border-line bg-[#050814] p-5">
            <div
              className="print-engine-preview-scale mx-auto w-fit origin-top"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
              }}
            >
              <PrintSheet
                calibrationX={calibrationX}
                calibrationY={calibrationY}
                data={normalizedData}
                highlightOverflow={highlightOverflow}
                onTemplateImageError={() => {
                  setTemplateImageReady(false);
                  setTemplateImageError(true);
                }}
                onTemplateImageLoad={() => {
                  setTemplateImageReady(true);
                  setTemplateImageError(false);
                }}
                showBoxes={showBoxes}
                showGrid={showGrid}
                sheetId="print-engine-preview-sheet"
                templateId={templateId}
              />
            </div>
          </div>
        </div>
      </section>
      </div>

      <div aria-hidden="true" className="print-engine-print">
        <PrintSheet
          calibrationX={calibrationX}
          calibrationY={calibrationY}
          data={normalizedData}
          highlightOverflow={false}
          showBoxes={false}
          showGrid={false}
          sheetId="print-engine-sheet"
          templateId={templateId}
        />
      </div>
    </>
  );
}

function Toggle({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Grid2X2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition",
        active
          ? "border-violet-300/35 bg-violet-500/15 text-violet-100"
          : "border-line bg-panel-strong text-muted hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function CalibrationInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      <input
        className="rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none"
        max={20}
        min={-20}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        step={0.25}
        type="number"
        value={value}
      />
    </label>
  );
}

function PrintSheet({
  calibrationX,
  calibrationY,
  data,
  highlightOverflow,
  onTemplateImageError,
  onTemplateImageLoad,
  sheetId = "print-engine-sheet",
  showBoxes,
  showGrid,
  templateId,
}: {
  calibrationX: number;
  calibrationY: number;
  data: PrintDocumentData;
  highlightOverflow: boolean;
  onTemplateImageError?: () => void;
  onTemplateImageLoad?: () => void;
  sheetId?: string;
  showBoxes: boolean;
  showGrid: boolean;
  templateId: string;
}) {
  const template = getPrintTemplate(templateId);

  return (
    <div
      id={sheetId}
      className="relative overflow-hidden bg-white text-[#111111] shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
      style={{
        width: `${template.widthMm}mm`,
        height: `${template.heightMm}mm`,
        fontFamily: "'Arial', 'Noto Sans', sans-serif",
        color: "#111111",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {template.backgroundImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-fill"
          data-template-background="true"
          draggable={false}
          onError={onTemplateImageError}
          onLoad={onTemplateImageLoad}
          src={template.backgroundImageUrl}
        />
      ) : null}

      {showGrid ? (
        <div
          className="print-debug-layer pointer-events-none absolute inset-0 z-20 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(124,58,237,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(124,58,237,0.18) 1px, transparent 1px)",
            backgroundSize: "10mm 10mm",
          }}
        />
      ) : null}

      {!template.backgroundImageUrl ? (
        <>
          <div className="absolute left-[10mm] top-[8mm] text-[5mm] font-bold tracking-[0.16em] text-[#20164f]">
            REBOHROME SHIPPING
          </div>
          <div className="absolute right-[10mm] top-[9mm] text-right text-[2.8mm] uppercase tracking-[0.18em] text-[#475569]">
            {template.carrier}
            <br />
            {template.id} / v{template.version}
          </div>
        </>
      ) : null}

      {Object.entries(template.zones).map(([key, zone]) => (
        <div
          className="print-debug-layer absolute rounded-[1.5mm] border border-dashed border-[#8b5cf6]/35 bg-[#8b5cf6]/[0.03]"
          key={key}
          style={{
            display: showBoxes ? "block" : "none",
            left: `${zone.x + calibrationX}mm`,
            top: `${zone.y + calibrationY}mm`,
            width: `${zone.w}mm`,
            height: `${zone.h}mm`,
          }}
        >
          <span className="absolute -top-[4mm] left-0 text-[2.1mm] uppercase tracking-[0.14em] text-[#6d28d9]">
            {key}
          </span>
        </div>
      ))}

      {showBoxes
        ? (template.protectedZones ?? []).map((zone) => (
            <div
              className="print-debug-layer pointer-events-none absolute z-20 rounded-[1mm] border border-dashed border-rose-500/55 bg-rose-500/[0.06]"
              key={`${zone.label}-${zone.x}-${zone.y}`}
              style={{
                left: `${zone.x + calibrationX}mm`,
                top: `${zone.y + calibrationY}mm`,
                width: `${zone.w}mm`,
                height: `${zone.h}mm`,
              }}
            >
              <span className="absolute left-0 top-0 bg-rose-500/90 px-1 text-[1.8mm] uppercase tracking-[0.08em] text-white">
                {zone.label}
              </span>
            </div>
          ))
        : null}

      {template.fields.map((field) => (
        <PrintFieldBox
          calibrationX={calibrationX}
          calibrationY={calibrationY}
          data={data}
          field={field}
          highlightOverflow={highlightOverflow}
          key={field.key}
          showBoxes={showBoxes}
        />
      ))}
    </div>
  );
}

function PrintFieldBox({
  calibrationX,
  calibrationY,
  data,
  field,
  highlightOverflow,
  showBoxes,
}: {
  calibrationX: number;
  calibrationY: number;
  data: PrintDocumentData;
  field: PrintField;
  highlightOverflow: boolean;
  showBoxes: boolean;
}) {
  const rawValue = String(getPrintDataValue(data, field.key) ?? "");
  const value = formatPrintValue(field, rawValue);
  const overflow = hasOverflowRisk(field, value);
  const fontSize = getPrintFontSize(field, value);
  const fontWeight = 600;

  if (field.type === "barcode") {
    return (
      <div
        className={cn(
          "absolute z-10 flex flex-col items-center justify-center overflow-hidden border text-center text-[#111111]",
          showBoxes ? "border-[#111827]/15" : "border-transparent",
          overflow && highlightOverflow && "bg-amber-100",
        )}
      data-print-field={field.key}
      style={{
        left: `${field.x + calibrationX}mm`,
        top: `${field.y + calibrationY}mm`,
        width: `${field.w}mm`,
        height: `${field.h}mm`,
        fontFamily: "Arial, Helvetica, 'Noto Sans', sans-serif",
        fontSize: `${fontSize}mm`,
        fontWeight,
        color: "#111111",
        lineHeight: 1.08,
      }}
      >
        <div
          aria-hidden="true"
          className="h-[55%] w-[92%]"
          style={{
            background:
              "repeating-linear-gradient(90deg, #111827 0 0.45mm, transparent 0.45mm 0.78mm, #111827 0.78mm 1.2mm, transparent 1.2mm 1.65mm)",
          }}
        />
        <div className="mt-[0.8mm] max-w-full truncate text-[2.6mm] font-semibold tracking-[0.08em]">{value || field.label}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute z-10 overflow-hidden whitespace-pre-wrap border px-[1mm] leading-tight text-[#111111]",
        showBoxes ? "border-[#111827]/15" : "border-transparent",
        overflow && highlightOverflow && "bg-amber-100",
      )}
      data-print-field={field.key}
      style={{
        left: `${field.x + calibrationX}mm`,
        top: `${field.y + calibrationY}mm`,
        width: `${field.w}mm`,
        height: `${field.h}mm`,
        fontSize: `${fontSize}mm`,
        fontFamily: "Arial, Helvetica, 'Noto Sans', sans-serif",
        fontWeight,
        color: "#111111",
        lineHeight: 1.08,
        textAlign: field.align ?? "left",
      }}
      title={overflow ? `${field.label} may overflow` : undefined}
    >
      {value}
    </div>
  );
}
