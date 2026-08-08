import { PrintEngineClient } from "@/components/admin/print-engine-client";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";

export default function AdminPrintEnginePage() {
  return (
    <AdminShell
      active="print-engine"
      description="Generate print-ready postal receipts and shipping labels from locked millimeter templates."
      title="Print Engine"
    >
      <PrintEngineClient />
    </AdminShell>
  );
}
