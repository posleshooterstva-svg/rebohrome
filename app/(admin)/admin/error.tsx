"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

type AdminErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminErrorPage({
  error,
  reset,
}: AdminErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[20px] border border-line bg-white px-6 py-8 shadow-panel sm:px-8">
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
          Admin Workspace
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-foreground">
          This admin page could not be loaded.
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted">
          The route stayed protected, but something went wrong while loading the
          workspace. Retry the page or return to the products view.
        </p>
        {error.digest ? (
          <div className="mt-5 rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-3 text-sm text-muted">
            Error digest: {error.digest}
          </div>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button onClick={reset} type="button">
            Retry page
          </Button>
          <Button asChild type="button" variant="secondary">
            <Link href="/admin/products">Back to products</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
