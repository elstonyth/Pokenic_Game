'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Crown,
  Gift,
  HandCoins,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { relativeTime } from '@/lib/format';
import { markRead } from '@/lib/actions/notifications';
import type { Notification } from '@/lib/actions/notifications';
import { cn } from '@/lib/utils';

// Per-template presentation. Icons stay monochrome (Signal Rule — chrome
// carries no color); unknown templates fall back to the bell.
const KINDS: Record<string, { title: string; Icon: LucideIcon }> = {
  vip_level_up: { title: 'You leveled up!', Icon: Crown },
  commission_matured: { title: 'Commission unlocked', Icon: HandCoins },
  reward_won: { title: 'You won a reward!', Icon: Gift },
  voucher_claimed: { title: 'Voucher redeemed', Icon: Ticket },
};

function kindOf(template: string) {
  return KINDS[template] ?? { title: template, Icon: Bell };
}

export default function NotificationsClient({
  initial,
  page = 1,
}: {
  initial: Notification[];
  page?: number;
}) {
  const [items, setItems] = useState<Notification[]>(initial);

  async function onRead(id: string) {
    // Optimistic update — mark read locally immediately
    setItems((xs) =>
      xs.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    const r = await markRead(id);
    if (!r.ok) {
      // Revert on server failure
      setItems((xs) =>
        xs.map((n) => (n.id === id ? { ...n, readAt: null } : n)),
      );
    }
  }

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
        <Bell className="mx-auto h-8 w-8 text-white/25" aria-hidden />
        {page > 1 ? (
          <>
            <p className="mt-3 text-sm font-semibold text-white">
              Nothing on this page.
            </p>
            <p className="mt-1 text-[13px] text-white/50">
              You&rsquo;ve reached the end of your notifications.
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-semibold text-white">
              No notifications yet.
            </p>
            <p className="mt-1 text-[13px] text-white/50">
              VIP level-ups, unlocked commissions, and reward wins land here.{' '}
              <Link
                href="/"
                className="font-semibold text-white underline underline-offset-2 hover:text-white/80"
              >
                Rip a pack
              </Link>{' '}
              to get things moving.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-2">
      {items.map((n) => {
        const { title, Icon } = kindOf(n.template);
        const unread = !n.readAt;
        const inner = (
          <>
            <span
              aria-hidden
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                unread ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40',
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-sm',
                  unread
                    ? 'font-semibold text-white'
                    : 'font-medium text-white/70',
                )}
              >
                {title}
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">
                {relativeTime(n.createdAt)}
              </p>
            </div>
            {unread && (
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-white"
              />
            )}
          </>
        );
        return (
          <li key={n.id}>
            {unread ? (
              <button
                type="button"
                onClick={() => void onRead(n.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/25 bg-white/[0.06] p-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                {inner}
                <span className="sr-only">, unread — mark as read</span>
              </button>
            ) : (
              <div className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
