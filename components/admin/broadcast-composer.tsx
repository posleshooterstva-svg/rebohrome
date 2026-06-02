"use client";

import { useState } from "react";
import Image from "next/image";
import { Bell, CalendarClock, Megaphone, Send } from "lucide-react";
import { createBroadcastAction } from "@/app/actions/marketplace";
import { Button } from "@/components/ui/button";

const broadcastTypes = [
  ["system_update", "System update"],
  ["new_drop", "New drop"],
  ["maintenance", "Maintenance"],
  ["payment_notice", "Payment notice"],
  ["withdrawal_notice", "Withdrawal notice"],
  ["security_alert", "Security alert"],
  ["policy_update", "Policy update"],
  ["promotional", "Promotional"],
  ["admin_notice", "Admin notice"],
] as const;

const targetTypes = [
  ["all_users", "All users"],
  ["telegram_verified_users", "Verified collectors"],
  ["pending_withdrawals", "Pending withdrawals"],
  ["pending_payments", "Pending payments"],
  ["successful_deposits", "Successful deposits"],
  ["zero_balance", "Zero balance"],
  ["accepted_archive_rules", "Accepted Archive Rules"],
  ["not_accepted_archive_rules", "Did not accept Archive Rules"],
] as const;

const typeAccents: Record<string, string> = {
  admin_notice: "border-violet-300/35 bg-violet-500/12 text-violet-100",
  payment_notice: "border-cyan-300/35 bg-cyan-400/10 text-cyan-100",
  maintenance: "border-amber-300/35 bg-amber-400/10 text-amber-100",
  security_alert: "border-rose-300/35 bg-rose-400/10 text-rose-100",
  new_drop: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100",
  policy_update: "border-sky-300/35 bg-sky-400/10 text-sky-100",
};

function hasCyrillic(value: string) {
  return /[А-Яа-яЁё]/.test(value);
}

function looksEnglish(value: string) {
  return /[A-Za-z]/.test(value) && !hasCyrillic(value);
}

function normalizeTranslationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "");
}

function createRussianFallbackTitle(title: string) {
  const normalized = normalizeTranslationKey(title);
  if (normalized.includes("transvoucher")) {
    return "Исправление TransVoucher";
  }
  if (normalized.includes("payment")) {
    return "Обновление платежей";
  }
  if (normalized.includes("withdrawal")) {
    return "Обновление выводов";
  }
  if (normalized.includes("maintenance")) {
    return "Техническое обслуживание";
  }
  return "Уведомление ReboHrome";
}

function createRussianFallbackBody(body: string) {
  const normalized = normalizeTranslationKey(body);
  if (normalized === "we fix" || normalized.includes("fix")) {
    return "Мы уже работаем над обновлением. Пожалуйста, следите за статусом в ReboHrome.";
  }
  if (normalized.includes("payment")) {
    return "Мы обновляем платежный маршрут и синхронизацию с провайдером. Пожалуйста, следите за статусом в ReboHrome.";
  }
  return "Новое архивное уведомление доступно в ReboHrome. Пожалуйста, ознакомьтесь с обновлением на платформе.";
}

function getTelegramPreviewText(input: { title: string; body: string }) {
  const title = input.title.trim() || "Broadcast title";
  const body = input.body.trim() || "Your message preview will appear here.";

  if (!looksEnglish(`${title} ${body}`)) {
    return { title, body };
  }

  const titleTranslations: Record<string, string> = {
    "transvoucher stop": "TransVoucher временно остановлен",
    "transvoucher fix": "Исправление TransVoucher",
    "new archive drop is live": "Новый архивный дроп уже доступен",
    "scheduled maintenance": "Плановое техническое обслуживание",
    "payment verification update": "Обновление проверки платежей",
    "withdrawal review update": "Обновление проверки выводов",
    "archive rules updated": "Правила архива обновлены",
    "security notice": "Уведомление безопасности",
  };
  const bodyTranslations: Record<string, string> = {
    "we fix": "Мы уже работаем над обновлением. Пожалуйста, следите за статусом в ReboHrome.",
    "we are temporarily updating payment routing. please do not create duplicate payments while provider sync is active.":
      "Мы временно обновляем платежную маршрутизацию. Пожалуйста, не создавайте повторные платежи, пока синхронизация провайдера активна.",
  };

  return {
    title: titleTranslations[normalizeTranslationKey(title)] ?? createRussianFallbackTitle(title),
    body: bodyTranslations[normalizeTranslationKey(body)] ?? createRussianFallbackBody(body),
  };
}

