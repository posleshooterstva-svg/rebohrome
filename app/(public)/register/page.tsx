import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/actions/auth";
import { getSessionState } from "@/lib/session";

type RegisterPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const session = await getSessionState();

  if (session.isUserAuthenticated) {
    redirect(session.isAdminAuthenticated ? "/admin" : "/dashboard");
  }

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="mx-auto flex w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid min-h-[78vh] w-full gap-6 lg:grid-cols-[0.96fr_1.04fr]">
        <section className="rounded-[34px] border border-line bg-panel px-7 py-8 shadow-panel sm:px-9">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
            New Collector
          </p>
          <h1 className="mt-5 display-font max-w-xl text-5xl font-semibold tracking-[-0.05em] text-foreground">
            Open your archive account.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
            Registration creates your profile, wallet balance, and private vault in one
            step. Telegram username is required so financial events can stay linked to your
            identity.
          </p>

          <div className="mt-10 space-y-4">
            {[
              "Secure username and password access",
              "Telegram-linked collector identity",
              "Automatic archive balance provisioning",
              "Private vault, order history, and collection access after registration",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[22px] border border-line bg-panel-strong px-4 py-4 text-sm text-muted"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[34px] border border-line bg-panel px-7 py-8 shadow-panel sm:px-9">
          <div className="rounded-[14px] border border-line bg-[rgba(255,255,255,0.92)] p-6 shadow-[0_18px_48px_rgba(146,160,205,0.12)]">
            <div className="text-xs uppercase tracking-[0.28em] text-muted">
              Register
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              Create collector account
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Telegram username must start with <span className="font-medium">@</span>.
            </p>

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-200/70 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <form action={registerAction} className="mt-6 space-y-4">
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
                  Telegram username
                </span>
                <input
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                  name="telegram_username"
                  placeholder="@collector_handle"
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">
                    Password
                  </span>
                  <input
                    className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                    name="password"
                    placeholder="At least 8 characters"
                    required
                    type="password"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">
                    Confirm password
                  </span>
                  <input
                    className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
                    name="confirm_password"
                    placeholder="Repeat password"
                    required
                    type="password"
                  />
                </label>
              </div>
              <button
                className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#111827,#7266ff)] px-4 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px]"
                type="submit"
              >
                Create account
              </button>
            </form>

            <p className="mt-5 text-sm text-muted">
              Already have an account?{" "}
              <Link className="font-medium text-[var(--accent)]" href="/login">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
