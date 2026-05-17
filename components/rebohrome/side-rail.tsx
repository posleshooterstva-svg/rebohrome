import {
  CircleUserRound,
  Home,
  Layers3,
  LayoutGrid,
  Settings,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons = [Home, LayoutGrid, ShoppingBag, CircleUserRound, Layers3, Settings];

type SideRailProps = {
  activeIndex?: number;
};

export function SideRail({ activeIndex = 2 }: SideRailProps) {
  return (
    <div className="hidden w-11 shrink-0 items-center justify-start rounded-[22px] border-r border-line bg-panel/80 py-4 lg:flex">
      <div className="flex w-full flex-col items-center gap-4">
        {icons.map((Icon, index) => (
          <div
            key={index}
            className={cn(
              "flex size-7 items-center justify-center rounded-lg text-muted transition",
              index === activeIndex &&
                "bg-[var(--accent-soft)] text-[var(--accent)] dark:bg-[rgba(134,115,255,0.18)]",
            )}
          >
            <Icon className="size-3.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
