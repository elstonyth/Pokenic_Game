import type { Metadata } from 'next';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { pillVariants } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Task',
  description: 'Daily and weekly tasks on Polycards.',
  // Out of the sitemap and out of the index while it's a placeholder — the tab
  // bar still links here, so intent has to be enforced, not just implied.
  robots: { index: false, follow: true },
};

// Placeholder. The Weekly Pulled Value Challenge moved to the Ranks tab
// (/leaderboard) — it settles on that board, so it lives with it. The Task tab
// is held for the daily/weekly task list that replaces it.
export default function TaskPage() {
  return (
    <div className="px-fluid mx-auto w-full max-w-md py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900">
        <ListChecks className="text-chase h-7 w-7" aria-hidden />
      </span>
      <h1 className="font-heading mt-4 text-3xl text-white">TASKS</h1>
      <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-neutral-400">
        Daily and weekly tasks are coming soon. The Weekly Pulled Value
        Challenge now lives on the Ranks tab, right above the standings it
        settles on.
      </p>
      <Link
        href="/leaderboard"
        className={cn(pillVariants({ size: 'md' }), 'mt-6')}
      >
        Go to Ranks
      </Link>
    </div>
  );
}
