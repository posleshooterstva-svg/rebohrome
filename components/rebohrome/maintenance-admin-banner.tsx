import Link from "next/link";
import { disableMaintenanceModeQuickAction } from "@/app/actions/marketplace";
import { Button } from "@/components/ui/button";

type MaintenanceAdminBannerProps = {
  currentPath: string;
  maintenance: {
    estimatedReturnAt: string | null;
  };
};

export function MaintenanceAdminBanner({
  currentPath,
  maintenance,
}: MaintenanceAdminBannerProps) {
  return (
    <div className="sticky top-0 z-[240] border-b border-[rgba(245,158,11,0.28)] bg-[rgba(255,250,240,0.96)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Maintenance Mode is active. Public users cannot access the site.
          </div>
          <div className="mt-1 text-sm text-muted">
            {maintenance.estimatedReturnAt
              ? `Estimated return: ${maintenance.estimatedReturnAt}`
              : "Admin and webhook access remain available while maintenance is enabled."}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <form action={disableMaintenanceModeQuickAction}>
            <input name="redirectTo" type="hidden" value={currentPath || "/"} />
            <Button type="submit">Disable Maintenance</Button>
          </form>
          <Button asChild type="button" variant="secondary">
            <Link href="/admin/settings">Go to System Settings</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
