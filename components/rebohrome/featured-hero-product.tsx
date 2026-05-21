"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { type ProductRecord } from "@/lib/rebohrome-data";

type FeaturedHeroProductProps = {
  product: ProductRecord | null;
};

export function FeaturedHeroProduct({ product }: FeaturedHeroProductProps) {
  if (!product) {
    return (
      <div
        className="relative mx-auto flex min-h-[460px] w-full max-w-[540px] items-center justify-center overflow-hidden rounded-[24px] border border-line bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(244,247,252,0.9)_46%,rgba(240,243,248,0.94)_100%)] px-6 py-8 shadow-[0_28px_60px_rgba(15,23,42,0.06)]"
        data-testid="featured-showcase"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(139,124,255,0.14),transparent_34%),radial-gradient(circle_at_50%_82%,rgba(255,255,255,0.86),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-x-[20%] top-[14%] h-[58%] rounded-[32px] border border-[rgba(221,226,238,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(248,250,255,0.12))]" />
        <div className="pointer-events-none absolute inset-x-[26%] top-[18%] h-[46%] rounded-[28px] border border-[rgba(235,238,246,0.96)] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.88),rgba(248,250,255,0.24)_58%,transparent_100%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[22%] h-[26%] w-[34%] -translate-x-1/2 rounded-full border border-[rgba(229,233,243,0.92)]" />

        <div className="relative z-10 flex w-full max-w-[320px] flex-col items-center gap-5 pt-10">
          <div className="rounded-full border border-white/84 bg-white/90 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-muted shadow-[0_12px_24px_rgba(15,23,42,0.04)] backdrop-blur">
            Featured Showcase
          </div>
          <div className="relative w-full">
            <div className="absolute inset-x-[12%] bottom-[-18px] h-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(131,146,184,0.22),transparent_72%)] blur-2xl" />
            <div className="overflow-hidden rounded-[12px] border border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.58)] p-3 shadow-[0_28px_54px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <div className="flex aspect-[4/5] items-center justify-center rounded-[8px] border border-[rgba(255,255,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(245,247,251,0.9))] px-6 text-center">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
                    Archive centerpiece
                  </div>
                  <div className="mt-3 text-sm leading-6 text-muted">
                    Select a homepage collectible in admin products to stage the archive centerpiece.
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto h-9 w-[88%] rounded-b-[8px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#eceff5_100%)] shadow-[0_8px_18px_rgba(15,23,42,0.05)]" />
          <div className="w-full max-w-[292px] rounded-[18px] border border-white/84 bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(248,249,253,0.92)_100%)] px-4 py-4 text-center shadow-[0_18px_34px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted">
              Archive Exhibit
            </div>
            <div className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-foreground">
              No featured collectible selected
            </div>
            <div className="mt-2 text-[11px] leading-5 text-muted">
              The pedestal remains staged while the next archive centerpiece is being prepared.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      aria-label={`Open ${product.title}`}
      className="group block"
      href={`/product/${product.id}`}
    >
      <div
        className="relative mx-auto flex min-h-[460px] w-full max-w-[540px] items-center justify-center overflow-hidden rounded-[24px] border border-line bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(244,247,252,0.9)_46%,rgba(240,243,248,0.94)_100%)] px-6 py-8 shadow-[0_28px_60px_rgba(15,23,42,0.06)]"
        data-testid="featured-showcase"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(139,124,255,0.14),transparent_34%),radial-gradient(circle_at_50%_82%,rgba(255,255,255,0.86),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-x-[20%] top-[14%] h-[58%] rounded-[32px] border border-[rgba(221,226,238,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(248,250,255,0.12))]" />
        <div className="pointer-events-none absolute inset-x-[26%] top-[18%] h-[46%] rounded-[28px] border border-[rgba(235,238,246,0.96)] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.88),rgba(248,250,255,0.24)_58%,transparent_100%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[22%] h-[26%] w-[34%] -translate-x-1/2 rounded-full border border-[rgba(229,233,243,0.92)]" />

        <div className="relative z-10 flex w-full max-w-[320px] flex-col items-center gap-5 pt-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/84 bg-white/90 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted shadow-[0_12px_24px_rgba(15,23,42,0.04)] backdrop-blur">
            <span>Featured Collectible</span>
            <span className="h-3.5 w-px bg-line" />
            <span className="inline-flex items-center gap-1.5 text-[var(--accent)]">
              <Sparkles className="size-3.5" />
              {product.rarity}
            </span>
          </div>

          <motion.div
            animate={{ y: [0, -6, 0] }}
            className="relative w-full max-w-[252px]"
            transition={{ duration: 6.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            whileHover={{ y: -8, scale: 1.012 }}
          >
            <div className="absolute inset-x-[12%] bottom-[-18px] h-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(131,146,184,0.28),transparent_72%)] blur-2xl" />
            <div className="overflow-hidden rounded-[12px] border border-[rgba(15,23,42,0.12)] bg-[rgba(255,255,255,0.58)] p-3 shadow-[0_28px_54px_rgba(15,23,42,0.08)] backdrop-blur-sm transition duration-300 group-hover:shadow-[0_34px_62px_rgba(15,23,42,0.12)]">
              <div className="rounded-[8px] border border-[rgba(255,255,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(245,247,251,0.9))] p-3">
                <CardArtwork card={product} className="aspect-[4/5] w-full" />
              </div>
            </div>
          </motion.div>

          <div className="mx-auto h-9 w-[72%] rounded-b-[8px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#eceff5_100%)] shadow-[0_8px_18px_rgba(15,23,42,0.05)]" />

          <div className="w-full max-w-[292px] rounded-[18px] border border-white/84 bg-[linear-gradient(180deg,rgba(255,255,255,0.88)_0%,rgba(248,249,253,0.92)_100%)] px-4 py-4 text-center shadow-[0_18px_34px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted">
              Archive Exhibit
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-muted">
              {product.collection}
            </div>
            <div className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-foreground">
              {product.title}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted">
              <span>{product.rarity}</span>
              <span className="size-1 rounded-full bg-[var(--accent)]/50" />
              <span>{product.edition}</span>
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
              View artifact
              <ArrowUpRight className="size-3.5" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
