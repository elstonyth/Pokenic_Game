// src/app/slots/page.tsx
import type { Metadata } from 'next';
import { getPackCategories } from '@/lib/data/packs';
import SlotsConfigClient from './SlotsConfigClient';

export const metadata: Metadata = { title: 'Slot Machines | Pokenic' };
export const dynamic = 'force-dynamic';

export default async function SlotsPage() {
  // Same catalog seam as /claw (degrades to the static mock when backend is down).
  const categories = await getPackCategories();
  const packs = categories.flatMap((c) =>
    c.packs.map((p) => ({ ...p, categoryName: c.tab, icon: c.icon })),
  );
  return <SlotsConfigClient packs={packs} />;
}
