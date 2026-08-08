"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowDownToLine,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  HelpCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import {
  changeEmailAction,
  savePaymentPhoneAction,
} from "@/app/actions/marketplace";
import { VerificationRequiredCard } from "@/components/kyc/verification-required-card";
import { KycStatusAutoRefresh } from "@/components/kyc/kyc-status-auto-refresh";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatDisplayDate,
  formatDisplayDateTime,
  formatUsd,
  isKycVerified,
  type BalanceRecord,
  type DocumentAcceptanceStatusRecord,
  type TransactionRecord,
  type UserKycProfileRecord,
  type UserRecord,
} from "@/lib/rebohrome-data";

export type SettingsSectionId =
  | "account"
  | "payments"
  | "verification"
  | "security"
  | "email"
  | "preferences";

type SettingsHubClientProps = {
  balance: BalanceRecord | null;
  documentAcceptance: DocumentAcceptanceStatusRecord;
  initialSection: SettingsSectionId;
  kycProfile: UserKycProfileRecord | null;
  recentActivity: TransactionRecord[];
  searchState: {
    archiveRulesAccepted: boolean;
    emailError: string | null;
    emailUpdated: boolean;
    phoneSaved: boolean;
    saved: boolean;
  };
  tierProgress: {
    currentBonus: number;
    nextThreshold: number;
  };
  user: UserRecord | null;
};

const sections: Array<{
  id: SettingsSectionId;
  title: string;
  description: string;
  icon: typeof UserRound;
}> = [
  { id: "account", title: "Account", description: "Profile & access", icon: UserRound },
  { id: "payments", title: "Payments", description: "Payment details", icon: CreditCard },
  { id: "verification", title: "Verification", description: "Identity & KYC", icon: ShieldCheck },
  { id: "security", title: "Security", description: "Access & protection", icon: LockKeyhole },
  { id: "email", title: "Email", description: "Communications", icon: Mail },
  { id: "preferences", title: "Preferences", description: "Platform settings", icon: SlidersHorizontal },
];

