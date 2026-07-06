import type { Metadata } from 'next';
import { AlertCircle, Landmark } from 'lucide-react';
import AuthButton from '@/components/AuthButton';
import { getCustomer } from '@/lib/data/customer';

export const metadata: Metadata = {
  title: 'Bank Withdrawal',
  description: 'Complete your withdrawal with a direct bank transfer.',
};

// Withdrawals are account-gated and the payout gateway isn't live yet, so this
// page has two honest states: signed-out visitors get the auth wall, and
// signed-in customers get a "not open yet" notice instead of a false
// "Sign in to withdraw" dead end. No fabricated balance/history.
export const dynamic = 'force-dynamic';

export default async function BankWithdrawalPage() {
  const customer = await getCustomer();

  return (
    <div className="w-full px-fluid py-10">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
        Bank Withdrawal
      </h1>
      <p className="mt-2 text-sm text-white/55">
        Complete your withdrawal with a direct bank transfer.
      </p>

      {customer ? (
        <>
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-white/10 bg-neutral-900 px-4 py-3.5 text-sm text-white/80">
            <Landmark
              className="mt-0.5 h-4 w-4 shrink-0 text-white/60"
              aria-hidden
            />
            <span>
              Bank withdrawals aren&apos;t open yet — payouts go live with the
              payment gateway. Your credit balance is safe and stays spendable
              on packs in the meantime.
            </span>
          </div>
          <p className="mt-4 text-[13px] text-white/60">
            Want value out today? Sell-back credits from your vault apply
            instantly to your balance.
          </p>
        </>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm font-medium text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            Sign in to withdraw to your bank.
          </div>

          <AuthButton
            mode="login"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            Log in to continue
          </AuthButton>
        </>
      )}
    </div>
  );
}
