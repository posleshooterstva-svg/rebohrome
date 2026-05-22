import { redirect } from "next/navigation";
import { RegisterFlowClient } from "@/components/auth/register-flow-client";
import { TELEGRAM_BOT_USERNAME } from "@/lib/server-config";
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
            Registration now pauses until Telegram ownership is verified. Your profile,
            wallet, and private vault are created only after the 6-digit bot code is
            confirmed.
          </p>

          <div className="mt-10 space-y-4">
            {[
              "Secure username, email, and password access",
              "Mandatory Telegram ownership verification before account creation",
              `Open ${TELEGRAM_BOT_USERNAME.startsWith("@") ? TELEGRAM_BOT_USERNAME : `@${TELEGRAM_BOT_USERNAME}`} and press Start before requesting a code`,
              "Private vault, balance wallet, and order access are created only after verification succeeds",
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
          <RegisterFlowClient
            initialError={error}
            telegramBotHandle={
              TELEGRAM_BOT_USERNAME.startsWith("@")
                ? TELEGRAM_BOT_USERNAME
                : `@${TELEGRAM_BOT_USERNAME}`
            }
          />
        </section>
      </div>
    </main>
  );
}
