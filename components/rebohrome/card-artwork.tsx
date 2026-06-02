"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { type ProductRecord } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type CardArtworkProps = {
  card: Pick<ProductRecord, "title" | "shape" | "palette"> & {
    imageUrl?: string | null;
  };
  className?: string;
  compact?: boolean;
};

export function CardArtwork({
  card,
  className,
  compact = false,
}: CardArtworkProps) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const ringSize = compact ? "size-[32%]" : "size-[36%]";
  const topOffset = compact ? "top-[31%]" : "top-[29%]";
  const bottomFade = compact ? "h-16" : "h-24";
  const imageIsUploadedAsset = card.imageUrl?.startsWith("/uploads/") ?? false;
  const imageIsRemoteAsset = /^https?:\/\//.test(card.imageUrl ?? "");
<<<<<<< HEAD
  const hasArtwork = Boolean(card.imageUrl && !imageUnavailable);
  const artworkUrl = hasArtwork ? String(card.imageUrl) : "";
=======
  const hasArtwork = Boolean(card.imageUrl) && !imageUnavailable;
>>>>>>> ca331b6f50b5ce7ed10de1480fb23607ef4957ff

  useEffect(() => {
    setImageUnavailable(false);
  }, [card.imageUrl]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[12px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#f2f4f8_100%)]",
        className,
      )}
    >
      {hasArtwork ? (
        <Image
          alt={card.title}
          className="absolute inset-0 z-0 h-full w-full object-cover"
          fill
          onError={() => setImageUnavailable(true)}
          sizes={compact ? "160px" : "320px"}
<<<<<<< HEAD
          src={artworkUrl}
          unoptimized={imageIsUploadedAsset || imageIsRemoteAsset}
        />
      ) : null}
      {hasArtwork ? (
        <>
          <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.42),transparent_30%)]" />
          <div className="absolute inset-x-0 bottom-0 z-10 h-16 bg-[linear-gradient(180deg,transparent,rgba(248,250,252,0.18))]" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),transparent_44%)] opacity-95" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.7),transparent_24%),radial-gradient(circle_at_50%_58%,rgba(178,188,212,0.2),transparent_28%)]" />
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 rounded-full border border-[rgba(255,255,255,0.82)]",
              ringSize,
              topOffset,
            )}
            style={{
              background: `radial-gradient(circle at 50% 35%, ${card.palette.glowSoft}, ${card.palette.core} 42%, transparent 68%)`,
              boxShadow: `0 0 36px ${card.palette.glow}`,
            }}
          />
          <div
            className="absolute left-1/2 top-[8%] h-[64%] w-[7px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(215,223,255,0.36),transparent)] blur-[1px]"
          />
          {card.shape === "crescent" ? (
            <div className="absolute left-1/2 top-[28%] h-[42%] w-[24%] -translate-x-1/2 rounded-full border-[10px] border-[rgba(220,224,236,0.88)] border-r-transparent border-t-transparent opacity-80" />
          ) : null}
          {card.shape === "halo" ? (
            <>
              <div className="absolute left-1/2 top-[26%] h-[44%] w-[44%] -translate-x-1/2 rounded-full border border-[rgba(214,219,234,0.9)]" />
              <div className="absolute left-1/2 top-[20%] h-[56%] w-[56%] -translate-x-1/2 rounded-full border border-[rgba(222,226,238,0.56)]" />
            </>
          ) : null}
          {card.shape === "shard" ? (
            <div
              className="absolute left-1/2 top-[28%] h-[34%] w-[26%] -translate-x-1/2 rotate-[24deg] rounded-[36%_64%_54%_46%/43%_49%_51%_57%] border border-white/60"
              style={{
                background: `linear-gradient(140deg, ${card.palette.glowSoft}, ${card.palette.core} 40%, transparent 100%)`,
                boxShadow: `0 0 28px ${card.palette.glow}`,
              }}
            />
          ) : null}
          {card.shape === "spire" ? (
            <>
              <div className="absolute left-1/2 top-[18%] h-[44%] w-[12px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(224,232,255,0.1))]" />
              <div className="absolute left-[30%] top-[24%] h-[38%] w-[2px] -rotate-[20deg] rounded-full bg-white/55" />
              <div className="absolute right-[30%] top-[24%] h-[38%] w-[2px] rotate-[20deg] rounded-full bg-white/55" />
            </>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(233,237,245,0.92))]" />
          <div
            className={cn(
              "absolute inset-x-5 bottom-0 bg-[radial-gradient(circle_at_center,rgba(199,208,226,0.44),transparent_70%)] blur-2xl",
              bottomFade,
            )}
          />
        </>
      )}
      <div className="absolute inset-0 z-20 opacity-25 [background-image:radial-gradient(circle_at_20%_16%,rgba(167,177,201,0.2)_0,rgba(167,177,201,0.2)_1px,transparent_1px)] [background-size:22px_22px]" />
