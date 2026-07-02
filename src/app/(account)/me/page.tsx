import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Bell,
  ChevronRight,
  Crown,
  Gift,
  Landmark,
  Package,
  Receipt,
  Settings,
  Sparkles,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { getCustomer } from '@/lib/data/customer';
import { getOwnProfileHandle } from '@/lib/data/profiles';
import { getWallet } from '@/lib/actions/wallet';
import { rm } from '@/lib/format';
import { LogoutButton, TopUpButton } from './MeActions';

export const metadata: Metadata = {
  title: 'Me',
  description: 'Your Pokenic profile, wallet, rewards, and settings.',
};

// Quick-access grid (showgo's Me pattern): everything that used to live in the
// account sidebar, minus Vault/Wallet which have their own surfaces now.
const QUICK_ACCESS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'VIP', href: '/vip', icon: Crown },
  { label: 'Rewards', href: '/rewards', icon: Sparkles },
  { label: 'Orders', href: '/orders', icon: Package },
  { label: 'History', href: '/transactions', icon: Receipt },
  { label: 'Referrals', href: '/referrals', icon: Gift },
  { label: 'Vouchers', href: '/vouchers', icon: Ticket },
  { label: 'Withdraw', href: '/bank-withdrawal', icon: Landmark },
  { label: 'Inbox', href: '/notifications', icon: Bell },
];

const ABOUT_LINKS: { label: string; href: string }[] = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Fairness', href: '/fairness' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Activity', href: '/activity' },
  { label: 'Settings', href: '/settings' },
];

export default async function MePage() {
  // Layout guard guarantees a customer here.
  const customer = (await getCustomer())!;
  const [walletResult, handle] = await Promise.all([
    getWallet(),
    getOwnProfileHandle(),
  ]);

  const displayName =
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    handle ||
    customer.email;
  const initial = (displayName[0] ?? '?').toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      {/* Profile header */}
      <section className="flex items-center gap-4">
        <div
          aria-hidden
          className="font-heading flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-2xl text-neutral-50"
        >
          {initial}
        </div>
        <div className="min-w-0">
          <h1 className="font-heading truncate text-2xl text-white">
            {displayName}
          </h1>
          <p className="mt-0.5 truncate text-[13px] text-neutral-400">
            {handle ? `@${handle} · ` : ''}
            {customer.email}
          </p>
        </div>
      </section>

      {/* Wallet card */}
      <section className="rounded-2xl border border-white/10 bg-neutral-900 p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          Wallet
        </p>
        {walletResult.ok ? (
          <>
            <p className="font-heading mt-1 text-3xl text-white">
              {rm(walletResult.wallet.balance)}
            </p>
            {walletResult.wallet.locked > 0 && (
              <p className="mt-1 text-[13px] text-neutral-400">
                {rm(walletResult.wallet.available)} available ·{' '}
                {rm(walletResult.wallet.locked)} locked
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <TopUpButton />
              <Link
                href="/bank-withdrawal"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
              >
                Withdraw
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-neutral-400">
            Couldn’t load your balance.{' '}
            <Link href="/wallet" className="font-semibold text-white underline">
              Open wallet
            </Link>
          </p>
        )}
      </section>

      {/* Quick access grid */}
      <section className="rounded-2xl border border-white/10 bg-neutral-900 p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          Quick access
        </p>
        <div className="mt-4 grid grid-cols-4 gap-y-5">
          {QUICK_ACCESS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-1.5 text-neutral-300 transition-colors hover:text-white"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-800">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-[11px] font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* About & help */}
      <section className="rounded-2xl border border-white/10 bg-neutral-900">
        {ABOUT_LINKS.map((link, i) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex h-12 items-center justify-between px-5 text-sm font-medium text-neutral-300 transition-colors hover:text-white ${
              i > 0 ? 'border-t border-white/5' : ''
            }`}
          >
            {link.label}
            <ChevronRight className="h-4 w-4 text-neutral-600" aria-hidden />
          </Link>
        ))}
      </section>

      <LogoutButton />
    </div>
  );
}
