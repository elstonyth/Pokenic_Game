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
    return (
      <p
        role="alert"
        className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-300"
      >
        {error}
      </p>
    );
  }
  return (
    <Pill onClick={() => openAuth('signup')} size="lg" className="mt-8 w-full">
      Join to start your streak
    </Pill>
  );
}
