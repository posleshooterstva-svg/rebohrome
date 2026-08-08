"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

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

  async function handleCreateAccount() {
    setErrorMessage(null);
    setStatusMessage(null);

    if (form.password !== form.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        redirectPath?: string;
      };

      if (!response.ok || !payload.ok || !payload.redirectPath) {
        throw new Error(payload.error || "Unable to create account.");
      }

      setRedirecting(true);
      setStatusMessage(
        "Account created. Next step: complete identity verification to unlock supported deposits and card payments.",
      );
      window.setTimeout(() => {
        window.location.assign(payload.redirectPath!);
      }, 450);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create account.",
      );
    } finally {
      setIsSubmitting(false);
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
        Create your ReboHrome account now. Identity verification is required only
        before supported deposits and card payments.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[
          ["1", "Account details"],
          ["2", "KYC verification"],
        ].map(([index, label]) => {
          const active = Number(index) === (redirecting ? 2 : 1);

          return (
            <div
              key={index}
              className={`rounded-[18px] border px-4 py-3 text-sm transition ${
                active
                  ? "border-[var(--accent)] bg-[rgba(139,124,255,0.08)] text-foreground"
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
            Account details
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
                Telegram username <span className="text-muted">(optional)</span>
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                onChange={(event) =>
                  updateField("telegramUsername", event.target.value)
                }
                placeholder={`@collector_handle or ${telegramBotHandle}`}
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

          <Button
            className="mt-5 w-full"
            disabled={isSubmitting || redirecting}
            onClick={handleCreateAccount}
            type="button"
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Create account
          </Button>
        </section>

        {redirecting ? (
          <section className="rounded-[22px] border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="text-sm font-semibold text-emerald-700">
              Account created
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-700/90">
              You can browse now. Complete Veriff verification to unlock
              supported deposits and card payments.
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
