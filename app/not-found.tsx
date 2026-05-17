import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-7xl items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <section className="w-full max-w-2xl rounded-[32px] border border-line bg-panel p-8 text-center shadow-panel">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">
          Archive lookup
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
          This collectible is not in the vault.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          The requested card could not be found, but the marketplace is still
          available.
        </p>
        <Button asChild className="mt-6">
          <Link href="/marketplace">Return to marketplace</Link>
        </Button>
      </section>
    </main>
  );
}
