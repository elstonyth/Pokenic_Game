"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import Reveal from "@/components/Reveal";
import {
  Filter,
  X,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Heart,
  LayoutGrid,
  Store,
  Layers,
  Asterisk,
  Star,
  DollarSign,
  BarChart3,
  Flame,
  Diamond,
  BookMarked,
  Award,
  Medal,
  Calendar,
  Languages,
  Trash2,
  type LucideIcon,
} from "lucide-react";

// Reuse the live phygitals CDN card-image helper (matches RecentPullsSection.tsx).
// Resolves to a localized webp under public/cdn/cards/<id>.webp.
const cardImg = (id: string) => `/cdn/cards/${id.replace(/[^\w.-]/g, "_")}.webp`;

// Real card-image IDs extracted from the live site (the 8 "Recent Pulls" slabs).
// We repeat across the 16 marketplace listings so every image resolves locally.
const IMG = {
  celebi: "FQEYWuGiKTkJpZSG6XqGHDBmH6EmxctEqk1kAT2MYzHc",
  mewtwo: "9kRLkdbbvzm335GBvraQrWrNVs72gzEzynvP1RPvftTx",
  darkrai: "4h13RDtFX4MWNYjvgMPeBS1hcL4AewupiFzDvyFUUTkd",
  jolteon: "BEnddEeBXBHyL5qWXCg6sKS5VmUbUtZaKJ1aVB8yCWHN",
  rapidash: "FFbo5jfXHHQWN8bmc88UDYSDP5QzYCCj6RwUkiWYyffC",
  hooh: "FjAJZ7en585MpnoLUGbuALHEmbBAPd61EZCefQzFMmRX",
  gengar: "6noxMybjBLtLqicAUTrG63VhWG2FgWzDBsQGnnZEyNCG",
} as const;

interface MarketplaceCard {
  id: string;
  title: string;
  price: number;
  fmv: number;
  points: number;
  image: string;
}

// 16 listings. First 8 reuse the real "Recent Pulls" titles + their own images;
// the next 8 use the real marketplace listing titles/prices from the brief and
// recycle the same card-image IDs so every slab renders.
const CARDS: MarketplaceCard[] = [
  {
    id: "celebi",
    title:
      "2021 Pokemon Japanese Sword & Shield Jet-Black Spirit Celebi V #3 CGC 10 GEM MINT",
    price: 18.4,
    fmv: 19.2,
    points: 93,
    image: cardImg(IMG.celebi),
  },
  {
    id: "mewtwo",
    title:
      "2025 Pokemon Japanese SV Glory Of Rocket Gang Holo Team Rockets Mewtwo ex CGC 10",
    price: 24.75,
    fmv: 23.9,
    points: 100,
    image: cardImg(IMG.mewtwo),
  },
  {
    id: "darkrai-gg",
    title:
      "2023 Pokemon Sword and Shield Crown Zenith Galarian Gallery Darkrai Vstar #GG50 PSA 10",
    price: 41.2,
    fmv: 39.8,
    points: 100,
    image: cardImg(IMG.darkrai),
  },
  {
    id: "jolteon",
    title:
      "2024 Pokemon Japanese Scarlet & Violet Terastal Fest ex Holo Jolteon ex #52 CGC 10 PRISTINE",
    price: 15.6,
    fmv: 16.1,
    points: 96,
    image: cardImg(IMG.jolteon),
  },
  {
    id: "shaymin",
    title:
      "2022 Pokemon Japanese Sword & Shield Star Birth Holo Shaymin VSTAR #13 CGC 9.5 MINT+",
    price: 12.9,
    fmv: 13.4,
    points: 95,
    image: cardImg(IMG.celebi),
  },
  {
    id: "rapidash",
    title:
      "2025 Pokemon Japanese Mega Start Deck 100 Battle Collection Reverse Holo Rapidash #90 CGC 10",
    price: 8.45,
    fmv: 8.9,
    points: 92,
    image: cardImg(IMG.rapidash),
  },
  {
    id: "hooh",
    title:
      "2022 Pokemon Japanese Sword & Shield Incandescent Arcana Ho-Oh V #55 CGC 10 GEM MINT",
    price: 21.3,
    fmv: 20.5,
    points: 98,
    image: cardImg(IMG.hooh),
  },
  {
    id: "gengar",
    title:
      "2023 Pokemon Japanese Scarlet & Violet 151 Holo Gengar #94 CGC 10 GEM MINT",
    price: 29.99,
    fmv: 31.2,
    points: 100,
    image: cardImg(IMG.gengar),
  },
  {
    id: "espathra",
    title:
      "2023 Pokemon Scarlet & Violet Paradox Rift Reverse Holo Espathra #081 CGC 8.5 NM-MT+",
    price: 9.59,
    fmv: 9.96,
    points: 90,
    image: cardImg(IMG.gengar),
  },
  {
    id: "mimikyu",
    title:
      "2021 Pokemon Japanese SWSH VMAX Climax Mimikyu VMAX #77 CGC 8.5 NM-MT+",
    price: 9.33,
    fmv: 9.96,
    points: 92,
    image: cardImg(IMG.celebi),
  },
  {
    id: "lycanroc",
    title:
      "2016 Pokemon Japanese Sun & Moon Rockruff Full Power Deck Holo Lycanroc GX #9 CGC 5.5",
    price: 7.8,
    fmv: 8.4,
    points: 92,
    image: cardImg(IMG.rapidash),
  },
  {
    id: "garchomp",
    title:
      "2025 Pokemon Japanese Mega Dream ex Holo Cynthia's Garchomp ex #90 CGC 8.5 NM-MT+",
    price: 9.1,
    fmv: 9.5,
    points: 92,
    image: cardImg(IMG.mewtwo),
  },
  {
    id: "ribombee",
    title:
      "2025 Pokemon Scarlet & Violet Journey Together Holo Lillie's Ribombee #67 CGC 9.5 MINT",
    price: 11.2,
    fmv: 10.8,
    points: 97,
    image: cardImg(IMG.jolteon),
  },
  {
    id: "obstagoon",
    title:
      "2023 Pokemon Sword & Shield Fusion Strike K.O. Collection Galarian Obstagoon #161 CGC 9",
    price: 12.0,
    fmv: 11.5,
    points: 100,
    image: cardImg(IMG.hooh),
  },
  {
    id: "darkrai-tot",
    title:
      "2024 Pokemon Scarlet & Violet Obsidian Flames Trick Or Trade Holo Darkrai #136 CGC 9.5",
    price: 13.4,
    fmv: 12.9,
    points: 100,
    image: cardImg(IMG.darkrai),
  },
  {
    id: "dustox",
    title: "2025 Pokemon Japanese Mega Dream ex AR Dustox #195 CGC 9 MINT",
    price: 10.2,
    fmv: 9.25,
    points: 100,
    image: cardImg(IMG.celebi),
  },
];

