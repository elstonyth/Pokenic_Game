'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Gift, Box, Star, Package, AlertCircle, Sparkles } from 'lucide-react';
import { AccountHeader, Panel, Badge } from '@/components/account/ui';
import { rm } from '@/lib/format';
import {
  claimReward,
  drawBox,
  withdrawPrize,
  type RewardsResult,
  type RewardGrant,
  type RewardPrize,
  type DrawPrize,
  type WithdrawAddressInput,
} from '@/lib/actions/rewards';

// ---- input style shared with the address form ------------------------------
const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-white placeholder:text-white/40 focus:border-white/25 focus:outline-none';

// ---- helpers ----------------------------------------------------------------

function voucherAmount(grant: RewardGrant): number {
  return typeof grant.payload?.['amount_myr'] === 'number'
    ? (grant.payload['amount_myr'] as number)
    : 0;
}

function prizeTitle(prize: RewardPrize): string {
  const snap = prize.prizeSnapshot;
  if (!snap) return 'Prize';
  if (typeof snap['title'] === 'string') return snap['title'];
  return 'Prize';
}

function prizeImage(prize: RewardPrize): string | null {
  const snap = prize.prizeSnapshot;
  if (!snap) return null;
  if (typeof snap['image'] === 'string') return snap['image'];
  return null;
}

function prizeCreditMyr(prize: RewardPrize): number | null {
  const snap = prize.prizeSnapshot;
  if (!snap || prize.prizeKind !== 'credit') return null;
  if (typeof snap['amount_myr'] === 'number')
    return snap['amount_myr'] as number;
  return null;
}

// ---- sub-components ---------------------------------------------------------

