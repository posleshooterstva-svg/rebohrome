"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, LockKeyhole, Sparkles } from "lucide-react";

type CinematicLoadingOverlayProps = {
  open: boolean;
  eyebrow?: string;
  title: string;
  description: string;
};

export function CinematicLoadingOverlay({
  open,
  eyebrow = "Secure Processing",
  title,
  description,
}: CinematicLoadingOverlayProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[260] flex items-center justify-center bg-[rgba(250,251,255,0.78)] px-4 backdrop-blur-2xl"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,247,255,0.92))] px-7 py-8 text-center shadow-[0_50px_120px_rgba(138,149,201,0.24)]"
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-x-[18%] top-[-10%] h-32 rounded-full bg-[radial-gradient(circle_at_center,rgba(139,124,255,0.16),transparent_72%)] blur-3xl" />
            <div className="absolute inset-x-[24%] bottom-[-18%] h-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(109,205,255,0.12),transparent_72%)] blur-3xl" />
            <div className="relative mx-auto flex size-16 items-center justify-center rounded-full border border-[rgba(139,124,255,0.18)] bg-white/92 text-[var(--accent)] shadow-[0_20px_40px_rgba(139,124,255,0.16)]">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              >
                <Loader2 className="size-6" />
              </motion.div>
              <div className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <Sparkles className="size-3.5" />
              </div>
            </div>
            <div className="mt-5 text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
              {eyebrow}
            </div>
            <div className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-foreground">
              {title}
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">{description}</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-white/84 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
              <LockKeyhole className="size-3.5 text-[var(--accent)]" />
              Protected transaction route
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
