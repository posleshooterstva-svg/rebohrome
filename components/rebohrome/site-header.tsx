import { getHeaderAccount } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";
import { WorkspaceTopbar } from "./workspace-topbar";

export async function SiteHeader() {
  const session = await getSessionState();
  const account =
    session.userId && session.isUserAuthenticated
      ? await getHeaderAccount(session.userId)
      : null;

  return (
    <header className="relative z-[120] mx-auto w-full max-w-[1540px] px-4 pt-6 sm:px-6 lg:px-8">
      <WorkspaceTopbar
        account={account}
        cartHref="/cart"
        notificationHref={
          account ? "/dashboard/transactions" : "/login?redirectTo=/dashboard/transactions"
        }
        showLogo
      />
    </header>
  );
}
