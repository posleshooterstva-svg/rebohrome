"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserKycProfileRecord, UserRecord } from "@/lib/rebohrome-data";

type VerificationRequiredCardProps = {
  title: string;
  description: string;
  user: Pick<UserRecord, "kycStatus" | "veriffSessionId">;
  compact?: boolean;
};

type KycFormState = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  countryOfResidence: string;
  documentCountry: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  state: string;
};

const emptyForm: KycFormState = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  countryOfResidence: "",
  documentCountry: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  state: "",
};

const countryOptions = [
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["NL", "Netherlands"],
  ["PL", "Poland"],
  ["UA", "Ukraine"],
  ["GE", "Georgia"],
  ["AM", "Armenia"],
  ["KZ", "Kazakhstan"],
  ["TR", "Turkey"],
  ["AE", "United Arab Emirates"],
  ["IL", "Israel"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
] as const;

function getActionLabel(status: UserRecord["kycStatus"]) {
  if (status === "session_created" || status === "submitted" || status === "review") {
    return "Check Verification";
  }

  if (status === "declined") {
    return "Restart Verification";
  }

  return "Start Verification";
}

function getStateCopy(status: UserRecord["kycStatus"]) {
  if (status === "review" || status === "submitted") {
    return "Your verification is being reviewed. Financial actions will unlock once approved.";
  }

  if (status === "declined" || status === "manual_declined" || status === "manual_rejected") {
    return "Verification was not approved. Please contact support or start a new verification if support asked you to retry.";
  }

  if (status === "expired" || status === "abandoned") {
    return "Your previous verification session is no longer active. Start a new session to continue.";
  }

  return "Complete identity verification to unlock supported deposits and card payments.";
}

function mapProfileToForm(profile: UserKycProfileRecord | null, accountEmail: string) {
  return {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    dateOfBirth: profile?.dateOfBirth ?? "",
    countryOfResidence: profile?.countryOfResidence ?? "",
    documentCountry: profile?.documentCountry ?? "",
    email: profile?.email ?? accountEmail,
    phone: profile?.phone ?? "",
    addressLine1: profile?.addressLine1 ?? "",
    addressLine2: profile?.addressLine2 ?? "",
    city: profile?.city ?? "",
    postalCode: profile?.postalCode ?? "",
    state: profile?.state ?? "",
  };
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
        {label} {optional ? <span className="text-slate-500">Optional</span> : null}
      </span>
      <input
        className="w-full min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/60"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function CountryField({
  label,
  value,
  onChange,
  placeholder = "Select country",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
        {label}
      </span>
      <select
        className="w-full min-w-0 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-300/60"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{placeholder}</option>
        {countryOptions.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function VerificationRequiredCard({
  title,
  description,
  user,
  compact = false,
}: VerificationRequiredCardProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<KycFormState>(emptyForm);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateCopy = getStateCopy(user.kycStatus);
  const shouldShowStateCopy = stateCopy.trim() !== description.trim();
  const readOnlyReview = user.kycStatus === "submitted" || user.kycStatus === "review";

  function updateField<Key extends keyof KycFormState>(key: Key, value: KycFormState[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    setError(null);
  }

  async function openVerificationDetails() {
    if (readOnlyReview) {
      window.location.assign("/dashboard/verification/result");
      return;
    }

    setFormOpen(true);
    setIsLoadingProfile(true);
    setError(null);

    try {
      const response = await fetch("/api/kyc/veriff/session", {
        method: "GET",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        profile?: UserKycProfileRecord | null;
        accountEmail?: string;
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Unable to load verification details.");
      }

      setForm(mapProfileToForm(payload.profile ?? null, payload.accountEmail ?? ""));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load verification details.",
      );
    } finally {
      setIsLoadingProfile(false);
    }
  }

  async function continueToVerification() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (!form.firstName.trim()) {
        throw new Error("Please enter your legal first name.");
      }

      if (!form.lastName.trim()) {
        throw new Error("Please enter your legal last name.");
      }

      const response = await fetch("/api/kyc/veriff/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        verificationUrl?: string | null;
        alreadyVerified?: boolean;
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Unable to start verification.");
      }

      if (payload.alreadyVerified) {
        window.location.reload();
        return;
      }

      if (!payload.verificationUrl) {
        throw new Error("Verification URL was not returned.");
      }

      window.location.assign(payload.verificationUrl);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to start verification.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section
        className={`rounded-[28px] border border-[rgba(139,124,246,0.24)] bg-[linear-gradient(145deg,rgba(13,18,38,0.96),rgba(34,25,64,0.94))] text-white shadow-[0_26px_90px_rgba(0,0,0,0.28)] ${
          compact ? "p-5" : "p-5 sm:p-8"
        }`}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-100">
          <ShieldCheck className="size-3.5" />
          Verification Required
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 max-w-[680px] text-sm leading-7 text-slate-300">
          {description}
        </p>
        {shouldShowStateCopy ? (
          <p className="mt-3 max-w-[680px] text-sm leading-7 text-slate-400">
            {stateCopy}
          </p>
        ) : null}
        {error && !formOpen ? (
          <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
          <Button disabled={isLoadingProfile} onClick={openVerificationDetails} type="button">
            {isLoadingProfile ? <Loader2 className="size-4 animate-spin" /> : null}
            {getActionLabel(user.kycStatus)}
          </Button>
          <Button
            onClick={() => window.location.assign("/dashboard")}
            type="button"
            variant="secondary"
          >
            Back to Dashboard
          </Button>
        </div>
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/75 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))] backdrop-blur sm:items-center sm:px-4 sm:py-6">
          <section className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-[24px] border border-violet-300/20 bg-[linear-gradient(145deg,rgba(13,18,38,0.98),rgba(30,23,58,0.98))] p-4 text-white shadow-[0_40px_140px_rgba(0,0,0,0.48)] sm:max-h-[92vh] sm:rounded-[30px] sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-violet-200">
                  Verification details
                </div>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
                  Enter your real document details
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Please enter your real details exactly as they appear on your
                  identity document. We never use your ReboHrome username or
                  Telegram handle as your legal name.
                </p>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
                  The placeholder examples are only examples and will not be used
                  automatically.
                </p>
              </div>
              <button
                className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:text-white"
                onClick={() => setFormOpen(false)}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>

            {isLoadingProfile ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Loader2 className="size-8 animate-spin text-violet-200" />
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {error ? (
                  <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <TextField
                    label="First name"
                    onChange={(value) => updateField("firstName", value)}
                    placeholder="Alex"
                    value={form.firstName}
                  />
                  <TextField
                    label="Last name"
                    onChange={(value) => updateField("lastName", value)}
                    placeholder="Carter"
                    value={form.lastName}
                  />
                  <TextField
                    label="Date of birth"
                    onChange={(value) => updateField("dateOfBirth", value)}
                    placeholder="YYYY-MM-DD"
                    type="date"
                    value={form.dateOfBirth}
                  />
                  <TextField
                    label="Email"
                    onChange={(value) => updateField("email", value)}
                    placeholder="user@example.com"
                    type="email"
                    value={form.email}
                  />
                  <CountryField
                    label="Country of residence"
                    onChange={(value) => updateField("countryOfResidence", value)}
                    value={form.countryOfResidence}
                  />
                  <CountryField
                    label="Document country"
                    onChange={(value) => updateField("documentCountry", value)}
                    placeholder="Select document country"
                    value={form.documentCountry}
                  />
                  <TextField
                    label="Phone number"
                    onChange={(value) => updateField("phone", value)}
                    optional
                    placeholder="+1 555 123 4567"
                    value={form.phone}
                  />
                  <TextField
                    label="Address line 1"
                    onChange={(value) => updateField("addressLine1", value)}
                    optional
                    placeholder="123 Main Street"
                    value={form.addressLine1}
                  />
                  <TextField
                    label="Address line 2"
                    onChange={(value) => updateField("addressLine2", value)}
                    optional
                    value={form.addressLine2}
                  />
                  <TextField
                    label="City"
                    onChange={(value) => updateField("city", value)}
                    optional
                    placeholder="New York"
                    value={form.city}
                  />
                  <TextField
                    label="State / region"
                    onChange={(value) => updateField("state", value)}
                    optional
                    value={form.state}
                  />
                  <TextField
                    label="Postal code"
                    onChange={(value) => updateField("postalCode", value)}
                    optional
                    placeholder="10001"
                    value={form.postalCode}
                  />
                </div>

                <div className="grid gap-3 border-t border-white/10 pt-5 sm:flex sm:flex-wrap sm:justify-end">
                  <Button onClick={() => setFormOpen(false)} type="button" variant="secondary">
                    Cancel
                  </Button>
                  <Button disabled={isSubmitting} onClick={continueToVerification} type="button">
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                    Continue to verification
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
