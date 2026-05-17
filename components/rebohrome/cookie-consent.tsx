"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "rebohrome-cookie-consent-v1";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    setVisible(saved !== "accepted");
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[140] w-[calc(100%-2rem)] max-w-[360px] sm:right-6 lg:right-8">
      <div className="pointer-events-auto flex w-full flex-col gap-4 rounded-[14px] border border-line bg-[rgba(255,255,255,0.96)] px-5 py-4 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="max-w-3xl">
          <div className="text-sm font-semibold text-foreground">
            Cookies & analytics
          </div>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            ReboHrome uses cookies, session storage, analytics, and security signals
            to protect accounts, improve authentication, and maintain platform
            performance. Review the full policy in{" "}
            <Link className="font-medium text-[var(--accent)]" href="/privacy-policy">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-[10px] bg-foreground px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-92"
          onClick={() => {
            window.localStorage.setItem(STORAGE_KEY, "accepted");
            setVisible(false);
          }}
          type="button"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
