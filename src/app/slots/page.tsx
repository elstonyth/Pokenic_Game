import type { Metadata } from 'next';
import { getPackCategories } from '@/lib/data/packs';
import type { Pack } from '@/app/claw/packs-data';
import SlotsConfigClient from './SlotsConfigClient';

export const metadata: Metadata = {
  title: 'Slot Machine | Pokenic',
  description: 'Pick a pack, choose how many to open, and spin the reels.',
};

// Packs are read live from the Store API per request (reflects live inventory),
// same seam as /claw — degrade to the mock catalog inside the loader on failure.
export const dynamic = 'force-dynamic';

export default async function SlotsPage() {
  const categories = await getPackCategories();
  const packs: Pack[] = categories.flatMap((c) => c.packs);
  return <SlotsConfigClient packs={packs} />;
}