function statusTone(active: boolean) {
  return active
    ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-200"
    : "border-amber-300/20 bg-amber-500/10 text-amber-200";
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.34em] text-[var(--accent)]">
        Settings
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{subtitle}</p>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[24px] border border-line bg-panel-strong p-5 shadow-[0_24px_80px_rgba(0,0,0,0.14)] ${className}`}
    >
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function AlertBanner({ children, tone }: { children: React.ReactNode; tone: "green" | "rose" }) {
  return (
    <div
      className={`rounded-[18px] border px-4 py-3 text-sm ${
        tone === "green"
          ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-200"
          : "border-rose-300/25 bg-rose-500/10 text-rose-200"
      }`}
    >
      {children}
    </div>
  );
}

function SubmitButton({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant?: "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit" variant={variant}>
      {pending ? "Saving..." : children}
    </Button>
  );
}

export function SettingsHubClient({
  balance,
  documentAcceptance,
  initialSection,
  kycProfile,
  recentActivity,
  searchState,
  tierProgress,
  user,
}: SettingsHubClientProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const verified = isKycVerified(user);
  const progressPercent = Math.min(
    100,
    ((balance?.totalDeposited ?? 0) / tierProgress.nextThreshold) * 100,
  );

  function switchSection(section: SettingsSectionId) {
    setActiveSection(section);
    window.history.replaceState(null, "", `/dashboard/settings?section=${section}`);
  }

  return (
    <div className="space-y-5">
      {user ? (
        <KycStatusAutoRefresh
          initialStatus={user.kycStatus}
          initialVerified={verified}
        />
      ) : null}
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.05em] text-foreground">
          Settings
        </h1>
        <p className="mt-2 text-sm text-muted">
          Account settings.
        </p>
      </div>

      <div className="space-y-3">
        {searchState.saved ? <AlertBanner tone="green">Profile updated successfully.</AlertBanner> : null}
        {searchState.phoneSaved ? <AlertBanner tone="green">Gate #2 payment details saved successfully.</AlertBanner> : null}
        {searchState.emailUpdated ? <AlertBanner tone="green">Email updated successfully.</AlertBanner> : null}
        {searchState.archiveRulesAccepted ? <AlertBanner tone="green">Required documents accepted.</AlertBanner> : null}
        {searchState.emailError ? <AlertBanner tone="rose">{searchState.emailError}</AlertBanner> : null}
      </div>

      <div className="grid w-full gap-5 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="rounded-[24px] border border-line bg-panel-strong p-3 xl:self-start">
          <div className="mb-2 hidden px-3 py-2 text-[11px] uppercase tracking-[0.26em] text-muted xl:block">
            Settings Menu
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  className={`flex min-w-[190px] items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition xl:min-w-0 ${
                    active
                      ? "border-violet-300/30 bg-[linear-gradient(135deg,rgba(139,92,246,0.28),rgba(67,56,202,0.18))] text-white shadow-[0_18px_50px_rgba(124,58,237,0.22)]"
                      : "border-transparent bg-transparent text-muted hover:border-white/10 hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                  key={item.id}
                  onClick={() => switchSection(item.id)}
                  type="button"
                >
                  <Icon className={`size-4 shrink-0 ${active ? "text-violet-100" : "text-muted"}`} />
                  <span>
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="mt-0.5 block text-xs opacity-75">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {activeSection === "account" ? (
            <AccountSection
              onSwitch={switchSection}
              user={user}
              verified={verified}
            />
          ) : null}
          {activeSection === "payments" ? (
            <PaymentsSection
              balance={balance}
              kycProfile={kycProfile}
              tierProgress={tierProgress}
              progressPercent={progressPercent}
              user={user}
            />
          ) : null}
          {activeSection === "verification" ? (
            <VerificationSection kycProfile={kycProfile} user={user} verified={verified} />
          ) : null}
          {activeSection === "security" ? <SecuritySection user={user} verified={verified} /> : null}
          {activeSection === "email" ? <EmailSection user={user} /> : null}
          {activeSection === "preferences" ? (
              <PreferencesSection documentAcceptance={documentAcceptance} user={user} verified={verified} />
          ) : null}
        </main>

        <RightRail
          balance={balance}
          recentActivity={recentActivity}
          user={user}
          verified={verified}
        />
      </div>
      <HelpPoliciesSection />
    </div>
  );
}

function AccountSection({
  onSwitch,
  user,
  verified,
}: {
  onSwitch: (section: SettingsSectionId) => void;
  user: UserRecord | null;
  verified: boolean;
}) {
  return (
    <>
      <SectionHeader
        title="Account"
        subtitle="Manage your profile, access role, and account status."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-semibold text-foreground">Collector Access</h3>
          <div className="mt-4">
            <InfoRow label="Account role" value={user?.role === "admin" ? "Administrator" : "Collector"} />
            <InfoRow label="Username" value={user?.username ?? "Unknown"} />
            <InfoRow label="Telegram status" value={user?.telegramVerified ? "Verified" : "Awaiting link"} />
            <InfoRow label="Member since" value={user ? formatDisplayDate(user.createdAt) : "Unknown"} />
          </div>
          <Button className="mt-5" type="button" variant="secondary">Manage access</Button>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-foreground">Payment Details Preview</h3>
          <div className="mt-4">
            <InfoRow
              label="Gate #2 customer"
              value={
                user?.gate2FirstName && user?.gate2LastName
                  ? `${user.gate2FirstName} ${user.gate2LastName}`
                  : "Not set"
              }
            />
            <InfoRow label="Gate #2 phone" value={user?.gate2Phone || user?.paymentPhone || "Not set"} />
            <InfoRow label="Payment details" value={user?.gate2Phone || user?.paymentPhone ? "Ready" : "Incomplete"} />
          </div>
          <Button className="mt-5" onClick={() => onSwitch("payments")} type="button" variant="secondary">
            Edit payment details
          </Button>
        </Card>
      </div>
      <ReadinessStrip user={user} verified={verified} />
    </>
  );
}

