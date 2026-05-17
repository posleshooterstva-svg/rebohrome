import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <p className="text-xs uppercase tracking-[0.28em] text-muted">{eyebrow}</p>
      <h2 className="mt-3 display-font text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-sm leading-7 text-muted sm:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
