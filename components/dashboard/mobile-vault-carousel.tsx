"use client";

import { motion } from "framer-motion";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import {
  formatDisplayDate,
  type ProductRecord,
} from "@/lib/rebohrome-data";

type MobileVaultCarouselProps = {
  inventory: Array<{
    inventoryId: string;
    acquiredAt: string;
    quantity: number;
    product: ProductRecord;
  }>;
};

export function MobileVaultCarousel({ inventory }: MobileVaultCarouselProps) {
  if (inventory.length === 0) {
    return null;
  }

  return (
    <section className="md:hidden">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Mobile Vault
          </div>
          <div className="mt-1 text-sm text-muted">
            Swipe through owned archive artifacts.
          </div>
        </div>
        <div className="text-xs text-muted">Swipe</div>
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {inventory.map((entry, index) => (
          <motion.article
            key={entry.inventoryId}
            animate={{ y: [0, -4, 0] }}
            className="glass-panel min-w-[78%] snap-center rounded-[18px] border border-line px-4 py-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)]"
            initial={{ opacity: 0, y: 16 }}
            transition={{
              duration: 0.42,
              delay: index * 0.05,
              y: {
                duration: 4.2 + index * 0.35,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              },
            }}
            whileTap={{ scale: 0.985 }}
          >
            <div className="rounded-[14px] border border-white/70 bg-white/70 p-2">
              <CardArtwork
                card={entry.product}
                className="aspect-[4/5] w-full"
                compact
              />
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-[-0.03em] text-foreground">
                  {entry.product.title}
                </h2>
                <p className="mt-1 text-sm text-muted">{entry.product.collection}</p>
              </div>
              <RarityBadge rarity={entry.product.rarity} />
            </div>
            <div className="mt-4 grid gap-2 text-sm text-muted">
              <div>Owned since {formatDisplayDate(entry.acquiredAt)}</div>
              <div>Quantity {entry.quantity}</div>
              <div>Edition {entry.product.edition}</div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
