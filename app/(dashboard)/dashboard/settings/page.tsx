import { SettingsHubClient, type SettingsSectionId } from "@/components/dashboard/settings-hub-client";
import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  getBalanceByUserId,
  getUserDocumentAcceptanceStatus,
  getUserById,
  getUserKycProfile,
  getUserTransactions,
} from "@/lib/db/repository";
import { getPayoutTierProgress } from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import { requireUserSession } from "@/lib/session";

type DashboardSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const settingsSections: SettingsSectionId[] = [
  "account",
  "payments",
  "verification",
  "security",
  "email",
  "preferences",
];

function normalizeSection(value: string | string[] | undefined): SettingsSectionId {
  const section = Array.isArray(value) ? value[0] : value;
  return settingsSections.includes(section as SettingsSectionId)
    ? (section as SettingsSectionId)
    : "account";
}

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage({
  searchParams,
}: DashboardSettingsPageProps) {
  return withPerf("route=/dashboard/settings", async () => {
    const params = await searchParams;
    const session = await requireUserSession("/login");
    const [user, balance, recentActivity, kycProfile] = await Promise.all([
      getUserById(session.userId),
      getBalanceByUserId(session.userId),
      getUserTransactions(session.userId, 4),
      getUserKycProfile(session.userId),
    ]);
    const documentAcceptance = await getUserDocumentAcceptanceStatus(session.userId);
    const tierProgress = getPayoutTierProgress(balance?.totalDeposited ?? 0);

    return (
      <DashboardShell
        active="settings"
        description="Account settings."
        hideIntro
        showRightRail={false}
        title="Settings"
      >
        <SettingsHubClient
          balance={balance}
          documentAcceptance={documentAcceptance}
          initialSection={normalizeSection(params.section)}
          kycProfile={kycProfile}
          recentActivity={recentActivity}
          searchState={{
            archiveRulesAccepted: params.archiveRulesAccepted === "1",
            emailError: typeof params.emailError === "string" ? params.emailError : null,
            emailUpdated: params.emailUpdated === "1",
            phoneSaved: params.phoneSaved === "1",
            saved: params.saved === "1",
          }}
          tierProgress={tierProgress}
          user={user}
        />
      </DashboardShell>
    );
  });
}
