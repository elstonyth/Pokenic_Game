import type { Metadata } from 'next';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { pillVariants } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Task',
  description: 'The Weekly Pulled Value Challenge on Polycards.',
};

// Placeholder until sub-project D ships the full Weekly Pulled Value Challenge
// (community pool + milestone stages + top-10 payout). Public, like the board.
export default function TaskPage() {
  return (
    <div className="px-fluid mx-auto w-full max-w-md py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900">
        <Trophy className="text-chase h-7 w-7" aria-hidden />
      </span>
      <h1 className="font-heading mt-4 text-3xl text-white">
        WEEKLY CHALLENGE
      </h1>
      <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-neutral-400">
        The Weekly Pulled Value Challenge is launching soon. Check back for
        community rewards, milestones, and weekly rankings.
      </p>
      <Link
        href="/leaderboard"
        className={cn(pillVariants({ size: 'md' }), 'mt-6')}
      >
        View the leaderboard
      </Link>
    </div>
  );
}
