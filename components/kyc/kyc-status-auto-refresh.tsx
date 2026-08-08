"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type KycStatusAutoRefreshProps = {
  initialStatus: string;
  initialVerified: boolean;
};

const pendingStatuses = new Set(["session_created", "submitted", "review"]);
const terminalStatuses = new Set([
  "approved",
  "manual_approved",
  "declined",
  "manual_declined",
  "manual_rejected",
  "expired",
  "abandoned",
]);

export function KycStatusAutoRefresh({
  initialStatus,
  initialVerified,
}: KycStatusAutoRefreshProps) {
  const router = useRouter();
  const refreshedRef = useRef(false);
  const lastSyncAtRef = useRef(0);

  useEffect(() => {
    if (initialVerified || !pendingStatuses.has(initialStatus)) {
      return;
    }

    let active = true;

    async function poll() {
      try {
        const response = await fetch("/api/kyc/veriff/check-status", {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          ok?: boolean;
          status?: string;
          verified?: boolean;
        };

        if (!active || !result.ok || refreshedRef.current) {
          return;
        }

        if (
          result.verified ||
          (result.status && terminalStatuses.has(result.status)) ||
          (result.status && result.status !== initialStatus)
        ) {
          refreshedRef.current = true;
          router.refresh();
          return;
        }

        const now = Date.now();
        if (now - lastSyncAtRef.current > 15_000) {
          lastSyncAtRef.current = now;
          await fetch("/api/kyc/veriff/check-status", {
            method: "POST",
          });
        }
      } catch {
      }
    }

    void poll();
    const timer = window.setInterval(poll, 3_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [initialStatus, initialVerified, router]);

  return null;
}