function getTelegramEnglishPreviewText(input: { title: string; body: string }) {
  const title = input.title.trim() || "Broadcast title";
  const body = input.body.trim() || "Your message preview will appear here.";

  if (!hasCyrillic(`${title} ${body}`)) {
    return { title, body };
  }

  const titleTranslations: Record<string, string> = {
    "transvoucher временно остановлен": "TransVoucher maintenance",
    "новый архивный дроп уже доступен": "New archive drop is live",
    "плановое техническое обслуживание": "Scheduled maintenance",
    "обновление проверки платежей": "Payment verification update",
    "обновление проверки выводов": "Withdrawal review update",
    "правила архива обновлены": "Archive rules updated",
    "уведомление безопасности": "Security notice",
  };
  const bodyTranslations: Record<string, string> = {
    "мы уже работаем над обновлением. пожалуйста, следите за статусом в rebohrome.":
      "We are already working on the update. Please follow the status in ReboHrome.",
    "мы временно обновляем платежную маршрутизацию. пожалуйста, не создавайте повторные платежи, пока синхронизация провайдера активна.":
      "We are temporarily updating payment routing. Please do not create duplicate payments while provider sync is active.",
  };

  return {
    title: titleTranslations[title.toLowerCase()] ?? title,
    body: bodyTranslations[body.toLowerCase()] ?? body,
  };
}

