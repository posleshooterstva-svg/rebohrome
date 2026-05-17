"use client";

import { motion } from "framer-motion";
import { type ProductRecord } from "@/lib/rebohrome-data";
import { CardArtwork } from "./card-artwork";

const transforms = [
  "left-6 top-12 rotate-[-14deg] sm:left-10",
  "left-1/2 top-0 z-10 -translate-x-1/2",
  "right-6 top-12 rotate-[14deg] sm:right-10",
] as const;

type HeroStackProps = {
  cards: ProductRecord[];
};

export function HeroStack({ cards }: HeroStackProps) {
  return (
    <div className="relative mx-auto mt-4 h-[290px] w-full max-w-[360px] sm:h-[340px] sm:max-w-[420px]">
      {cards.slice(0, 3).map((card, index) => (
        <motion.div
          key={card.id}
          animate={{
            y: [0, -10, 0],
            rotate:
              index === 1
                ? [0, 2, 0]
                : [
                    index === 0 ? -14 : 14,
                    index === 0 ? -12 : 12,
                    index === 0 ? -14 : 14,
                  ],
          }}
          className={`absolute w-[38%] min-w-[120px] ${transforms[index]}`}
          transition={{
            duration: 7 + index,
            ease: "easeInOut",
            repeat: Number.POSITIVE_INFINITY,
          }}
        >
          <div className="rounded-[26px] border border-white/70 bg-white/80 p-2 shadow-[0_20px_45px_rgba(150,160,190,0.18)] dark:border-white/10 dark:bg-[rgba(17,21,42,0.92)] dark:shadow-[0_26px_60px_rgba(2,6,23,0.5)]">
            <CardArtwork card={card} className="aspect-[4/5] w-full" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
