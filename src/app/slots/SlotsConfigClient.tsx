'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import QtyStepper from '@/components/QtyStepper';
import { cn } from '@/lib/utils';
import type { Pack } from '@/app/claw/packs-data';

function PackTile({ pack }: { pack: Pack }) {
  const [qty, setQty] = useState(1);
  const soldOut = pack.inStock === false;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4',
        soldOut && 'opacity-50',
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-800">
        <Image
          src={pack.image}
          alt={pack.name}
          fill
          sizes="(max-width: 768px) 50vw, 240px"
          className="object-contain"
        />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-bold text-neutral-50">
          {pack.name}
        </h3>
        <span className="text-sm tabular-nums text-neutral-300">
          {pack.price}
        </span>
      </div>
      <QtyStepper qty={qty} onChange={setQty} max={3} />
      {soldOut ? (
        <span className="rounded-xl bg-white/5 py-2 text-center text-xs font-bold uppercase tracking-wide text-neutral-500">
          Sold out
        </span>
      ) : (
        <Link
          href={`/slots/${pack.id}?count=${qty}`}
          className="rounded-xl bg-neutral-50 py-2 text-center text-sm font-bold text-neutral-900 transition-colors hover:bg-white"
        >
          Play
        </Link>
      )}
    </div>
  );
}

export function SlotsConfigClient({ packs }: { packs: Pack[] }) {
  return (
    <main className="px-fluid py-10">
      <h1 className="font-heading text-3xl font-black text-neutral-50">
        Slot Machine
      </h1>
      <p className="mt-2 text-neutral-400">
        Pick a pack and how many to open (1–3), then spin.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {packs.map((pack) => (
          <PackTile key={pack.id} pack={pack} />
        ))}
      </div>
    </main>
  );
}