/** A minimal reveal animation for the daily box prize (adapted from the slab aesthetic). */
function PrizeReveal({
  prize,
  onClose,
}: {
  prize: DrawPrize;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/95 p-6 motion-safe:animate-[fadeIn_0.3s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Daily box reveal"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Prize display */}
        {prize.kind === 'product' && prize.image ? (
          <div className="relative h-[280px] w-[200px]">
            <Image
              src={prize.image}
              alt={prize.title ?? 'Prize'}
              fill
              sizes="200px"
              className="object-contain drop-shadow-[0_0_40px_rgba(251,146,60,0.5)]"
            />
          </div>
        ) : (
          <div
            className="flex h-40 w-40 items-center justify-center rounded-full border border-white/10"
            style={
              {
                background:
                  prize.kind === 'credit'
                    ? 'radial-gradient(circle, rgba(52,211,153,0.25), rgba(52,211,153,0.05))'
                    : 'radial-gradient(circle, rgba(163,163,163,0.2), rgba(163,163,163,0.05))',
              } as CSSProperties
            }
          >
            {prize.kind === 'credit' ? (
              <span className="font-heading text-4xl font-black text-emerald-400">
                RM
              </span>
            ) : (
              <span className="text-5xl">🎁</span>
            )}
          </div>
        )}

        {/* Prize text */}
        <div className="space-y-1">
          {prize.kind === 'product' && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-amber-400/70">
                Prize Won
              </p>
              <p className="font-heading text-2xl font-bold text-white">
                {prize.title ?? 'Product Prize'}
              </p>
              <p className="text-sm text-white/50">
                Added to your vault — ship it from the Prizes section below.
              </p>
            </>
          )}
          {prize.kind === 'credit' && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-emerald-400/70">
                Credit Won
              </p>
              <p className="font-heading text-3xl font-black text-emerald-400">
                +{rm(prize.amountMyr ?? 0)}
              </p>
              <p className="text-sm text-white/50">
                Added to your wallet balance.
              </p>
            </>
          )}
          {prize.kind === 'nothing' && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/40">
                Better luck next time
              </p>
              <p className="font-heading text-2xl font-bold text-white/60">
                No prize today
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 inline-flex h-12 w-[260px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition-opacity hover:opacity-95"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/** Simple inline address form for prize withdrawal. */
function WithdrawForm({
  pullId,
  onDone,
  onCancel,
}: {
  pullId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<WithdrawAddressInput>({
    firstName: '',
    lastName: '',
    address1: '',
    city: '',
    postalCode: '',
    countryCode: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await withdrawPrize(pullId, form);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.status === 'requested') {
      setDone(true);
      setTimeout(onDone, 1500);
    } else if (res.status === 'capped') {
      setError("You've hit today's withdrawal limit. Try again tomorrow.");
    } else {
      setError(
        "This prize can't be shipped (it may have already been requested).",
      );
    }
  }

  if (done) {
    return (
      <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-300">
        Shipping requested! Check your Orders for status.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-[13px] text-white/60">Enter your shipping address:</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-white/55">
            First name
          </span>
          <input
            aria-label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={(e) =>
              setForm((f) => ({ ...f, firstName: e.target.value }))
            }
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-white/55">
            Last name
          </span>
          <input
            aria-label="Last name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={(e) =>
              setForm((f) => ({ ...f, lastName: e.target.value }))
            }
            className={INPUT_CLASS}
          />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-[12px] font-medium text-white/55">
            Address
          </span>
          <input
            aria-label="Address"
            autoComplete="address-line1"
            value={form.address1}
            onChange={(e) =>
              setForm((f) => ({ ...f, address1: e.target.value }))
            }
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-white/55">
            City
          </span>
          <input
            aria-label="City"
            autoComplete="address-level2"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-white/55">
            Postal code
          </span>
          <input
            aria-label="Postal code"
            autoComplete="postal-code"
            value={form.postalCode}
            onChange={(e) =>
              setForm((f) => ({ ...f, postalCode: e.target.value }))
            }
            className={INPUT_CLASS}
          />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-[12px] font-medium text-white/55">
            Country code (2 letters)
          </span>
          <input
            aria-label="Country code"
            autoComplete="country"
            placeholder="e.g. MY"
            maxLength={2}
            value={form.countryCode}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                countryCode: e.target.value.toUpperCase(),
              }))
            }
            className={INPUT_CLASS}
          />
        </label>
      </div>
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Requesting…' : 'Request shipping'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-[13px] text-white/60 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- main client component --------------------------------------------------

export default function RewardsClient({ initial }: { initial: RewardsResult }) {
  // Refresh state after actions: re-fetch by re-mounting is done by the server
  // but for optimistic UI we track mutations locally.
  const [data, setData] = useState<RewardsResult>(initial);

  // Grant claim state keyed by grant id
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const [claimError, setClaimError] = useState<Record<string, string>>({});

  // Daily box draw state
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<DrawPrize | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [drawsUsed, setDrawsUsed] = useState<number | null>(null); // optimistic

  // Prize withdrawal state keyed by pullId
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  // ---- grant claim -----------------------------------------------------------
  async function handleClaim(grant: RewardGrant) {
    if (claiming[grant.id] || claimed[grant.id]) return;
    setClaiming((p) => ({ ...p, [grant.id]: true }));
    setClaimError((p) => ({ ...p, [grant.id]: '' }));
    const res = await claimReward(grant.id);
    setClaiming((p) => ({ ...p, [grant.id]: false }));
    if (!res.ok) {
      setClaimError((p) => ({ ...p, [grant.id]: res.error }));
      return;
    }
    if (res.claimed) {
      setClaimed((p) => ({ ...p, [grant.id]: true }));
    } else {
      setClaimError((p) => ({
        ...p,
        [grant.id]: 'Already claimed or no longer available.',
      }));
    }
  }

  // ---- daily box -------------------------------------------------------------
  async function handleDraw() {
    if (drawing) return;
    setDrawing(true);
    setDrawError(null);
    const res = await drawBox();
    setDrawing(false);
    if (!res.ok) {
      setDrawError(res.error);
      return;
    }
    if (res.status === 'capped') {
      setDrawError("You've used all your draws for today. Come back tomorrow!");
      setDrawsUsed(data.ok ? (data.drawState?.drawsPerDay ?? 0) : 0);
      return;
    }
    if (res.status === 'unavailable') {
      setDrawError("The daily box isn't available yet. Check back soon.");
      return;
    }
    // drawn — show reveal
    setDrawsUsed((data.ok ? (data.drawState?.drawsToday ?? 0) : 0) + 1);
    if (res.prize) {
      setDrawResult(res.prize);
    } else {
      // shouldn't happen for status=drawn, but degrade gracefully
      setDrawError('Draw recorded, but no prize data was returned.');
    }
  }

  // ---- render ----------------------------------------------------------------

  if (!data.ok) {
    return (
      <>
        <AccountHeader
          title="My Rewards"
          sub="Your VIP reward grants and daily box."
        />
        <Panel className="mt-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" aria-hidden />
          <p className="text-sm text-white/60">{data.error}</p>
        </Panel>
      </>
    );
  }

  const { grants, drawState, prizes, redemptionEnabled } = data;

  // Claimable grants = voucher or frame only (box/prize grants have no Claim button)
  const claimableGrants = grants.filter(
    (g) =>
      (g.kind === 'voucher' || g.kind === 'frame') && g.status === 'granted',
  );

  const drawsToday = drawsUsed ?? drawState?.drawsToday ?? 0;
  const drawsPerDay = drawState?.drawsPerDay ?? 0;
  const drawsLeft = Math.max(0, drawsPerDay - drawsToday);
  const poolEnabled = drawState?.poolEnabled ?? false;
  const canDraw = poolEnabled && drawsLeft > 0 && !drawing;

  // Vaulted product prizes (awaiting shipping)
  const vaultedPrizes = prizes.filter(
    (p) => p.prizeKind === 'product' && p.status === 'vaulted',
  );

  return (
    <>
      {drawResult && (
        <PrizeReveal
          prize={drawResult}
          onClose={() => {
            setDrawResult(null);
            // Reload page data after reveal so the draw count and prize list refresh
            setData({ ...data });
          }}
        />
      )}

      <AccountHeader
        title="My Rewards"
        sub="Your VIP reward grants and daily box."
      />

      {/* ---- Claimable grants ---- */}
      <section aria-labelledby="grants-heading">
        <h2
          id="grants-heading"
          className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/50"
        >
          <Gift className="h-4 w-4" aria-hidden />
          Grants
        </h2>
        {claimableGrants.length === 0 ? (
          <Panel>
            <p className="text-sm text-white/40">
              No claimable grants right now. Level up your VIP to earn vouchers
              and frame unlocks.
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {claimableGrants.map((grant) => {
              const isClaimed = claimed[grant.id];
              const isBusy = claiming[grant.id];
              const err = claimError[grant.id];
              return (
                <Panel key={grant.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {grant.kind === 'voucher' ? (
                          <Badge tone="green">Voucher</Badge>
                        ) : (
                          <Badge tone="sky">Frame unlock</Badge>
                        )}
                        <span className="text-[12px] text-white/40">
                          {new Date(grant.grantedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {grant.kind === 'voucher' && voucherAmount(grant) > 0 && (
                        <p className="mt-1 font-heading text-xl font-bold text-emerald-400">
                          {rm(voucherAmount(grant))}
                        </p>
                      )}
                      {grant.kind === 'frame' && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-white/70">
                          <Star
                            className="h-3.5 w-3.5 text-sky-400"
                            aria-hidden
                          />
                          New card frame unlocked
                        </p>
                      )}
                    </div>
                    {isClaimed ? (
                      <Badge tone="green">Claimed</Badge>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy || !redemptionEnabled}
                        onClick={() => handleClaim(grant)}
                        className="shrink-0 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                      >
                        {isBusy
                          ? 'Claiming…'
                          : redemptionEnabled
                            ? 'Claim'
                            : 'Coming soon'}
                      </button>
                    )}
                  </div>
                  {err && (
                    <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                      {err}
                    </p>
                  )}
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Daily box ---- */}
      <section aria-labelledby="box-heading" className="mt-8">
        <h2
          id="box-heading"
          className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/50"
        >
          <Box className="h-4 w-4" aria-hidden />
          Daily Box
        </h2>
        <Panel>
          {!drawState ? (
            /* No pool configured at all */
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-white/50">
                The daily box is not yet configured for your VIP tier.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[13px] text-white/60">
                  Tier{' '}
                  <span className="font-semibold uppercase text-white">
                    {drawState.tier}
                  </span>{' '}
                  box
                </p>
                {poolEnabled ? (
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {drawsLeft > 0 ? (
                      <>
                        <span className="text-emerald-400">{drawsLeft}</span>
                        {' draw'}
                        {drawsLeft === 1 ? '' : 's'} left today
                      </>
                    ) : (
                      <span className="text-white/40">
                        All {drawsPerDay} draw
                        {drawsPerDay === 1 ? '' : 's'} used today
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-white/40">
                    Coming soon — reward redemption is not enabled yet.
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={!canDraw}
                onClick={handleDraw}
                aria-label="Open daily box"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-900/30 transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {drawing
                  ? 'Opening…'
                  : poolEnabled
                    ? 'Open box'
                    : 'Coming soon'}
              </button>
            </div>
          )}
          {drawError && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
              {drawError}
            </p>
          )}
        </Panel>
      </section>

      {/* ---- Vaulted prizes (ship action) ---- */}
      {vaultedPrizes.length > 0 && (
        <section aria-labelledby="prizes-heading" className="mt-8">
          <h2
            id="prizes-heading"
            className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/50"
          >
            <Package className="h-4 w-4" aria-hidden />
            Prizes to ship
          </h2>
          <div className="space-y-3">
            {vaultedPrizes.map((prize) => {
              const img = prizeImage(prize);
              const title = prizeTitle(prize);
              const isWithdrawing = withdrawing === prize.pullId;
              return (
                <Panel key={prize.pullId}>
                  <div className="flex items-start gap-4">
                    {img && (
                      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded">
                        <Image
                          src={img}
                          alt={title}
                          fill
                          sizes="56px"
                          className="object-contain"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">{title}</p>
                      <p className="mt-0.5 text-[12px] text-white/40">
                        Won {prize.drawDay}
                      </p>
                      {!isWithdrawing ? (
                        <button
                          type="button"
                          onClick={() => setWithdrawing(prize.pullId)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
                        >
                          <Package className="h-3.5 w-3.5" aria-hidden />
                          Ship it
                        </button>
                      ) : (
                        <WithdrawForm
                          pullId={prize.pullId}
                          onDone={() => setWithdrawing(null)}
                          onCancel={() => setWithdrawing(null)}
                        />
                      )}
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- Empty state when nothing at all ---- */}
      {claimableGrants.length === 0 &&
        !drawState &&
        vaultedPrizes.length === 0 && (
          <Panel className="mt-6">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Gift className="h-10 w-10 text-white/20" aria-hidden />
              <p className="text-sm font-semibold text-white/50">
                No rewards yet
              </p>
              <p className="max-w-[300px] text-[13px] text-white/35">
                Spend more to climb VIP levels and unlock daily boxes, vouchers,
                and exclusive frame rewards.
              </p>
            </div>
          </Panel>
        )}

      {/* Grant count for non-claimable types (box/prize) — info-only, no Claim */}
      {grants.filter((g) => g.kind !== 'voucher' && g.kind !== 'frame').length >
        0 && (
        <p className="mt-4 text-[12px] text-white/35">
          {
            grants.filter((g) => g.kind !== 'voucher' && g.kind !== 'frame')
              .length
          }{' '}
          other grant(s) managed automatically (boxes and prizes are settled
          server-side).
        </p>
      )}

      {/* Credit prize records (pulled from the draw history) */}
      {prizes.filter((p) => p.prizeKind === 'credit').length > 0 && (
        <section aria-labelledby="credit-prizes-heading" className="mt-8">
          <h2
            id="credit-prizes-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50"
          >
            Credit prizes
          </h2>
          <div className="space-y-2">
            {prizes
              .filter((p) => p.prizeKind === 'credit')
              .map((prize) => {
                const myr = prizeCreditMyr(prize);
                return (
                  <Panel key={prize.pullId}>
                    <div className="flex items-center justify-between">
                      <div>
                        <Badge tone="green">Credit</Badge>
                        <p className="mt-1 text-[12px] text-white/40">
                          Won {prize.drawDay}
                        </p>
                      </div>
                      {myr !== null && (
                        <span className="font-heading text-xl font-bold text-emerald-400">
                          +{rm(myr)}
                        </span>
                      )}
                    </div>
                  </Panel>
                );
              })}
          </div>
        </section>
      )}
    </>
  );
}
