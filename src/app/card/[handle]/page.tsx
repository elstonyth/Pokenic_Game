import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCard } from '@/lib/data/cards';
import { CardDetailHydrated } from './CardDetailHydrated';

// Price freshness is the whole point — always render on demand (the 60s
// client refresh takes over after hydration).
export const dynamic = 'force-dynamic';

// Dedupe the lookup across generateMetadata + the page render (one request).
const resolveCard = cache((handle: string) =>
  getCard(decodeURIComponent(handle)),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const card = await resolveCard(handle);
  if (!card) return { title: 'Card not found' };
  return {
    title: card.name,
    description: `${card.set} · ${card.grader} ${card.grade}`,
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const card = await resolveCard(handle);
  if (!card) notFound();
  return (
    <div className="mx-auto w-full px-fluid py-6">
      <Link
        href="/slots"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/55 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All packs
      </Link>
      <CardDetailHydrated initial={card} />
    </div>
  );
}
