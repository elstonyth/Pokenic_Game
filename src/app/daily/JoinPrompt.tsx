'use client';

import { openAuth } from '@/components/AuthButton';
import { Pill } from '@/components/ui/pill';

/** Logged-out CTA under the dormant calendar (auth modal, no /login page). */
export default function JoinPrompt({
  needsAuth,
  error,
}: {
  needsAuth: boolean;
  error: string;
}) {
  if (!needsAuth) {
    return <p className="mt-6 text-[13px] text-neutral-500">{error}</p>;
  }
  return (
    <Pill onClick={() => openAuth('signup')} size="lg" className="mt-8 w-full">
      Join to start your streak
    </Pill>
  );
}
