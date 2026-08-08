import { notFound } from "next/navigation";
import { AdminUserDetailManager } from "@/components/admin/admin-user-detail-manager";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import {
  getAdminUserAuditLog,
  getAdminUserDetail,
  getAdminUserInventory,
  getAdminUserTransactions,
  getUserDocumentAcceptanceStatus,
  searchAdminProducts,
} from "@/lib/db/repository";
import { requireAdminSession } from "@/lib/session";

type AdminUserDetailPageProps = {
  params: Promise<{ userId: string }>;
};

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: AdminUserDetailPageProps) {
  await requireAdminSession("/");
  const { userId } = await params;
  const [detail, transactions, inventory, auditLog, products, documentAcceptance] = await Promise.all([
    getAdminUserDetail(userId),
    getAdminUserTransactions({ userId, limit: 100 }),
    getAdminUserInventory(userId),
    getAdminUserAuditLog(userId),
    searchAdminProducts({ limit: 20 }),
    getUserDocumentAcceptanceStatus(userId),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <AdminShell
      active="users"
      description="Review transaction history, adjust balances safely, and manage user archive inventory with audit logs."
      title="User Control Center"
    >
      <AdminUserDetailManager
        detail={detail}
        initialAuditLog={auditLog}
        initialInventory={inventory}
        initialProducts={products}
        initialTransactions={transactions}
        documentAcceptance={documentAcceptance}
      />
    </AdminShell>
  );
}
