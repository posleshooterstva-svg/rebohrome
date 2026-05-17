"use client";

import { useEffect, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

type LiveRefreshControlProps = {
  label?: string;
  intervalMs?: number;
  className?: string;
};

export function LiveRefreshControl({
  label = "Live updates",
  intervalMs = 12000,
  className = "",
}: LiveRefreshControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      startTransition(() => {
        router.refresh();
      });
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, intervalMs);

    const onFocus = () => refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, router, startTransition]);

  return (
    <button
      className={`inline-flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-2 text-sm text-muted transition hover:text-foreground ${className}`.trim()}
      onClick={() =>
        startTransition(() => {
          router.refresh();
        })
      }
      type="button"
    >
      <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
      <span>{label}</span>
      <span className="inline-flex size-2 rounded-full bg-emerald-400" />
    </button>
  );
}
