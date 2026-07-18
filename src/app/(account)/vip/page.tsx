import type { Metadata } from 'next';
import { AccountHeader, StatCards } from '@/components/account/ui';
import { getDaily } from '@/lib/actions/daily';
import { getVip } from '@/lib/actions/vip';
import { rm } from '@/lib/format';
import DailyClient from '@/app/daily/DailyClient';
import { VipLevelCarousel } from './VipLevelCarousel';
import { VipBenefits } from './VipBenefits';
import { VipVouchers } from './VipVouchers';

export const metadata: Metadata = { title: 'VIP' };

export default async function VipPage() {
  const [res, dailyRes] = await Promise.all([getVip(), getDaily()]);
  if (!res.ok) {
    return (
      <>
        <AccountHeader title="VIP" sub="Your level and progress." />
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
          {res.error}
        </p>
      </>
    );
  }
  const v = res.vip;
  return (
    <>
      <AccountHeader
        title="VIP"
        sub="Swipe your level ladder and see every reward."
      />
      <StatCards
        items={[
          { label: 'Level', value: `${v.level}` },
          { label: 'Highest ever', value: `${v.highestLevelEver}` },
          { label: 'Lifetime spend', value: rm(v.spend) },
        ]}
      />

      <VipLevelCarousel
        levels={v.levels}
        highestLevel={v.highestLevelEver}
        spend={v.spend}
      />

      <VipBenefits levels={v.levels} />

      {/* Daily free box (relocated from /daily — a VIP-tier benefit). */}
      {dailyRes.ok && (
        <div className="mt-6">
          <DailyClient initial={dailyRes.state} />
        </div>
      )}

      {/* Level-up voucher claims. */}
      {dailyRes.ok && (
        <VipVouchers
          initialClaimable={dailyRes.state.vouchers.claimable.filter(
            (g) => g.kind === 'voucher',
          )}
          initialClaimed={dailyRes.state.vouchers.claimed.filter(
            (g) => g.kind === 'voucher',
          )}
          redemptionEnabled={dailyRes.state.redemptionEnabled}
        />
      )}
    </>
  );
}
