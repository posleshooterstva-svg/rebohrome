"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  PremiumLoadingSystem,
  type LoadingStep,
} from "@/components/rebohrome/premium-loading-system";

type CinematicLoadingOverlayProps = {
  open: boolean;
  eyebrow?: string;
  title: string;
  description: string;
  step?: LoadingStep;
};

function inferStep(title: string): LoadingStep {
  const value = title.toLowerCase();
  if (value.includes("payment") || value.includes("deposit")) {
    return "payment";
  }
  if (value.includes("redirect")) {
    return "redirect";
  }
  if (value.includes("verify")) {
    return "verifying";
  }
  if (value.includes("withdraw") || value.includes("balance")) {
    return "balance";
  }
  if (value.includes("purchase") || value.includes("assign")) {
    return "assigning";
  }
  return "syncing";
}

export function CinematicLoadingOverlay({
  open,
  title,
  description,
  step,
}: CinematicLoadingOverlayProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[260]"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <PremiumLoadingSystem
            fullScreen
            step={step ?? inferStep(title)}
            subtitle={description}
            title={title}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
