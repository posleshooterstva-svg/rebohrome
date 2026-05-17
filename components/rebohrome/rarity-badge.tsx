import { rarityMeta, type Rarity } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type RarityBadgeProps = {
  rarity: Rarity;
};

export function RarityBadge({ rarity }: RarityBadgeProps) {
  const meta = rarityMeta[rarity];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-[var(--background-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
        meta.textClass,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClass)} />
      {rarity}
    </span>
  );
}
