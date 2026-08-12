"use client";

import { PaymentSuccessModal, type PaymentSuccessRow } from "@/components/rebohrome/payment-success-modal";
import { SuccessStateSync } from "@/components/rebohrome/success-state-sync";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { formatCurrency, formatDisplayDateTime, formatUsd, getPublicProductTitle, type ProductRecord, type SupportedCurrency } from "@/lib/rebohrome-data";

type OrderSuccessViewProps = {
  userId: string;
  orderId: string;
  transactionId: string | null;
  providerTransactionId: string | null;
  providerReferenceId: string | null;
  createdAt: string;
  currency: SupportedCurrency;
  total: number;
  paymentMethod: string;
  provider: string;
  paymentReference: string;
  remainingBalance: number | null;
  items: Array<{
    quantity: number;
    product: ProductRecord;
    packProduct?: ProductRecord | null;
    randomizedDraw?: {
      versionId: string;
      probabilityBps: number;
      priceSnapshot: number;
      drawnAt: string;
    } | null;
  }>;
};

export function OrderSuccessView({
  userId,
  orderId,
  transactionId,
  providerTransactionId,
  providerReferenceId,
  createdAt,
  currency,
  total,
  paymentMethod,
  provider,
  paymentReference,
  remainingBalance,
  items,
}: OrderSuccessViewProps) {
  const rows: PaymentSuccessRow[] = [
    {
      label: "Order ID",
      value: orderId,
      icon: "receipt",
    },
    {
      label: "Local Transaction ID",
      value: transactionId ?? "Pending",
      icon: "transaction",
    },
    {
      label: "TransVoucher Transaction ID",
      value: providerTransactionId ?? "Pending",
      icon: "transaction",
    },
    {
      label: "Paid",
      value: formatCurrency(total, currency),
      icon: "paid",
    },
    {
      label: "Delivered Items",
      value: `${items.reduce((sum, item) => sum + item.quantity, 0)} collectible${items.length === 1 ? "" : "s"}`,
      icon: "items",
    },
    {
      label: "Payment",
      value: paymentMethod,
      icon: "payment",
    },
    {
      label: "Provider",
      value: provider,
      icon: "provider",
    },
    {
      label: "Reference ID",
      value: providerReferenceId ?? paymentReference,
      icon: "reference",
    },
    {
      label: "Updated Balance",
      value: formatUsd(remainingBalance ?? 0),
      icon: "wallet",
      tone: "accent",
    },
    {
      label: "Timestamp",
      value: formatDisplayDateTime(createdAt),
      icon: "timestamp",
    },
    {
      label: "Status",
      value: "SUCCESS",
      icon: "status",
      tone: "success",
    },
  ];

  function downloadReceipt() {
    const content = [
      "REBOHROME PURCHASE RECEIPT",
      `Order ID: ${orderId}`,
      `Local Transaction ID: ${transactionId ?? "Pending"}`,
      `TransVoucher Transaction ID: ${providerTransactionId ?? "Pending"}`,
      `Paid Amount: ${formatCurrency(total, currency)}`,
      `Payment Method: ${paymentMethod}`,
      `Provider: ${provider}`,
      `Reference ID: ${providerReferenceId ?? paymentReference}`,
      `Updated Balance: ${formatUsd(remainingBalance ?? 0)}`,
      `Timestamp: ${formatDisplayDateTime(createdAt)}`,
      "Purchased Items:",
      ...items.map((item) => `- ${getPublicProductTitle(item.product.title)} x${item.quantity}`),
      "Status: SUCCESS",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${orderId}-receipt.txt`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <>
      <SuccessStateSync
        amount={total}
        currency={currency}
        createdAt={createdAt}
        items={items.map((item) => ({
          product: item.product,
          quantity: item.quantity,
        }))}
        orderId={orderId}
        summary={`${items.length} archive item${items.length === 1 ? "" : "s"} delivered`}
        userId={userId}
      />
      <PaymentSuccessModal
        closeHref="/dashboard"
        continueHref="/dashboard"
        continueLabel="Continue to Dashboard"
        downloadLabel="Download Receipt"
        featuredContent={
          items.some((item) => item.packProduct) ? (
            <div className="rounded-[24px] border border-[rgba(182,172,255,0.34)] bg-[linear-gradient(145deg,rgba(248,246,255,0.98),rgba(255,255,255,0.96))] p-4 shadow-[0_18px_44px_rgba(139,124,255,0.12)]">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
                Your pull
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {items.filter((item) => item.packProduct).map((item, index) => (
                  <div
                    className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-[18px] border border-white/90 bg-white/82 p-3 text-left"
                    key={`${item.product.id}:${index}`}
                  >
                    <CardArtwork
                      card={item.product}
                      className="aspect-square w-[72px] rounded-[16px]"
                      compact
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#1f2937]">
                        {getPublicProductTitle(item.product.title)}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[#7b8193]">
                        From {getPublicProductTitle(item.packProduct?.title ?? "randomized pack")}
                      </div>
                      {item.randomizedDraw ? (
                        <div className="mt-1 text-xs font-medium text-[var(--accent)]">
                          Chance {(item.randomizedDraw.probabilityBps / 100).toFixed(2)}%
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        }
        onDownload={downloadReceipt}
        overlay
        rows={rows}
        statusLabel="Payment Successful"
        subtitle="Your transaction has been completed successfully."
        supportDescription="Open your dashboard to inspect delivery, ownership history, and live archive updates."
        supportTitle="Your collectible is secured inside your private vault."
        title="Thank you for your purchase!"
      />
    </>
  );
}
