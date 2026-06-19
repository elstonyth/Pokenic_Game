// src/app/slots/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findPack } from '@/app/claw/packs-data';
import { getPackBySlug, getRecentPulls } from '@/lib/data/packs';
import SlotMachineClient from './SlotMachineClient';

// Backend-driven (pack catalog + live recent pulls), so render per request and
// let each read degrade on its own — same seam as /claw/[slug].
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pack = findPack(slug);
  return {
    title: pack
      ? `${pack.name} — Slot Machine | Pokenic`
      : 'Slot Machine | Pokenic',
  };
}

export default async function SlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ count?: string }>;
}) {
  const { slug } = await params;
  const { count: countRaw } = await searchParams;
  const parsed = Number(countRaw);
  const count = Number.isInteger(parsed) ? Math.min(3, Math.max(1, parsed)) : 1;
  const [base, recentPulls] = await Promise.all([
    getPackBySlug(slug),
    getRecentPulls(),
  ]);
  if (!base) notFound();

  return (
    <SlotMachineClient
      pack={base.pack}
      recentPulls={recentPulls}
      count={count}
    />
  );
}
