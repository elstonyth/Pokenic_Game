import type { Metadata } from 'next';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { getDaily } from '@/lib/actions/daily';
import { relativeTime, voucherLabel } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Your Vouchers',
  description:
    'Redeem vouchers for free pulls and guaranteed buybacks on the claw machine.',
};

// Standalone full-width route matching the live anonymous /vouchers: a centered hero
// over blurred pack art, then real voucher data from the consolidated /daily surface.
// Moved out of the (account) shell; live has no account sidebar here. Claiming only
// happens on /vip (single claim surface) — this page just lists + links there.

const HERO_SLABS = [
  '/images/polycards/silver-pack.webp',
  '/images/polycards/gold-pack.webp',
  '/images/polycards/bronze-pack.webp',
  '/images/polycards/platinum-pack.webp',
  '/images/polycards/diamond-pack.webp',
];

export default async function VouchersPage() {
  const dailyResult = await getDaily();
  const claimable = (
    dailyResult.ok ? dailyResult.state.vouchers.claimable : []
  ).filter((g) => g.kind === 'voucher');
  const claimed = (
    dailyResult.ok ? dailyResult.state.vouchers.claimed : []
  ).filter((g) => g.kind === 'voucher');

  return (
    <div className="w-full px-fluid py-10">
      {/* Hero */}
      <section className="relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-neutral-950">
        <div className="pointer-events-none absolute inset-0 flex">
          {HERO_SLABS.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              aria-hidden="true"
              className="h-full flex-1 object-cover opacity-25 blur-3xl saturate-150"
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-neutral-950/80" />
        <div className="relative flex flex-col items-center px-6 py-12 text-center sm:py-14">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
            <Ticket className="h-6 w-6" aria-hidden />
          </span>
          <Reveal
            as="h1"
            className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            Your Vouchers
          </Reveal>
          <Reveal
            as="p"
            delay={80}
            className="mt-3 max-w-md text-sm leading-relaxed text-white/60 sm:text-base"
          >
            Redeem vouchers for free pulls and guaranteed buybacks on the claw
            machine.
          </Reveal>
        </div>
      </section>

      {/* Active vouchers */}
      <section>
        <h2 className="font-heading text-xl font-bold tracking-tight text-white">
          Active Vouchers
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Redeem these for free pulls
        </p>
        {claimable.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-3">
            {claimable.map((grant) => (
              <li
                key={grant.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70">
                    <Ticket className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {voucherLabel(grant)}
                    </p>
                    <p className="text-[12px] text-white/60">
                      {grant.origin === 'box'
                        ? 'Box prize'
                        : `VIP LV ${grant.level}`}{' '}
                      · {relativeTime(grant.grantedAt)}
                    </p>
                  </div>
                </div>
                <Link
                  href="/vip"
                  className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
                >
                  Claim on VIP
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-white/40">
              <Ticket className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-white">
              No Active Vouchers
            </p>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-white/50">
              You don&apos;t have any active vouchers at the moment. Active
              vouchers will appear here when you receive them.
            </p>
          </div>
        )}
      </section>

      {/* Claimed history */}
      <section className="mt-10">
        <h2 className="font-heading text-xl font-bold tracking-tight text-white">
          Claimed History
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Vouchers you&apos;ve already claimed
        </p>
        {claimed.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-3">
            {claimed.map((grant) => (
              <li
                key={grant.id}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.01] p-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/30">
                  <Ticket className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white/70">
                    {voucherLabel(grant)}
                  </p>
                  <p className="text-[12px] text-white/60">
                    {grant.origin === 'box'
                      ? 'Box prize'
                      : `VIP LV ${grant.level}`}{' '}
                    · {relativeTime(grant.grantedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-white/50">No claimed vouchers yet.</p>
        )}
      </section>
    </div>
  );
}
