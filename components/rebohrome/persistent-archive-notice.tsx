"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, ExternalLink, ShieldCheck } from "lucide-react";

type PopupNotice = {
  id: string;
  title: string;
  body: string;
  type: string;
  cta_label: string | null;
  cta_url: string | null;
  created_at: string;
  allow_user_dismiss: boolean;
};

export function PersistentArchiveNotice() {
  const [notice, setNotice] = useState<PopupNotice | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/notifications/active-popups", {
          cache: "no-store",
        });
        const payload = (await response.json()) as { popups?: PopupNotice[] };
        if (active) {
          setNotice(payload.popups?.[0] ?? null);
        }
      } catch {
        if (active) {
          setNotice(null);
        }
      }
    }

    load();
    const timer = window.setInterval(load, 45_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!notice) {
    return null;
  }

  return (
    <aside className="fixed bottom-5 left-5 z-[230] w-[calc(100vw-2.5rem)] max-w-[380px] rounded-[20px] border border-purple-300/20 bg-[rgba(14,20,34,0.92)] p-4 text-white shadow-[0_24px_80px_rgba(139,92,246,0.26)] backdrop-blur-2xl sm:bottom-6 sm:left-6">
      <div className="absolute inset-0 -z-10 rounded-[20px] bg-[radial-gradient(circle_at_16%_0%,rgba(139,92,246,0.2),transparent_45%)]" />
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-purple-300/20 bg-purple-500/15 text-purple-200">
          <BellRing className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-purple-200">
            Archive Notice
          </div>
          <h2 className="mt-2 text-base font-semibold leading-6 text-white">
            {notice.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{notice.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
              {notice.type.replace(/_/g, " ")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
              <ShieldCheck className="size-3" />
              Visible to verified collectors
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            {notice.cta_url ? (
              <Link
                className="inline-flex items-center gap-2 rounded-[12px] bg-[linear-gradient(135deg,#8b5cf6,#6d4df2)] px-3.5 py-2 text-sm font-medium text-white"
                href={notice.cta_url}
              >
                {notice.cta_label || "Open details"}
                <ExternalLink className="size-3.5" />
              </Link>
            ) : (
              <Link
                className="inline-flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white"
                href="/notifications"
              >
                Open notices
              </Link>
            )}
            <span className="text-xs text-slate-500">
              {new Date(notice.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
