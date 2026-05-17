"use client";

import { useEffect, useState } from "react";
import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="theme-toggle-shell w-full max-w-[240px] rounded-full p-1" />
    );
  }

  const activeTheme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div className="theme-toggle-shell inline-flex w-full max-w-[240px] items-center gap-1 rounded-full p-1">
      {[
        {
          id: "light",
          icon: SunMedium,
          label: "Light",
        },
        {
          id: "dark",
          icon: MoonStar,
          label: "Dark",
        },
      ].map((option) => (
        <button
          key={option.id}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition",
            activeTheme === option.id
              ? "bg-[var(--foreground)] text-[var(--background)] shadow-[0_10px_26px_rgba(15,23,42,0.12)]"
              : "text-muted hover:bg-[var(--foreground-soft)] hover:text-[var(--foreground)]",
          )}
          onClick={() => setTheme(option.id)}
          type="button"
        >
          <option.icon className="size-4" />
          {option.label}
        </button>
      ))}
    </div>
  );
}
