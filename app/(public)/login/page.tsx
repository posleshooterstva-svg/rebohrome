import { redirect } from "next/navigation";
import { LoginFlowClient } from "@/components/auth/login-flow-client";
import { getSessionState } from "@/lib/session";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSessionState();
  const params = await searchParams;
  const redirectTo =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : typeof params.redirectTo === "string" && params.redirectTo.startsWith("/")
        ? params.redirectTo
        : "/dashboard";

  if (session.isUserAuthenticated) {
    redirect(session.isAdminAuthenticated ? "/admin" : redirectTo);
  }

  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="mx-auto flex w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid min-h-[78vh] w-full gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[34px] border border-line bg-panel px-7 py-8 shadow-panel sm:px-9">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
            Collector Access
          </p>
          <h1 className="mt-5 display-font max-w-xl text-5xl font-semibold tracking-[-0.05em] text-foreground">
            Enter your galactic vault.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
            Sign in with your username and password to access balances, transactions,
            owned cards and your private archive dashboard.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Archive Balance", "Fund purchases and follow every transaction from one secure wallet."],
              ["Private Vault", "Access owned cards, archive IDs, and collector order history."],
              ["Verified Access", "Enter a clean, protected account built for premium ownership."],
            ].map(([title, text]) => (
              <div
                key={title}
                className="rounded-[24px] border border-line bg-panel-strong p-4"
              >
                <div className="text-sm font-semibold text-foreground">{title}</div>
                <div className="mt-2 text-sm leading-6 text-muted">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[34px] border border-line bg-panel px-7 py-8 shadow-panel sm:px-9">
          <div className="rounded-[14px] border border-line bg-[rgba(255,255,255,0.92)] p-6 shadow-[0_18px_48px_rgba(146,160,205,0.12)]">
            <div className="text-xs uppercase tracking-[0.28em] text-muted">
              Sign In
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              Welcome back
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use your ReboHrome username to continue.
            </p>

            <LoginFlowClient initialError={error} redirectTo={redirectTo} />
          </div>
        </section>
      </div>
    </main>
  );
}
