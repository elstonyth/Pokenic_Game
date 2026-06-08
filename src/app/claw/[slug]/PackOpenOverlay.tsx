"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, Zap, Volume2 } from "lucide-react";
import type { PackCard } from "../packs-data";

// Rarity → rgb (shared with the detail page rings) drives the glow + rarity pill.
const RARITY_RGB: Record<PackCard["rarity"], string> = {
  Legendary: "234, 179, 8",
  Epic: "217, 70, 239",
  Rare: "56, 189, 248",
  Uncommon: "52, 211, 153",
  Common: "163, 163, 163",
};

type Stage = "packs" | "slab" | "metadata" | "card";

// Full-screen pack-opening, matched to the live phygitals flow (see
// docs/research/components/pack-opening.spec.md): a 3D pack carousel → tap to
// open → a face-down graded slab → tap to reveal → the won card slab with its
// rarity + value. Tap-driven; reduced motion jumps straight to the card.
export default function PackOpenOverlay({
  card,
  isReal,
  packImage,
  packName,
  category,
  reduced,
  opening,
  onClose,
  onOpenAnother,
}: {
  card: PackCard;
  isReal: boolean;
  packImage: string;
  packName: string;
  category: string;
  reduced: boolean;
  opening: boolean;
  onClose: () => void;
  onOpenAnother: () => void;
}) {
  const [stage, setStage] = useState<Stage>(reduced ? "card" : "packs");
  const [shuffleKey, setShuffleKey] = useState(0);
  const rgb = RARITY_RGB[card.rarity];

  // The reveal's metadata holds briefly, then the card slab scales in.
  useEffect(() => {
    if (stage !== "metadata") return;
    const t = setTimeout(() => setStage("card"), 1500);
    return () => clearTimeout(t);
  }, [stage]);

  const advance = () => {
    if (stage === "packs") setStage("slab");
    else if (stage === "slab") setStage("metadata");
  };

  const tappable = stage === "packs" || stage === "slab";

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-black motion-safe:animate-[fadeIn_0.3s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={`Opening ${packName}`}
      onClick={() => tappable && advance()}
      style={tappable ? { cursor: "pointer" } : undefined}
    >
      {/* top bar */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>
      <div className="absolute right-4 top-4 z-10 flex gap-2 text-white/40">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5"><Zap className="h-4 w-4" aria-hidden /></span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5"><Volume2 className="h-4 w-4" aria-hidden /></span>
      </div>
      {stage !== "packs" && (
        <p className="absolute top-5 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-[0.3em] text-white/35">1 of 1</p>
      )}

      {/* ambient rarity glow (reveal stages) */}
      {(stage === "metadata" || stage === "card") && (
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, rgba(${rgb},0.4) 0%, rgba(${rgb},0) 70%)`, animation: reduced ? undefined : "auraPulse 2.6s ease-in-out infinite" }} />
      )}

      {/* STAGE 1 — 3D pack carousel */}
      {stage === "packs" && (
        <div className="flex flex-col items-center gap-10" key={shuffleKey}>
          <div className="relative flex h-72 items-center justify-center" style={{ perspective: "1200px" }}>
            {[-1, 1].map((side) => (
              <img
                key={side}
                src={packImage}
                alt=""
                aria-hidden
                className="absolute h-60 w-auto object-contain opacity-40 blur-[1px] drop-shadow-2xl motion-safe:animate-[fadeIn_0.5s_ease-out]"
                style={{ transform: `translateX(${side * 150}px) rotateY(${-side * 42}deg) scale(0.86)` }}
              />
            ))}
            <img
              src={packImage}
              alt={packName}
              className="relative z-[1] h-64 w-auto object-contain drop-shadow-[0_24px_40px_rgba(0,0,0,0.6)] motion-safe:animate-[packCharge_0.7s_cubic-bezier(0.2,0.7,0.2,1)_both]"
            />
            {/* floor reflection */}
            <img src={packImage} alt="" aria-hidden className="absolute top-[17rem] h-40 w-auto scale-y-[-1] object-contain opacity-15 blur-[2px]" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShuffleKey((k) => k + 1); }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10"
            >
              ⇄ Shuffle
            </button>
            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-white/35">Tap to select a pack to open</p>
          </div>
        </div>
      )}

      {/* STAGE 2 — face-down graded slab */}
      {stage === "slab" && (
        <div className="flex flex-col items-center gap-8 motion-safe:animate-[cardReveal_0.5s_cubic-bezier(0.2,0.8,0.2,1)_both]">
          <SlabBack />
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/45 motion-safe:animate-pulse">● Tap to reveal</p>
        </div>
      )}

      {/* STAGE 3a — metadata */}
      {stage === "metadata" && (
        <div className="flex flex-col items-center gap-5 text-center" onClick={(e) => e.stopPropagation()}>
          <Meta label="Category" value={category} delay={0} />
          <Meta label="Value" value={card.value} delay={140} />
          <div style={{ animation: "captionUp 0.45s ease-out 280ms both" }}>
            <RarityPill rarity={card.rarity} rgb={rgb} />
          </div>
        </div>
      )}

      {/* STAGE 3b — the won card */}
      {stage === "card" && (
        <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <div
            className="overflow-hidden rounded-2xl border-2 bg-neutral-900 p-2 motion-safe:animate-[cardReveal_0.6s_cubic-bezier(0.2,0.8,0.2,1)_both]"
            style={{ borderColor: `rgba(${rgb},0.85)`, boxShadow: `0 0 60px -6px rgba(${rgb},0.7)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.image} alt={card.name} className="h-[320px] w-[240px] rounded-lg object-contain sm:h-[380px] sm:w-[285px]" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center" style={{ animation: reduced ? undefined : "captionUp 0.45s ease-out 0.15s both" }}>
            <p className="font-heading max-w-md px-4 text-sm font-bold text-white sm:text-base">{card.name}</p>
            <div className="flex items-center gap-2">
              <RarityPill rarity={card.rarity} rgb={rgb} small />
              <span className="text-[13px] font-semibold text-white/70">Value: {card.value}{!isReal && " · demo"}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-7 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition-opacity hover:opacity-95">
                Continue
              </button>
              <button type="button" onClick={onOpenAnother} disabled={opening} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-60">
                {opening ? "Opening…" : "Open another"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div style={{ animation: `captionUp 0.45s ease-out ${delay}ms both` }}>
      <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/35">{label}</p>
      <p className="font-heading mt-1 text-2xl font-bold text-white sm:text-3xl">{value}</p>
    </div>
  );
}

function RarityPill({ rarity, rgb, small }: { rarity: PackCard["rarity"]; rgb: string; small?: boolean }) {
  return (
    <span
      className={small ? "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" : "rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest"}
      style={{ background: `rgba(${rgb},0.18)`, color: `rgb(${rgb})`, border: `1px solid rgba(${rgb},0.5)` } as CSSProperties}
    >
      {rarity}
    </span>
  );
}

// Stylized face-down graded slab back (pokenic-branded), evoking the live slab.
function SlabBack() {
  return (
    <div className="relative h-[380px] w-[280px] rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)]">
      <div className="absolute inset-x-3 top-3 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
        <span className="font-heading text-sm font-bold tracking-tight text-white/80">pokenic</span>
        <span className="grid h-7 w-7 grid-cols-3 grid-rows-3 gap-px overflow-hidden rounded-sm bg-white/10 p-0.5" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className={i % 2 === 0 ? "bg-white/55" : "bg-transparent"} />
          ))}
        </span>
      </div>
      <div className="absolute inset-x-5 bottom-12 top-16 rounded-xl border border-white/10 bg-black/40">
        <div className="flex h-full items-center justify-center">
          <span className="font-heading text-5xl font-black text-white/15">P</span>
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-4 text-center text-[8px] uppercase tracking-[0.3em] text-white/25">Phygital Certification</p>
    </div>
  );
}
