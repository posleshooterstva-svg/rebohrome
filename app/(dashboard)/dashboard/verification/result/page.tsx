import Link from "next/link";
import { AlertTriangle, Clock3, ShieldCheck, XCircle } from "lucide-react";
import { CheckVeriffStatusButton } from "@/components/kyc/check-veriff-status-button";
import { KycStatusAutoRefresh } from "@/components/kyc/kyc-status-auto-refresh";
import { VerificationRequiredCard } from "@/components/kyc/verification-required-card";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import { Button } from "@/components/ui/button";
import { logKycVerificationResultViewed } from "@/lib/db/repository";
import { isKycVerified } from "@/lib/rebohrome-data";
import { getRequestMeta, requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VerificationResultPage() {
  const session = await requireUserSession("/login?redirectTo=/dashboard/verification/result");
  const meta = await getRequestMeta("/dashboard/verification/result");
  await logKycVerificationResultViewed({
    userId: session.user.id,
    ...meta,
  });
  const verified = isKycVerified(session.user);
  const pending = ["session_created", "submitted", "review"].includes(
    session.user.kycStatus,
  );
  const declined = ["declined", "manual_declined", "manual_rejected"].includes(
    session.user.kycStatus,
  );
  const notCompleted = ["not_started", "expired", "abandoned"].includes(
    session.user.kycStatus,
  );

  return (
    <DashboardShell
      active="settings"
      title="Identity Verification"
      description="Your Veriff verification status is synced automatically after review."
      showQuickAction={false}
    >
      <KycStatusAutoRefresh
        initialStatus={session.user.kycStatus}
        initialVerified={verified}
      />
      {verified ? (
        <section className="rounded-[28px] border border-emerald-300/20 bg-[linear-gradient(145deg,rgba(13,38,28,0.96),rgba(18,42,55,0.92))] p-8 text-white shadow-[0_26px_90px_rgba(0,0,0,0.24)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
            <ShieldCheck className="size-3.5" />
            Verification approved
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
            Your account is verified.
          </h2>
          <p className="mt-4 max-w-[680px] text-sm leading-7 text-emerald-50/80">
            Supported deposits and card payments are now unlocked for this
            account.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/deposit">Go to Deposit</Link>
            </Button>
          </div>
        </section>
      ) : pending ? (
        <section className="rounded-[28px] border border-violet-300/20 bg-[linear-gradient(145deg,rgba(18,24,48,0.96),rgba(42,32,74,0.92))] p-8 text-white shadow-[0_26px_90px_rgba(0,0,0,0.24)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-100">
            <Clock3 className="size-3.5" />
            Verification submitted
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
            We are waiting for the verification decision.
          </h2>
          <p className="mt-4 max-w-[680px] text-sm leading-7 text-slate-300">
            Reaching this page only means the Veriff flow returned to ReboHrome.
            Your account will unlock supported deposits and card payments
            only after Veriff approves the decision webhook or support verifies
            the account manually.
          </p>
          <p className="mt-3 max-w-[680px] text-sm leading-7 text-slate-400">
            Current status: {session.user.kycStatus}. Verification is being
            reviewed.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
            <CheckVeriffStatusButton />
            <Button asChild variant="secondary">
              <Link href="/dashboard/settings">Verification Settings</Link>
            </Button>
          </div>
        </section>
      ) : declined ? (
        <section className="rounded-[28px] border border-rose-300/20 bg-[linear-gradient(145deg,rgba(38,13,26,0.96),rgba(55,24,42,0.92))] p-8 text-white shadow-[0_26px_90px_rgba(0,0,0,0.24)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-100">
            <XCircle className="size-3.5" />
            Verification was not approved
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
            Please contact support or try again if available.
          </h2>
          <p className="mt-4 max-w-[680px] text-sm leading-7 text-rose-50/80">
            Your account remains unverified. Supported deposits and card
            payments stay locked until Veriff approves a decision webhook or
            support verifies the account manually.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/settings">Open Settings</Link>
            </Button>
            <CheckVeriffStatusButton />
            <Button asChild variant="secondary">
              <Link href="/contact">Contact Support</Link>
            </Button>
          </div>
        </section>
      ) : notCompleted ? (
        <section className="rounded-[28px] border border-amber-300/20 bg-[linear-gradient(145deg,rgba(38,30,13,0.96),rgba(55,42,24,0.92))] p-8 text-white shadow-[0_26px_90px_rgba(0,0,0,0.24)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
            <AlertTriangle className="size-3.5" />
            Verification not completed
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
            You can restart verification when ready.
          </h2>
          <p className="mt-4 max-w-[680px] text-sm leading-7 text-amber-50/80">
            Returning from Veriff or exiting the flow does not approve your
            account. Please start verification again and complete the full flow.
          </p>
          <div className="mt-6">
            <VerificationRequiredCard
              compact
              description="Please complete identity verification before adding funds or creating card payments."
              title="Restart verification"
              user={session.user}
            />
          </div>
        </section>
      ) : (
        <VerificationRequiredCard
          description="Verification was not completed. You can restart verification when ready."
          title="Verification not completed"
          user={session.user}
        />
      )}
    </DashboardShell>
  );
}
