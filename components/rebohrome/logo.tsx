import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

type RebohromeLogoProps = {
  className?: string;
  href?: string;
  iconClassName?: string;
  showText?: boolean;
  textClassName?: string;
};

export function RebohromeLogo({
  className,
  href = "/",
  iconClassName,
  showText = true,
  textClassName,
}: RebohromeLogoProps) {
  return (
    <Link className={cn("inline-flex items-center gap-3", className)} href={href}>
      <span className={cn("relative flex size-8 shrink-0 items-center justify-center", iconClassName)}>
        <Image
          alt="ReboHrome"
          className="h-full w-full object-contain"
          height={64}
          priority
          src="/uploads/rebohrome-veriff-logo-icon.png"
          width={64}
        />
      </span>
      {showText ? (
        <span className={cn("translate-y-[1px] text-sm font-semibold uppercase leading-none tracking-[0.14em] text-foreground", textClassName)}>
          ReboHrome
        </span>
      ) : null}
    </Link>
  );
}
