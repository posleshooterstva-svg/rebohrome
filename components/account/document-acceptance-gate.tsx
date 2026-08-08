"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, FileText, Loader2, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import type { DocumentAcceptanceStatusRecord, RequiredDocumentKey } from "@/lib/rebohrome-data";

type Props = {
  status: DocumentAcceptanceStatusRecord;
};

const documentRows: Array<{
  key: Exclude<RequiredDocumentKey, "legalConfirmation">;
  label: string;
  href: string;
}> = [
  { key: "terms", label: "I agree to the Terms of Service", href: "/terms" },
  { key: "privacy", label: "I agree to the Privacy Policy", href: "/privacy-policy" },
  { key: "refund", label: "I agree to the Refund Policy", href: "/refund-policy" },
  { key: "aml", label: "I agree to the AML Policy", href: "/aml-policy" },
];

export function DocumentAcceptanceGate({ status }: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<RequiredDocumentKey, boolean>>({
    terms: false,
    privacy: false,
    refund: false,
    aml: false,
    legalConfirmation: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedLocally, setAcceptedLocally] = useState(false);
  const canContinue = Object.values(checked).every(Boolean);

  function toggle(key: RequiredDocumentKey) {
    setChecked((current) => ({ ...current, [key]: !current[key] }));
  }

  function submit() {
    setError(null);
    setIsSubmitting(true);
    void (async () => {
      try {
        const response = await fetch("/api/account/document-acceptance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            termsAccepted: checked.terms,
            privacyAccepted: checked.privacy,
            refundAccepted: checked.refund,
            amlAccepted: checked.aml,
            legalConfirmationAccepted: checked.legalConfirmation,
          }),
        });
        const data = (await response.json()) as {
          ok: boolean;
          error?: string;
          message?: string;
        };
        if (!response.ok || !data.ok) {
          throw new Error(data.message ?? data.error ?? "Could not save your acceptance.");
        }
        setAcceptedLocally(true);
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Could not save your acceptance.");
        setIsSubmitting(false);
      }
    })();
  }

  if (status.accepted || acceptedLocally) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-[#050814]/90 p-4 backdrop-blur-xl">
      <section className="my-6 w-full max-w-3xl rounded-[30px] border border-white/10 bg-[#101425] p-5 shadow-[0_40px_140px_rgba(0,0,0,0.55)] sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
            <FileText className="size-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-violet-200">Required documents</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
              Updated ReboHrome Policies
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Our site policies have been updated. Please accept the required documents to continue using ReboHrome.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {documentRows.map((item) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200"
              key={item.key}
            >
              <input
                checked={checked[item.key]}
                className="mt-1 size-4 accent-violet-400"
                onChange={() => toggle(item.key)}
                type="checkbox"
              />
              <span>
                {item.label}{" "}
                <Link
                  className="font-semibold text-violet-200 hover:text-white"
                  href={item.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Review
                </Link>
                <span className="ml-2 text-xs text-slate-500">
                  v{status.required[item.key].version}
                </span>
              </span>
            </label>
          ))}

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-4 text-sm leading-6 text-slate-100">
            <input
              checked={checked.legalConfirmation}
              className="mt-1 size-4 accent-violet-400"
              onChange={() => toggle("legalConfirmation")}
              type="checkbox"
            />
            <span>
              I confirm that I have reviewed, understood, and agree to all required ReboHrome policies and understand
              that my use of the platform is governed by them.
            </span>
          </label>
        </div>

        <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">
          I confirm that I have carefully reviewed, understood, and agree to all applicable ReboHrome policies, including
          the Terms of Service, Privacy Policy, Refund Policy, and AML Policy. I understand the nature of the ReboHrome
          platform, the rules for using the service, payment and refund conditions, verification requirements,
          AML/security checks, account restrictions, and digital collectible purchase terms.
        </p>

        {error ? <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
          <Button disabled={!canContinue || isSubmitting} onClick={submit} type="button">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Continue
          </Button>
        </div>
      </section>
    </div>
  );
}