=======
          src={card.imageUrl as string}
          unoptimized={imageIsUploadedAsset || imageIsRemoteAsset}
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),transparent_44%)] opacity-95" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.7),transparent_24%),radial-gradient(circle_at_50%_58%,rgba(178,188,212,0.2),transparent_28%)]" />
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 rounded-full border border-[rgba(255,255,255,0.82)]",
              ringSize,
              topOffset,
            )}
            style={{
              background: `radial-gradient(circle at 50% 35%, ${card.palette.glowSoft}, ${card.palette.core} 42%, transparent 68%)`,
              boxShadow: `0 0 36px ${card.palette.glow}`,
            }}
          />
          <div className="absolute left-1/2 top-[8%] h-[64%] w-[7px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(215,223,255,0.36),transparent)] blur-[1px]" />
          {card.shape === "crescent" ? (
            <div className="absolute left-1/2 top-[28%] h-[42%] w-[24%] -translate-x-1/2 rounded-full border-[10px] border-[rgba(220,224,236,0.88)] border-r-transparent border-t-transparent opacity-80" />
          ) : null}
          {card.shape === "halo" ? (
            <>
              <div className="absolute left-1/2 top-[26%] h-[44%] w-[44%] -translate-x-1/2 rounded-full border border-[rgba(214,219,234,0.9)]" />
              <div className="absolute left-1/2 top-[20%] h-[56%] w-[56%] -translate-x-1/2 rounded-full border border-[rgba(222,226,238,0.56)]" />
            </>
          ) : null}
          {card.shape === "shard" ? (
            <div
              className="absolute left-1/2 top-[28%] h-[34%] w-[26%] -translate-x-1/2 rotate-[24deg] rounded-[36%_64%_54%_46%/43%_49%_51%_57%] border border-white/60"
              style={{
                background: `linear-gradient(140deg, ${card.palette.glowSoft}, ${card.palette.core} 40%, transparent 100%)`,
                boxShadow: `0 0 28px ${card.palette.glow}`,
              }}
            />
          ) : null}
          {card.shape === "spire" ? (
            <>
              <div className="absolute left-1/2 top-[18%] h-[44%] w-[12px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(224,232,255,0.1))]" />
              <div className="absolute left-[30%] top-[24%] h-[38%] w-[2px] -rotate-[20deg] rounded-full bg-white/55" />
              <div className="absolute right-[30%] top-[24%] h-[38%] w-[2px] rotate-[20deg] rounded-full bg-white/55" />
            </>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(233,237,245,0.92))]" />
          <div
            className={cn(
              "absolute inset-x-5 bottom-0 bg-[radial-gradient(circle_at_center,rgba(199,208,226,0.44),transparent_70%)] blur-2xl",
              bottomFade,
            )}
          />
          <div className="absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_20%_16%,rgba(167,177,201,0.2)_0,rgba(167,177,201,0.2)_1px,transparent_1px)] [background-size:22px_22px]" />
        </>
      )}
>>>>>>> ca331b6f50b5ce7ed10de1480fb23607ef4957ff
      <span className="sr-only">{card.title}</span>
    </div>
  );
}
