import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About | ReboHrome",
  description:
    "Learn how ReboHrome helps collectors buy, organize, and manage collectible cards.",
};

const points = [
  "Digital and physical collectible cards",
  "Secure checkout and account balance",
  "Private archive for purchases and order history",
];

export default function AboutPage() {
  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-panel">
      <section className="w-full px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-[1480px] gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
              About ReboHrome
            </p>
            <h1 className="mt-3 display-font text-5xl font-semibold tracking-[-0.06em] text-foreground sm:text-6xl">
              A private archive for collectors
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted">
              ReboHrome is built for buying collectible cards and keeping every purchase
              organized in one account.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard/marketplace">Explore Marketplace</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/faq">FAQ</Link>
              </Button>
            </div>
          </div>

          <section className="rounded-[22px] border border-line bg-white p-6 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
              What you can do
            </h2>
            <div className="mt-6 grid gap-3">
              {points.map((point) => (
                <div
                  className="rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-4 text-sm font-medium text-foreground"
                  key={point}
                >
                  {point}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
