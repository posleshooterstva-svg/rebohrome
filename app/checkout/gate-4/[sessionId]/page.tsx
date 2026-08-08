import { redirect } from "next/navigation";
import { CoinflowCheckoutClient } from "@/components/payments/gate4/CoinflowCheckoutClient";
import { getCoinflowGateCheckoutSession } from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";

type CoinflowGateCheckoutPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

function shortenSessionId(sessionId: string) {
  if (sessionId.length <= 18) {
    return sessionId;
  }
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-6)}`;
}

export default async function CoinflowGateCheckoutPage({
  params,
}: CoinflowGateCheckoutPageProps) {
  const session = await getSessionState();

  if (!session.userId) {
    redirect("/login");
  }

  const { sessionId } = await params;
  const checkout = await getCoinflowGateCheckoutSession({
    userId: session.userId,
    sessionId,
  });

  if (!checkout) {
    redirect("/dashboard/deposit");
  }

  const shortSessionId = shortenSessionId(checkout.session.id);
  const formattedAmount = `$${checkout.session.amount.toFixed(2)} USD`;
  const formattedStatus = checkout.session.status.replaceAll("_", " ");

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-[radial-gradient(circle_at_15%_0%,rgba(124,58,237,0.18),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.11),transparent_30%),#050712] px-3 py-5 text-foreground sm:px-5 sm:py-8 lg:px-8">
      <div className="flex w-full flex-col gap-6">
        <section className="rounded-[28px] border border-line bg-panel-strong/90 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:rounded-[34px] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-violet-300">
            Gate #4{session.isAdminAuthenticated ? " Sandbox" : ""}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl lg:text-4xl">
            Complete your Gate #4 payment
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Secure card checkout.
          </p>

          <div className="mt-6 grid gap-3 rounded-[22px] border border-line bg-background/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-muted">Session</div>
              <div
                className="mt-1 break-all font-mono text-xs font-semibold text-foreground"
                title={checkout.session.id}
              >
                {shortSessionId}
              </div>
            </div>
            <div>
              <div className="text-muted">Amount</div>
              <div className="mt-1 font-semibold">{formattedAmount}</div>
            </div>
            <div>
              <div className="text-muted">Status</div>
              <div className="mt-1 font-semibold capitalize">
                {formattedStatus}
              </div>
            </div>
            <div>
              <div className="text-muted">Payment method</div>
              <div className="mt-1 font-semibold">Credit / debit card</div>
            </div>
          </div>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,720px)_minmax(300px,1fr)]">
          <section className="min-w-0 rounded-[28px] border border-line bg-panel-strong/80 p-4 shadow-[0_24px_100px_rgba(76,29,149,0.18)] backdrop-blur sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                  Secure card checkout
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                  Credit / debit card
                </h2>
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                Sandbox
              </span>
            </div>
            <CoinflowCheckoutClient sessionId={checkout.session.id} />
          </section>

          <aside className="grid gap-4">
            <section className="rounded-[26px] border border-line bg-panel-strong/85 p-5 shadow-xl shadow-black/20">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">
                Payment summary
              </p>
              <div className="mt-5 space-y-4 text-sm">
                <SummaryRow label="Amount" value={formattedAmount} />
                <SummaryRow label="Method" value="Credit / debit card" />
                <SummaryRow label="Status" value={formattedStatus} capitalize />
                <SummaryRow label="Session" value={shortSessionId} mono title={checkout.session.id} />
              </div>
            </section>

            <section className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/10 p-5 text-sm leading-6 text-cyan-50">
              <div className="font-semibold text-foreground">Secure confirmation</div>
              <p className="mt-2 text-muted">
                Your balance is updated only after Coinflow sends a verified
                settled payment event to ReboHrome.
              </p>
            </section>

            <a
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-line bg-panel px-4 py-3 text-sm font-semibold text-foreground transition hover:border-violet-300/50"
              href="/dashboard/deposit"
            >
              Back to deposit
            </a>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
  capitalize = false,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted">{label}</span>
      <span
        className={`min-w-0 break-all text-right font-semibold text-foreground ${
          mono ? "font-mono text-xs" : ""
        } ${capitalize ? "capitalize" : ""}`}
        title={title}
      >
        {value}
      </span>
    </div>
  );
}