// Category tabs match the live marketplace (icons localized to public/pack-index-icons/).
const CATEGORIES = [
  { name: "Pokémon", icon: "/pack-index-icons/pokemon.webp" },
  { name: "One Piece", icon: "/pack-index-icons/onepiece.webp" },
  { name: "Basketball", icon: "/pack-index-icons/nba.webp" },
  { name: "Football", icon: "/pack-index-icons/nfl.webp" },
  { name: "Baseball", icon: "/pack-index-icons/mlb.webp" },
  { name: "Soccer", icon: "/pack-index-icons/soccer.webp" },
  { name: "Yu-Gi-Oh!", icon: "/pack-index-icons/yugioh.webp" },
  { name: "Riftbound", icon: "/pack-index-icons/riftbound.webp" },
  { name: "Dragon Ball", icon: "/pack-index-icons/dragonball.webp" },
  { name: "Fwog", icon: "/pack-index-icons/fwog.jpg" },
  { name: "NEUKO", icon: "/pack-index-icons/neuko.jpg" },
  { name: "Vibes", icon: "/pack-index-icons/vibes.webp" },
  { name: "Moonbirds", icon: "/pack-index-icons/moonbirds.png" },
] as const;

type FilterGroup = { label: string; icon: LucideIcon; count?: number };
const FILTER_GROUPS: FilterGroup[] = [
  { label: "Platform", icon: Layers, count: 1 },
  { label: "Category", icon: Asterisk, count: 1 },
  { label: "Grade Type", icon: Star, count: 1 },
  { label: "Price Range", icon: DollarSign },
  { label: "FMV Range", icon: BarChart3 },
  { label: "Card Type", icon: Flame },
  { label: "Rarity", icon: Diamond },
  { label: "Set", icon: BookMarked },
  { label: "Grader", icon: Award },
  { label: "Grade", icon: Medal },
  { label: "Year", icon: Calendar },
  { label: "Language", icon: Languages },
];

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function FilterSidebar({
  open,
  onClose,
  buyNow,
  onBuyNow,
}: {
  open: boolean;
  onClose: () => void;
  buyNow: boolean;
  onBuyNow: (v: boolean) => void;
}) {
  // Presentational collapse state — visual only, no real filtering.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggle = (label: string) =>
    setOpenGroups((s) => ({ ...s, [label]: !s[label] }));

  return (
    // Left drawer on ALL breakpoints (opened by the toolbar "Filters" button) — the
    // live marketplace has no persistent sidebar at desktop widths, just a Filters panel.
    <aside className={cn("fixed inset-0 z-40", open ? "block" : "hidden")}>
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div className="absolute left-0 top-0 flex h-full w-[min(20rem,90vw)] flex-col overflow-y-auto border-r border-white/10 bg-neutral-900 p-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-1 pb-3">
          <div className="flex items-center gap-2 text-white">
            <Filter className="h-4 w-4" aria-hidden />
            <span className="font-heading text-sm font-bold tracking-tight">Filters</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Buy Now / All segmented control */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => onBuyNow(true)}
            className={cn(
              "rounded-lg py-1.5 text-xs font-semibold transition-colors",
              buyNow ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70",
            )}
          >
            Buy Now
          </button>
          <button
            type="button"
            onClick={() => onBuyNow(false)}
            className={cn(
              "rounded-lg py-1.5 text-xs font-semibold transition-colors",
              !buyNow ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70",
            )}
          >
            All
          </button>
        </div>

        {/* Marketplace selector row (top of list, no count) */}
        <div className="mt-3 flex flex-col gap-1">
          <button
            type="button"
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            <span className="flex items-center gap-2.5">
              <Store className="h-4 w-4 text-white/55" aria-hidden />
              <span className="text-[13px] font-medium text-white">Marketplace</span>
            </span>
            <ChevronDown className="h-4 w-4 text-white/40" aria-hidden />
          </button>

          {/* Collapsible filter groups (presentational) */}
          {FILTER_GROUPS.map(({ label, icon: Icon, count }) => {
            const isOpen = openGroups[label] ?? false;
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggle(label)}
                aria-expanded={isOpen}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-white/55" aria-hidden />
                  <span className="text-[13px] font-medium text-white">{label}</span>
                </span>
                <span className="flex items-center gap-2">
                  {count !== undefined && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-white/15 bg-white/10 px-1.5 text-[10px] font-semibold text-white/80">
                      {count}
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-white/40 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* Clear all */}
        <button
          type="button"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-[13px] font-semibold text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Clear All Filters
        </button>
      </div>
    </aside>
  );
}

function MarketCard({ card }: { card: MarketplaceCard }) {
  return (
    <article
      className={cn(
        "group/card h-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-800",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:border-white/20 hover:shadow-xl hover:shadow-black/40",
      )}
    >
      {/* Image area on a dark radial pedestal */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[radial-gradient(120%_80%_at_50%_15%,#2e2e2e_0%,#1c1c1c_55%,#141414_100%)]">
        {/* +pts badge, top-left */}
        <span className="absolute left-2 top-2 z-10 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
          +{card.points}pts
        </span>
        {/* heart, top-right */}
        <button
          type="button"
          aria-label="Add to watchlist"
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/55 backdrop-blur-sm transition-colors hover:text-white"
        >
          <Heart className="h-3.5 w-3.5" aria-hidden />
        </button>
        <Link href={`/card/${card.id}`} className="block h-full w-full" aria-label={card.title}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.image}
            alt={card.title}
            loading="lazy"
            className="h-full w-full object-contain p-3 transition-transform duration-300 ease-out group-hover/card:scale-[1.04]"
          />
        </Link>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 p-3">
        <Link href={`/card/${card.id}`} className="line-clamp-2 min-h-[32px] text-[12px] font-medium leading-4 text-white hover:text-white/80">
          {card.title}
        </Link>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-white">${fmt(card.price)}</span>
          <span className="text-[11px] font-medium text-white/45">
            FMV ${fmt(card.fmv)}
          </span>
        </div>
      </div>
    </article>
  );
}

export default function MarketplaceClient() {
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].name);
  const [buyNow, setBuyNow] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="mx-auto w-full px-fluid py-4">
      <div className="flex gap-6">
        {/* LEFT sidebar */}
        <FilterSidebar
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          buyNow={buyNow}
          onBuyNow={setBuyNow}
        />

        {/* RIGHT main content */}
        <div className="min-w-0 flex-1">
          {/* Category tab row — underline tabs (matches live: in the main column,
              grey inactive, white text + 2px white underline when active). */}
          <div className="mb-4 flex gap-0 overflow-x-auto border-b border-white/10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((cat) => {
              const active = cat.name === activeCategory;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(cat.name)}
                  className={cn(
                    "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-white text-white"
                      : "border-transparent text-neutral-400 hover:text-white",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cat.icon}
                    alt=""
                    aria-hidden
                    width={20}
                    height={20}
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* Toolbar — matches live: Filters button, search, view toggle + sort */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* Filters button (left) — opens the sidebar drawer on mobile */}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.08]"
            >
              <Filter className="h-4 w-4" aria-hidden />
              Filters
            </button>

            {/* Search (center) */}
            <div className="relative min-w-[200px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search cards..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-[13px] text-white placeholder:text-white/40 focus:border-white/25 focus:outline-none"
              />
            </div>

            {/* View toggle (presentational) */}
            <button
              type="button"
              aria-label="Toggle view"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </button>

            {/* Sort (presentational) */}
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.08]"
            >
              <ChevronsUpDown className="h-3.5 w-3.5 text-white/55" aria-hidden />
              <span className="text-white/55">Price:</span> Low to High
            </button>
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {CARDS.map((card, i) => (
              <Reveal key={card.id} delay={Math.min(i, 11) * 45} className="h-full">
                <MarketCard card={card} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