export function BroadcastComposer() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("system_update");
  const [priority, setPriority] = useState("normal");
  const [targetType, setTargetType] = useState("telegram_verified_users");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [showAsPopup, setShowAsPopup] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const targetLabel =
    targetTypes.find(([value]) => value === targetType)?.[1] ?? "Selected audience";
  const typeLabel = broadcastTypes.find(([value]) => value === type)?.[1] ?? "Broadcast";
  const accent = typeAccents[type] ?? "border-violet-300/30 bg-violet-500/10 text-violet-100";
  const telegramRuPreview = getTelegramPreviewText({ title, body });
  const telegramEnPreview = getTelegramEnglishPreviewText({ title, body });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      <form
        action={createBroadcastAction}
        className="rounded-[22px] border border-line bg-panel p-6 shadow-panel"
      >
        <div className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Megaphone className="size-5 text-[var(--accent)]" />
          Create Broadcast
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          Send a premium archive notice to website inboxes, Telegram, or show it
          as a persistent verified-user popup.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm text-foreground">
            Title
            <input
              className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
              name="title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Transvoucher stop"
              required
              value={title}
            />
          </label>
          <label className="grid gap-2 text-sm text-foreground">
            Message
            <textarea
              className="min-h-32 rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
              name="body"
              onChange={(event) => setBody(event.target.value)}
              placeholder="We fix."
              required
              value={body}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">
              Type
              <select
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="type"
                onChange={(event) => setType(event.target.value)}
                value={type}
              >
                {broadcastTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              Priority
              <select
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="priority"
                onChange={(event) => setPriority(event.target.value)}
                value={priority}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">
              Target audience
              <select
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="targetType"
                onChange={(event) => setTargetType(event.target.value)}
                value={targetType}
              >
                {targetTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              Short preview
              <input
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="previewText"
                placeholder="Shown in inbox previews"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">
              CTA label
              <input
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="ctaLabel"
                onChange={(event) => setCtaLabel(event.target.value)}
                placeholder="Open details"
                value={ctaLabel}
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              CTA URL
              <input
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="ctaUrl"
                onChange={(event) => setCtaUrl(event.target.value)}
                placeholder="/archive-rules"
                value={ctaUrl}
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">
              Scheduled time
              <input
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="scheduledAt"
                type="datetime-local"
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              Expires at
              <input
                className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
                name="expiresAt"
                type="datetime-local"
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm text-foreground">
            Internal admin note
            <input
              className="rounded-[14px] border border-line bg-panel-strong px-4 py-3 outline-none"
              name="internalNote"
              placeholder="Private admin context"
            />
          </label>
        </div>

        <div className="mt-6 grid gap-3 rounded-[16px] border border-line bg-panel-strong p-4">
          <div className="text-sm font-semibold text-foreground">Channels</div>
          <label className="flex items-center gap-3 text-sm text-muted">
            <input defaultChecked name="channel_website" type="checkbox" />
            Website notification inbox
          </label>
          <label className="flex items-center gap-3 text-sm text-muted">
            <input
              checked={telegramEnabled}
              name="channel_telegram"
              onChange={(event) => setTelegramEnabled(event.target.checked)}
              type="checkbox"
            />
            Duplicate to Telegram channel + private Telegram messages
          </label>
          <label className="flex items-center gap-3 text-sm text-muted opacity-60">
            <input disabled name="channel_email" type="checkbox" />
            Email future-ready
          </label>
        </div>

        <div className="mt-4 grid gap-3 rounded-[16px] border border-line bg-panel-strong p-4">
          <label className="flex items-center gap-3 text-sm text-muted">
            <input
              checked={showAsPopup}
              name="showAsPopup"
              onChange={(event) => setShowAsPopup(event.target.checked)}
              type="checkbox"
            />
            Show as persistent popup
          </label>
          <label className="flex items-center gap-3 text-sm text-muted">
            <input name="allowUserDismiss" type="checkbox" />
            Allow user dismiss
          </label>
          <p className="text-xs leading-5 text-muted">
            For verified-user broadcasts, leave dismiss off to keep the notice
            visible until admin removes it.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button name="action" type="submit" value="send">
            <Send className="size-4" />
            Send now
          </Button>
          <Button name="action" type="submit" value="schedule" variant="secondary">
            <CalendarClock className="size-4" />
            Schedule
          </Button>
          <Button name="action" type="submit" value="draft" variant="secondary">
            Save draft
          </Button>
        </div>
      </form>

      <section className="rounded-[22px] border border-line bg-panel p-6 shadow-panel">
        <div className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Bell className="size-5 text-[var(--accent)]" />
          Broadcast Preview
        </div>
        <div
          className={
            showAsPopup
              ? "mt-5 rounded-[20px] border border-[rgba(167,139,250,0.35)] bg-[rgba(16,13,32,0.9)] p-5 shadow-[0_24px_80px_rgba(124,58,237,0.16)]"
              : "mt-5 rounded-[20px] border border-line bg-panel-strong p-5"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${accent}`}>
              {typeLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted">
              {priority}
            </span>
          </div>
          <div className="mt-4 text-[11px] uppercase tracking-[0.22em] text-violet-200">
            {showAsPopup ? "Persistent Archive Notice" : "Website Inbox Notice"}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            {title.trim() || "Broadcast title"}
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted">
            {body.trim() || "Your message preview will appear here."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full border border-violet-300/25 bg-violet-500/12 px-3 py-1 text-xs text-violet-100">
              {targetLabel}
            </span>
            {ctaLabel.trim() && ctaUrl.trim() ? (
              <span className="inline-flex rounded-[10px] bg-[linear-gradient(135deg,#a78bfa,#6d4df2)] px-3 py-2 text-xs font-medium text-white">
                {ctaLabel}
              </span>
            ) : null}
          </div>
        </div>

        {telegramEnabled ? (
          <div className="mt-5 overflow-hidden rounded-[20px] border border-violet-300/20 bg-[#101827]">
            <Image
              alt="ReboHrome notification"
              className="aspect-[16/9] w-full object-cover"
              height={900}
              src="/broadcast/rebohrome-notification.png"
              width={1600}
            />
            <div className="space-y-4 p-5">
              <div className="text-sm font-semibold text-foreground">
                🔔 ReboHrome Notification
              </div>
              <div className="text-lg font-semibold text-foreground">
                EN 🇺🇸 — {telegramEnPreview.title}
              </div>
              <blockquote className="rounded-[14px] border-l-4 border-violet-300/70 bg-white/[0.05] px-4 py-3 text-sm leading-7 text-muted">
                {telegramEnPreview.body}
              </blockquote>
              <div className="text-lg font-semibold text-foreground">
                RU 🇷🇺 — {telegramRuPreview.title}
              </div>
              <blockquote className="rounded-[14px] border-l-4 border-violet-300/70 bg-white/[0.05] px-4 py-3 text-sm leading-7 text-muted">
                {telegramRuPreview.body}
              </blockquote>
              <div className="text-sm text-muted">━━━━━━━━━━━━━━</div>
              <div className="text-sm italic text-muted">ReboHrome Archive</div>
              <div className="inline-flex rounded-[10px] bg-[linear-gradient(135deg,#a78bfa,#6d4df2)] px-3 py-2 text-xs font-medium text-white">
                {ctaLabel.trim() || "Open ReboHrome"}
              </div>
            </div>
            <div className="hidden">
              <div className="text-sm font-semibold text-foreground">
                🔔 ReboHrome уведомление
              </div>
              <div className="text-lg font-semibold text-foreground">
                {telegramRuPreview.title}
              </div>
              <blockquote className="rounded-[14px] border-l-4 border-violet-300/70 bg-white/[0.05] px-4 py-3 text-sm leading-7 text-muted">
                {telegramRuPreview.body}
              </blockquote>
              <div className="text-sm text-muted">━━━━━━━━━━━━━━</div>
              <div className="text-sm italic text-muted">ReboHrome Archive</div>
              <div className="inline-flex rounded-[10px] bg-[linear-gradient(135deg,#a78bfa,#6d4df2)] px-3 py-2 text-xs font-medium text-white">
                {ctaLabel.trim() || "Open ReboHrome"}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