function PaymentsSection({
  balance,
  kycProfile,
  progressPercent,
  tierProgress,
  user,
}: {
  balance: BalanceRecord | null;
  kycProfile: UserKycProfileRecord | null;
  progressPercent: number;
  tierProgress: SettingsHubClientProps["tierProgress"];
  user: UserRecord | null;
}) {
  return (
    <>
      <SectionHeader
        title="Payments"
        subtitle="Manage payment details used for supported top-up methods."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-semibold text-foreground">Gate #2 Payment Details</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Needed for Gate #2 payments.
          </p>
          <form action={savePaymentPhoneAction} className="mt-4 space-y-3">
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={user?.gate2FirstName ?? kycProfile?.firstName ?? ""}
              name="gate2FirstName"
              placeholder="Alex"
            />
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={user?.gate2LastName ?? kycProfile?.lastName ?? ""}
              name="gate2LastName"
              placeholder="Carter"
            />
            <input
              className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none"
              defaultValue={user?.gate2Phone ?? user?.paymentPhone ?? kycProfile?.phone ?? ""}
              name="gate2Phone"
              placeholder="491636422099"
            />
            <SubmitButton>Save Gate #2 details</SubmitButton>
          </form>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-semibold text-foreground">Deposit Progress</h3>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted">Progress</span>
          <span className="font-semibold text-foreground">
            {formatUsd(balance?.totalDeposited ?? 0)} / {formatUsd(tierProgress.nextThreshold)}
          </span>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6,#38bdf8)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MiniStat label="Current bonus" value={`+${tierProgress.currentBonus}%`} />
          <MiniStat label="Next bonus at" value={formatUsd(tierProgress.nextThreshold)} />
        </div>
      </Card>
    </>
  );
}

