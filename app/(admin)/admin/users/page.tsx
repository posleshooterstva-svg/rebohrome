import { AdminUsersManager } from "@/components/admin/admin-users-manager";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { getAdminUsers, trackUsersPageVisit } from "@/lib/db/repository";
import { type PaymentReconciliationStatus } from "@/lib/rebohrome-data";
import { withPerf } from "@/lib/server/perf";
import { getRequestMeta, requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const deferredReconciliationStatus: PaymentReconciliationStatus = {
  lastRunAt: null,
  pendingTransactions: 0,
  checkedLastHour: 0,
  succeededByCron: 0,
  failedByCron: 0,
  expiredByCron: 0,
  lastError: null,
};

export default async function AdminUsersPage() {
  return withPerf("route=/admin/users", async () => {
    const session = await requireAdminSession("/");
    const meta = await getRequestMeta("/admin/users");
    const users = await getAdminUsers();

    void trackUsersPageVisit({
      eventType: "users_page_visit",
      userId: session.user.id,
      username: session.user.username,
      telegramUsername: session.user.telegramUsername,
      role: session.user.role,
      ipAddress: meta.ipAddress,
      country: meta.country,
      userAgent: meta.userAgent,
      language: meta.language,
      route: meta.route,
      timestamp: meta.timestamp,
    }).catch((error) => {
      console.warn("[admin/users] deferred audit log failed.", error);
    });

    return (
      <AdminShell
        active="users"
        description="Manage collector identities, roles, verification, payment access, and onboarding from one clean control layer."
        title="Users"
      >
        <AdminUsersManager
          initialReconciliationStatus={deferredReconciliationStatus}
          initialUsers={users}
        />
      </AdminShell>
    );
  });
}
