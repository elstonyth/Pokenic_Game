'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { getUnreadCount } from '@/lib/actions/notifications';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let live = true;
    const refresh = () =>
      getUnreadCount()
        .then((n) => {
          if (live) setCount(n);
        })
        .catch(() => {
          if (live) setCount(0);
        });
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
    };
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
    >
      <Bell className="h-5 w-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-50 px-1 text-[10px] font-bold text-neutral-950">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