function VerificationSection({
  kycProfile,
  user,
  verified,
}: {
  kycProfile: UserKycProfileRecord | null;
  user: UserRecord | null;
  verified: boolean;
}) {
  return (
    <>
      <SectionHeader
        title="Verification"
        subtitle="Complete identity verification to unlock supported deposits and card payments."
      />
      <Card>
        <h3 className="text-lg font-semibold text-foreground">Identity Verification</h3>
        {user && verified ? (
          <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-emerald-200">Verified</div>
                <div className="mt-2 font-semibold text-foreground">Your account is verified.</div>
                <p className="mt-1 text-sm text-muted">
                  Provider: {user.kycProvider ?? "Veriff"}
                  {user.kycVerifiedAt ? ` · Verified on ${formatDisplayDate(user.kycVerifiedAt)}` : ""}
                </p>
              </div>
              <CheckCircle2 className="size-8 text-emerald-300" />
            </div>
          </div>
        ) : user ? (
          <div className="mt-4">
            <VerificationRequiredCard
              compact
              description="Complete verification to unlock supported deposits and card payments."
              title="Identity verification required"
              user={user}
            />
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-foreground">Verification Details</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MiniStat label="First name" value={kycProfile?.firstName ?? "Not entered"} />
          <MiniStat label="Last name" value={kycProfile?.lastName ?? "Not entered"} />
          <MiniStat label="Country" value={kycProfile?.countryOfResidence ?? "Not entered"} />
          <MiniStat label="Document country" value={kycProfile?.documentCountry ?? "Not entered"} />
          <MiniStat label="Email" value={kycProfile?.email ?? user?.email ?? "Not entered"} />
        </div>
      </Card>
    </>
  );
}

function SecuritySection({ user, verified }: { user: UserRecord | null; verified: boolean }) {
  return (
    <>
      <SectionHeader
        title="Security"
        subtitle="Manage account protection and login safety."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-semibold text-foreground">Password</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Password changes are protected by current account authentication.
          </p>
          <Button className="mt-5" type="button" variant="secondary">Change password</Button>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-foreground">Session / Login Safety</h3>
          <div className="mt-4">
            <InfoRow label="Last login" value={user?.lastLoginAt ? formatDisplayDateTime(user.lastLoginAt) : "Not recorded"} />
            <InfoRow label="Login alerts" value="Enabled by platform" />
            <InfoRow label="Verification" value={verified ? "Enabled" : "Required"} />
          </div>
        </Card>
      </div>
      <ReadinessStrip user={user} verified={verified} />
    </>
  );
}

function EmailSection({ user }: { user: UserRecord | null }) {
  return (
    <>
      <SectionHeader
        title="Email"
        subtitle="Manage the email address used for notifications and security."
      />
      <Card>
        <h3 className="text-lg font-semibold text-foreground">Email Management</h3>
        <form action={changeEmailAction} className="mt-4 grid gap-3">
          <div className="rounded-2xl border border-line bg-panel px-4 py-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Current email</div>
            <div className="mt-2 text-sm font-medium text-foreground">{user?.email ?? "Unknown"}</div>
          </div>
          <input className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none" defaultValue={user?.email ?? ""} name="email" placeholder="new@example.com" type="email" />
          <input className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none" name="confirmEmail" placeholder="Confirm new email" type="email" />
          <input className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none" name="currentPassword" placeholder="Current password" type="password" />
          <SubmitButton>Update email</SubmitButton>
        </form>
      </Card>
    </>
  );
}

function PreferencesSection({
  documentAcceptance,
  user,
  verified,
}: {
  documentAcceptance: DocumentAcceptanceStatusRecord;
  user: UserRecord | null;
  verified: boolean;
}) {
  const documentRows = [
    { key: "terms" as const, label: "Terms of Service", href: "/terms" },
    { key: "privacy" as const, label: "Privacy Policy", href: "/privacy-policy" },
    { key: "refund" as const, label: "Refund Policy", href: "/refund-policy" },
    { key: "aml" as const, label: "AML Policy", href: "/aml-policy" },
    { key: "legalConfirmation" as const, label: "Final legal confirmation", href: "/terms" },
  ];

  return (
    <>
      <SectionHeader
        title="Preferences"
        subtitle="Account preferences."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Required Documents</h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                Current document version: {documentAcceptance.currentVersion}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(documentAcceptance.accepted)}`}>
              {documentAcceptance.accepted ? "Accepted" : "Action required"}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {documentRows.map((item) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3"
                key={item.key}
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs text-muted">
                    Version {documentAcceptance.required[item.key].version}
                    {documentAcceptance.required[item.key].acceptedAt
                      ? ` / accepted ${formatDisplayDateTime(String(documentAcceptance.required[item.key].acceptedAt))}`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(documentAcceptance.required[item.key].accepted)}`}>
                    {documentAcceptance.required[item.key].accepted ? "Accepted" : "Not accepted"}
                  </span>
                  <Button asChild variant="secondary">
                    <Link href={item.href}>Review</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
            Last accepted:{" "}
            <span className="font-semibold text-foreground">
              {documentAcceptance.acceptedAllAt
                ? formatDisplayDateTime(documentAcceptance.acceptedAllAt)
                : "Not accepted"}
            </span>
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold text-foreground">Notification Preferences</h3>
          <div className="mt-4">
            <InfoRow label="Website notifications" value="Enabled" />
            <InfoRow label="Telegram notifications" value={user?.telegramVerified ? "Linked" : "Awaiting link"} />
            <InfoRow label="Email notifications" value="Enabled" />
          </div>
        </Card>
      </div>
      <Card>
        <h3 className="text-lg font-semibold text-foreground">Vault Integrity</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Archive readiness" value={`${user?.vaultIntegrityScore ?? 0}%`} />
          <MiniStat label="Status" value={user?.vaultIntegrityStatus ?? "Unstable"} />
          <MiniStat label="Verification" value={verified ? "Verified" : "Required"} />
        </div>
      </Card>
    </>
  );
}

