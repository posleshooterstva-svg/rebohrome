import { ReceiptBuilderClient } from "@/components/admin/receipt-builder-client";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";

export default function AdminReceiptsPage() {
  return (
    <AdminShell
      active="receipts"
      description="Create branded purchase receipts for archive-delivered collectibles."
      title="Receipts"
    >
      <ReceiptBuilderClient />
    </AdminShell>
  );
}
