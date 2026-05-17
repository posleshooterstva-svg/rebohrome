import Link from "next/link";

export function RebohromeLogo() {
  return (
    <Link className="inline-flex items-center gap-3" href="/">
      <span className="relative flex size-8 items-center justify-center">
        <span className="absolute inset-0 rotate-45 rounded-[9px] border border-[rgba(120,112,241,0.28)] bg-[rgba(120,112,241,0.08)]" />
        <span className="absolute inset-[5px] rotate-45 rounded-[7px] border border-white bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(227,223,255,0.92))]" />
      </span>
      <span className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
        ReboHrome
      </span>
    </Link>
  );
}
