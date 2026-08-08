"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CheckVeriffStatusButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function checkStatus() {
    if (isPending) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/kyc/veriff/check-status", {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        status?: string;
        verified?: boolean;
      };

      if (!result.ok) {
        setMessage(result.error ?? "Unable to sync Veriff status.");
        return;
      }

      setMessage(
        result.verified
          ? "Verification approved. Refreshing access..."
          : `Current Veriff status: ${result.status ?? "review"}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={isPending} onClick={checkStatus} type="button" variant="secondary">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Check Veriff Status
      </Button>
      {message ? <p className="text-xs leading-5 text-slate-300">{message}</p> : null}
    </div>
  );
}
