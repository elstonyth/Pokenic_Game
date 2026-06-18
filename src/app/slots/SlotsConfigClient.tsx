// src/app/slots/SlotsConfigClient.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Info, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usd } from '@/lib/format';
import { type Pack, priceNumber } from '@/app/claw/packs-data';

type ConfigPack = Pack & { categoryName: string; icon: string };
const MAX_PACKS = 3;

export default function SlotsConfigClient({ packs }: { packs: ConfigPack[] }) {
  const router = useRouter();
  const [active, setActive] = useState<ConfigPack | null>(packs[0] ?? null);
  const [count, setCount] = useState(1);

  const priceNum = active ? priceNumber(active.price) : 0;
  const total = priceNum * count;
  const ev = useMemo(() => Math.round(priceNum * 0.96), [priceNum]);
  const setN = (n: number) => setCount(Math.min(MAX_PACKS, Math.max(1, n)));

  if (!active) {
    return (
      <div className="mx-auto w-full px-fluid py-10 text-center text-white/60">
        No slot machines available right now.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full px-fluid py-6">
      <h1 className="mb-4 font-heading text-2xl font-bold tracking-tight text-white">
        Slot Machines
      </h1>
      <div className="grid items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* Selected pack visual */}
        <div className="flex aspect-[36/25] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-800 to-neutral-950">
          <Image
            key={active.id}
            src={active.image}
            alt={active.name}
            width={240}
            height={420}
            className="h-[80%] w-auto object-contain drop-shadow-2xl"
          />
        </div>

        {/* Configurator */}
        <aside className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-neutral-950 p-5">
          <div>
            <h2 className="font-heading text-xl font-bold tracking-tight text-white">
              {active.name}
            </h2>
            <p className="text-[12px] text-white/45">{active.categoryName}</p>
          </div>

          {/* Pack tiles */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Machine
            </p>
            <div className="grid grid-cols-2 gap-2">
              {packs.map((p) => {
                const selected = p.id === active.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActive(p)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors',
                      selected
                        ? 'border-fuchsia-400/50 bg-white/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
                    )}
                  >
                    <Image
                      src={p.image}
                      alt=""
                      aria-hidden
                      width={205}
                      height={360}
                      className="h-10 w-auto object-contain"
                    />
                    <span className="text-[11px] font-medium leading-tight text-white">
                      {p.name.replace(' Pack', '')}
                    </span>
                    <span className="text-[11px] font-semibold text-white/55">
                      {p.price}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expected value */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/70">
              Expected Value{' '}
              <Info className="h-3.5 w-3.5 text-white/30" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-white">
              {usd(ev)}{' '}
              <span className="text-[11px] font-normal text-white/40">
                per pack
              </span>
            </span>
          </div>

          {/* Quantity 1–3 */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Packs to open (1–{MAX_PACKS})
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease packs"
                onClick={() => setN(count - 1)}
                disabled={count <= 1}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="flex h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium tabular-nums text-white">
                {count} {count === 1 ? 'pack' : 'packs'}
              </span>
              <button
                type="button"
                aria-label="Increase packs"
                onClick={() => setN(count + 1)}
                disabled={count >= MAX_PACKS}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Play */}
          <button
            type="button"
            onClick={() => router.push(`/slots/${active.id}?count=${count}`)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Play · {usd(total)}
          </button>
          <Link
            href="/claw"
            className="text-center text-[12px] text-white/40 hover:text-white/70"
          >
            or browse classic packs
          </Link>
        </aside>
      </div>
    </div>
  );
}
