"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type RegisterFlowClientProps = {
  initialError?: string | null;
  telegramBotHandle: string;
};

type RegisterFormState = {
  username: string;
  email: string;
  telegramUsername: string;
  password: string;
  confirmPassword: string;
};

const initialFormState: RegisterFormState = {
  username: "",
  email: "",
  telegramUsername: "",
  password: "",
  confirmPassword: "",
};

export function RegisterFlowClient({
  initialError = null,
  telegramBotHandle,
}: RegisterFlowClientProps) {
  const [form, setForm] = useState<RegisterFormState>(initialFormState);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number>(0);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (resendAvailableAt <= Date.now()) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  const resendRemainingSeconds = Math.max(
    0,
    Math.ceil((resendAvailableAt - nowTick) / 1000),
  );
  const currentStep = useMemo(() => {
    if (redirecting) {
      return 3;
    }

    return verificationId ? 2 : 1;
  }, [redirecting, verificationId]);

  function updateField<Key extends keyof RegisterFormState>(
    key: Key,
    value: RegisterFormState[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    setErrorMessage(null);
    setStatusMessage(null);
  }

  async function handleSendCode() {
    setErrorMessage(null);
    setStatusMessage(null);

    if (form.password !== form.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSendingCode(true);

    try {
      const response = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        verificationId?: string;
        expiresAt?: string;
        resendCooldownSeconds?: number;
      };

      if (!response.ok || !payload.ok || !payload.verificationId) {
        throw new Error(payload.error || "Unable to send a verification code.");
      }

      setVerificationId(payload.verificationId);
      setExpiresAt(payload.expiresAt ?? null);
      setResendAvailableAt(
        Date.now() + Number(payload.resendCooldownSeconds ?? 60) * 1000,
      );
      setStatusMessage(
        "Your 6-digit code was sent in Telegram. Enter it below to create your account.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to send a verification code.",
      );
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    if (!verificationId) {
      setErrorMessage("Request a verification code first.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsVerifying(true);

    try {
      const response = await fetch("/api/auth/register/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verificationId,
          code: verificationCode,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        redirectPath?: string;
      };

      if (!response.ok || !payload.ok || !payload.redirectPath) {
        throw new Error(payload.error || "Unable to verify your code.");
      }

      setRedirecting(true);
      setStatusMessage("Account created successfully. Redirecting to your dashboard...");
      window.setTimeout(() => {
        window.location.assign(payload.redirectPath!);
      }, 450);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to verify your code.",
      );
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-line bg-[rgba(255,255,255,0.92)] p-6 shadow-[0_18px_48px_rgba(146,160,205,0.12)]">
      <div className="text-xs uppercase tracking-[0.28em] text-muted">
        Register
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground">
        Create collector account
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Account creation is unlocked only after Telegram verification.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ["1", "Account details"],
          ["2", "Telegram verification"],
          ["3", "Success"],
        ].map(([index, label]) => {
          const active = Number(index) === currentStep;
          const completed = Number(index) < currentStep;

          return (
            <div
              key={index}
              className={`rounded-[18px] border px-4 py-3 text-sm transition ${
                active
                  ? "border-[var(--accent)] bg-[rgba(139,124,255,0.08)] text-foreground"
                  : completed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-line bg-panel text-muted"
              }`}
            >
              <div className="text-[11px] uppercase tracking-[0.22em]">
                Step {index}
              </div>
              <div className="mt-1 font-medium">{label}</div>
            </div>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-200/70 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="mt-5 rounded-2xl border border-emerald-200/70 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
          {statusMessage}
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        <section className="rounded-[22px] border border-line bg-panel p-4">
          <div className="text-sm font-semibold text-foreground">
            Step 1 · Account details
          </div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">
                Username
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                onChange={(event) => updateField("username", event.target.value)}
                placeholder="archive_user"
                value={form.username}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">
                Email
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="collector@example.com"
                type="email"
                value={form.email}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">
                Telegram username
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                onChange={(event) =>
                  updateField("telegramUsername", event.target.value)
                }
                placeholder="@collector_handle"
                value={form.telegramUsername}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">
                  Password
                </span>
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                  onChange={(event) => updateField("password", event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={form.password}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">
                  Confirm password
                </span>
                <input
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                  onChange={(event) =>
                    updateField("confirmPassword", event.target.value)
                  }
                  placeholder="Repeat password"
                  type="password"
                  value={form.confirmPassword}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-line bg-panel p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Step 2 · Telegram verification
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                Before verification, open {telegramBotHandle} in Telegram and press
                Start so the bot can message you first.
              </p>
            </div>
            <div className="rounded-full border border-line bg-white p-3 text-[var(--accent)]">
              <MessageCircle className="size-5" />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button asChild type="button" variant="secondary">
              <a
                href={`https://t.me/${telegramBotHandle.replace(/^@/, "")}?start=verify`}
                rel="noreferrer"
                target="_blank"
              >
                Open Telegram Bot
              </a>
            </Button>
            <Button
              disabled={isSendingCode || resendRemainingSeconds > 0}
              onClick={handleSendCode}
              type="button"
            >
              {isSendingCode ? <Loader2 className="size-4 animate-spin" /> : null}
              {verificationId ? "Resend 6-digit code" : "Send 6-digit code"}
            </Button>
          </div>

          {resendRemainingSeconds > 0 ? (
            <p className="mt-3 text-xs text-muted">
              You can request a new code in {resendRemainingSeconds}s.
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">
                Verification code
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm tracking-[0.28em] text-foreground outline-none transition focus:border-[var(--accent)]"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replace(/\D/g, ""))
                }
                placeholder="123456"
                value={verificationCode}
              />
            </label>
            <div className="flex items-end">
              <Button
                disabled={!verificationId || isVerifying}
                onClick={handleVerifyCode}
                type="button"
              >
                {isVerifying ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Confirm and create account
              </Button>
            </div>
          </div>

          {expiresAt ? (
            <p className="mt-3 text-xs text-muted">
              Current code expires at {new Date(expiresAt).toLocaleTimeString()}.
            </p>
          ) : null}
        </section>

        {redirecting ? (
          <section className="rounded-[22px] border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="text-sm font-semibold text-emerald-700">
              Step 3 · Success
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-700/90">
              Your Telegram ownership is verified and your archive account is ready.
            </p>
          </section>
        ) : null}
      </div>

      <p className="mt-5 text-sm text-muted">
        Already have an account?{" "}
        <Link className="font-medium text-[var(--accent)]" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