function ReadinessStrip({ user, verified }: { user: UserRecord | null; verified: boolean }) {
  return (
    <Card className="p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label="Verification" value={verified ? "Enabled" : "Required"} />
        <MiniStat label="Payment details" value={user?.gate2Phone || user?.paymentPhone ? "Ready" : "Missing"} />
        <MiniStat label="Required documents" value={user?.latestTermsAcceptedAt ? "Accepted" : "Pending"} />
        <MiniStat label="Login alerts" value="Enabled" />
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function RightRail({
  balance,
  recentActivity,
  user,
  verified,
}: {
  balance: BalanceRecord | null;
  recentActivity: TransactionRecord[];
  user: UserRecord | null;
  verified: boolean;
}) {
  return (
    <aside className="min-w-0 space-y-4 xl:col-span-2 2xl:col-span-1 2xl:self-start">
      <Card>
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Account Balance</div>
        <div className="mt-2 text-3xl font-semibold text-foreground">
          {formatUsd(balance?.available ?? 0)}
          <span className="ml-2 text-sm text-muted">USD</span>
        </div>
        <p className="mt-2 text-sm text-muted">Available for purchases on ReboHrome.</p>
        <div className="mt-4 grid gap-2">
          <Button asChild>
            <Link href="/dashboard/deposit">Deposit</Link>
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">Recent Activity</h3>
          <Link className="text-xs font-semibold text-violet-200 hover:text-white" href="/dashboard/transactions">
            View all
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted">No recent activity yet.</p>
          ) : (
            recentActivity.map((item) => (
              <div className="flex items-center justify-between gap-3" key={item.id}>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-violet-500/15 text-violet-200">
                    {item.kind === "deposit" ? <ArrowDownToLine className="size-4" /> : <CreditCard className="size-4" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground capitalize">{item.kind}</span>
                    <span className="block text-xs text-muted">{formatDisplayDate(item.createdAt)}</span>
                  </span>
                </div>
                <span className={item.amount >= 0 ? "text-sm font-semibold text-emerald-300" : "text-sm font-semibold text-rose-300"}>
                  {item.amount >= 0 ? "+" : ""}
                  {formatCurrency(item.amount, item.displayCurrency ?? "USD")}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-foreground">Security Status</h3>
        <div className="mt-4 space-y-2">
          <StatusPill label="Verification" value={verified ? "Verified" : "Required"} ok={verified} />
          <StatusPill label="Telegram" value={user?.telegramVerified ? "Linked" : "Awaiting link"} ok={Boolean(user?.telegramVerified)} />
          <StatusPill label="Payment Details" value={user?.gate2Phone || user?.paymentPhone ? "Ready" : "Missing"} ok={Boolean(user?.gate2Phone || user?.paymentPhone)} />
          <StatusPill label="Required Documents" value={user?.latestTermsAcceptedAt ? "Accepted" : "Pending"} ok={Boolean(user?.latestTermsAcceptedAt)} />
        </div>
      </Card>

      <Card className="border-violet-300/25 bg-[linear-gradient(145deg,rgba(139,92,246,0.14),rgba(11,15,29,0.96))]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">Need help?</h3>
            <p className="mt-2 text-sm leading-6 text-muted">Visit our Help Center for guides and support.</p>
            <Link className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-violet-200" href="/faq">
              Go to Help Center <ExternalLink className="size-3.5" />
            </Link>
          </div>
          <HelpCircle className="size-5 text-violet-200" />
        </div>
      </Card>
    </aside>
  );
}

function HelpPoliciesSection() {
  const links = [
    { href: "/faq", label: "FAQ" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/refund-policy", label: "Refund Policy" },
    { href: "/aml-policy", label: "AML Policy" },
    { href: "/contact", label: "Contact Support" },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Help & Policies
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Quick access to support, FAQ, and ReboHrome policy documents.
          </p>
        </div>
        <HelpCircle className="size-5 text-violet-200" />
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <Button asChild key={item.href} variant="secondary">
            <Link className="justify-between" href={item.href}>
              {item.label}
              <FileText className="size-4" />
            </Link>
          </Button>
        ))}
      </div>
    </Card>
  );
}

function StatusPill({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(ok)}`}>
        {value}
      </span>
    </div>
  );
}
