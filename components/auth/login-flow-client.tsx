"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type LoginFlowClientProps = {
  initialError?: string | null;
  redirectTo: string;
};

export function LoginFlowClient({
  initialError = null,
  redirectTo,
}: LoginFlowClientProps) {
  const [error, setError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({
          password: String(formData.get("password") ?? ""),
          redirectTo,
          username: String(formData.get("username") ?? ""),
        }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(result.error || "Unable to sign in right now. Please try again.");
        setIsSubmitting(false);
        return;
      }

      window.location.assign(result.redirectTo || "/dashboard");
    } catch (submitError) {
      const message =
        submitError instanceof DOMException && submitError.name === "AbortError"
          ? "Login is taking longer than expected. Please try again."
          : "Unable to sign in right now. Please try again.";
      setError(message);
      setIsSubmitting(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <>
      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-200/70 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-foreground">
            Username
          </span>
          <input
            autoComplete="username"
            className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
            name="username"
            placeholder="archive_user"
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-foreground">
            Password
          </span>
          <input
            autoComplete="current-password"
            className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
            name="password"
            placeholder="Enter your password"
            required
            type="password"
          />
        </label>
        <button
          className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#111827,#7266ff)] px-4 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-sm text-muted">
        New here?{" "}
        <Link className="font-medium text-[var(--accent)]" href="/register">
          Create an account
        </Link>
      </p>
    </>
  );
}
