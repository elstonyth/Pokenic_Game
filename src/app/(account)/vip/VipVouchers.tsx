'use client';

import { useState } from 'react';
import { Gift } from 'lucide-react';
import { openAuth } from '@/components/AuthButton';
import { voucherLabel } from '@/lib/format';
import { claimVoucher, type VoucherGrant } from '@/lib/actions/daily';

/** Origin badge: one-time level-up reward vs a daily-box win. */
function OriginBadge({ grant }: { grant: VoucherGrant }) {
  return (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/60">
      {grant.origin === 'box' ? 'Box prize' : `Level ${grant.level} reward`}
    </span>
  );
}

export function VipVouchers({
  initialClaimable,
  initialClaimed,
  redemptionEnabled,
}: {
  initialClaimable: VoucherGrant[];
  initialClaimed: VoucherGrant[];
  redemptionEnabled: boolean;
}) {
  const [claimable, setClaimable] = useState(initialClaimable);
  const [claimed, setClaimed] = useState(initialClaimed);
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Section-level message for grants that vanish from the list (a per-row
  // error can't render once its row is removed).
  const [notice, setNotice] = useState<string | null>(null);

  async function handleClaim(grant: VoucherGrant) {
    if (claiming[grant.id]) return;
    setClaiming((p) => ({ ...p, [grant.id]: true }));
    setErrors((p) => ({ ...p, [grant.id]: '' }));
    setNotice(null);
    const res = await claimVoucher(grant.id);
    setClaiming((p) => ({ ...p, [grant.id]: false }));
    if (!res.ok) {
      // Stale/expired session: open the login modal so the user can recover
      // instead of retrying a claim that can never succeed (same pattern as
      // the slot machine's spin handler).
      if (res.needsAuth) openAuth('login');
      setErrors((p) => ({ ...p, [grant.id]: res.error }));
      return;
    }
    if (!res.claimed) {
      // The server invalidated this grant (claimed elsewhere or revoked) —
      // drop it from the list instead of offering an endless failing retry.
      setClaimable((p) => p.filter((g) => g.id !== grant.id));
      setNotice(
        `${voucherLabel(grant)} is no longer claimable — it may have been claimed in another tab.`,
      );
      return;
    }
    setClaimable((p) => p.filter((g) => g.id !== grant.id));
    setClaimed((p) => [grant, ...p]);
  }

  return (
    <section aria-labelledby="vip-vouchers-heading" className="mt-6">
      <h2
        id="vip-vouchers-heading"
        className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
      >
        <Gift className="h-4 w-4" aria-hidden />
        Vouchers
      </h2>
      <p className="mb-3 text-[13px] text-neutral-400">
        Earned once each time you level up — not daily. Box-won vouchers land
        here too.
      </p>

      {notice && (
        <p
          role="status"
          className="mb-3 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[13px] text-neutral-300"
        >
          {notice}
        </p>
      )}

      {claimable.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-neutral-400">
            No vouchers to claim — level up to earn the next one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {claimable.map((grant) => {
            const isBusy = claiming[grant.id];
            const err = errors[grant.id];
            return (
              <div
                key={grant.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="font-heading text-lg text-white">
                      {voucherLabel(grant)}
                    </p>
                    <OriginBadge grant={grant} />
                  </div>
                  <button
                    type="button"
                    disabled={isBusy || !redemptionEnabled}
                    onClick={() => void handleClaim(grant)}
                    className="h-11 shrink-0 rounded-lg bg-buyback px-4 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    {isBusy
                      ? 'Claiming…'
                      : redemptionEnabled
                        ? 'Claim'
                        : 'Coming soon'}
                  </button>
                </div>
                {err && (
                  <p
                    role="alert"
                    className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
                  >
                    {err}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {claimed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Claimed
          </summary>
          <div className="mt-2 space-y-2">
            {claimed.map((grant) => (
              <div
                key={grant.id}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <p className="font-heading text-lg text-white/50">
                    {voucherLabel(grant)}
                  </p>
                  <OriginBadge grant={grant} />
                </div>
                <span className="text-[12px] text-neutral-400">Claimed</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
