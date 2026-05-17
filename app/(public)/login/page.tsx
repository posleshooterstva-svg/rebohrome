import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { getSessionState } from "@/lib/session";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSessionState();

  if (session.isUserAuthenticated) {
    redirect(session.isAdminAuthenticated ? "/admin" : "/dashboard");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const redirectTo =
    typeof params.redirectTo === "string" && params.redirectTo.startsWith("/")
      ? params.redirectTo
      : "/dashboard";

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
            owned cards, withdrawals, and your private archive dashboard.
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

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-200/70 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <form action={loginAction} className="mt-6 space-y-4">
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">
                  Username
                </span>
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                  name="username"
                  placeholder="archive_user"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">
                  Password
                </span>
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                  name="password"
                  placeholder="Enter your password"
                  required
                  type="password"
                />
              </label>
              <button
                className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#111827,#7266ff)] px-4 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px]"
                type="submit"
              >
                Sign in
              </button>
            </form>

            <p className="mt-5 text-sm text-muted">
              New here?{" "}
              <Link className="font-medium text-[var(--accent)]" href="/register">
                Create an account
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
