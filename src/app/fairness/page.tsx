import type { Metadata } from 'next';
import Reveal from '@/components/Reveal';
import AuthButton from '@/components/AuthButton';
import { getCustomer } from '@/lib/data/customer';

export const metadata: Metadata = {
  title: 'Your Fairness Proofs',
  description: 'Verify the provably-fair selection proofs for your pulls.',
};

// Proofs are per-account and the proof-publishing endpoint isn't live yet, so
// this page has two honest states: signed-out visitors get an auth prompt, and
// signed-in customers get a quiet "publishing is being finalized" notice. It
// must never render a fake "Failed to load proofs" error — a fairness page
// that always looks broken is worse for trust than no page at all.

export default async function FairnessPage() {
  const customer = await getCustomer();

  return (
    <div className="w-full px-fluid py-10">
      <Reveal
        as="h1"
        className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl"
      >
        Your Fairness Proofs
      </Reveal>
      <Reveal
        as="p"
        delay={80}
        className="mt-4 max-w-4xl text-sm leading-relaxed text-white/55"
      >
        This page will list the selection proofs for your last 100 pulls. Each
        proof contains a serverSeedHash (commitment), the revealed serverSeed,
        your clientSeed (session), and deterministic selection details — enough
        for anyone to reproduce the outcome from the seeds alone.
      </Reveal>

      {customer ? (
        <Reveal
          as="p"
          delay={140}
          className="mt-8 max-w-xl rounded-xl border border-white/10 bg-neutral-900 px-4 py-3.5 text-sm text-white/70"
        >
          Proof publishing is being finalized — once live, every pull you make
          will list its seeds and selection details here.
        </Reveal>
      ) : (
        <Reveal delay={140} className="mt-8">
          <p className="text-sm text-white/70">
            Proofs are tied to your account.
          </p>
          <AuthButton
            mode="login"
            className="mt-3 inline-flex h-11 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            Log in to view your proofs
          </AuthButton>
        </Reveal>
      )}
    </div>
  );
}
