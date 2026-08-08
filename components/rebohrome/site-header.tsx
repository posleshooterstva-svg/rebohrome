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
    <header className="relative z-[120] w-full border-b border-line/70 bg-[rgba(7,10,18,0.78)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <WorkspaceTopbar
        account={account}
        cartHref="/cart"
        notificationHref={
          account ? "/dashboard/transactions" : "/login?next=/dashboard/transactions"
        }
        showLogo
      />
    </header>
  );
}
