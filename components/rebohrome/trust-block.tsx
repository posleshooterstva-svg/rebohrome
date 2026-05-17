import { CheckCircle2, LockKeyhole, ShieldCheck, Zap } from "lucide-react";

const trustItems = [
  {
    icon: LockKeyhole,
    title: "SSL Secured",
    text: "Encrypted traffic and hardened session handling.",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted Transactions",
    text: "Protected payment and withdrawal event tracking.",
  },
  {
    icon: CheckCircle2,
    title: "Verified Marketplace",
    text: "Admin-reviewed inventory and role-based access control.",
  },
  {
    icon: Zap,
    title: "Instant Digital Delivery",
    text: "Owned cards land in your vault after successful payment.",
  },
];

export function TrustBlock() {
  return (
    <section className="rounded-[28px] border border-line bg-panel-strong p-5">
      <div className="text-sm font-semibold text-foreground">Trust & Security</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {trustItems.map((item) => (
          <div
            key={item.title}
            className="rounded-[22px] border border-line bg-panel px-4 py-4"
          >
            <item.icon className="size-5 text-[var(--accent)]" />
            <div className="mt-3 text-sm font-semibold text-foreground">
              {item.title}
            </div>
            <div className="mt-2 text-sm leading-6 text-muted">{item.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
