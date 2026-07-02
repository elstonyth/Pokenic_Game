import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarCheck, Gift } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Daily Rewards',
  description: 'Claim a free reward every day you check in on Pokenic.',
};

// Honest placeholder until the daily-claim backend ships (redesign Phase 5):
// the 7-day calendar is the real layout, rendered dormant. No fake claiming.
const DAYS = [1, 2, 3, 4, 5, 6, 7];

export default function DailyPage() {
  return (
    <div className="mx-auto w-full max-w-md px-fluid py-10 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900">
        <CalendarCheck className="h-7 w-7 text-neutral-400" aria-hidden />
      </span>
      <h1 className="font-heading mt-4 text-3xl text-white">DAILY REWARDS</h1>
      <p className="mx-auto mt-2 max-w-[36ch] text-sm leading-relaxed text-neutral-400">
        Check in every day to build a streak and claim free credits. Launching
        soon.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-2" aria-hidden>
        {DAYS.map((day) => (
          <div
            key={day}
            className={`rounded-2xl border border-white/10 bg-neutral-900 p-4 ${
              day === 7 ? 'col-span-3' : ''
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Day {day}
            </p>
            <Gift className="mx-auto mt-2 h-6 w-6 text-neutral-700" />
          </div>
        ))}
      </div>

      <Link
        href="/"
        className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-full bg-neutral-50 text-sm font-semibold text-neutral-950 transition-transform active:scale-[0.98]"
      >
        Rip a pack meanwhile
      </Link>
    </div>
  );
}
