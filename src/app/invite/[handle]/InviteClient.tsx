'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { openAuth } from '@/components/AuthButton';
import { applyReferral } from '@/lib/actions/referral';

type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done' }
  | { kind: 'error'; msg: string };

export default function InviteClient({ handle }: { handle: string }) {
  const { customer, isLoading } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function join() {
    setState({ kind: 'busy' });
    const r = await applyReferral(handle);
    if (r.ok) {
      setState({ kind: 'done' });
      router.refresh();
    } else {
      setState({ kind: 'error', msg: r.error });
    }
  }

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-fluid">
      <div className="w-full max-w-md py-16 text-center">
        <h1 className="font-heading text-2xl font-bold text-neutral-50">
          Join {handle}&apos;s team
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Rip packs together and earn on every pull.
        </p>

        {isLoading ? (
          <div className="mt-6 h-10 w-32 animate-pulse rounded-xl bg-neutral-700 mx-auto" />
        ) : !customer ? (
          // Invitees are new users — lead with signup, keep login secondary.
          <>
            <button
              onClick={() => openAuth('signup')}
              className="mt-6 rounded-xl bg-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white"
            >
              Sign up to join
            </button>
            <p className="mt-3 text-[13px] text-neutral-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="font-semibold text-white hover:underline"
              >
                Log in
              </button>
            </p>
          </>
        ) : state.kind === 'done' ? (
          <>
            <p className="mt-6 text-sm text-buyback-fg">
              You&apos;re on {handle}&apos;s team. Welcome aboard!
            </p>
            <Link
              href="/slots"
              className="mt-4 inline-block rounded-xl bg-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white"
            >
              Rip your first pack
            </Link>
          </>
        ) : (
          <button
            onClick={join}
            disabled={state.kind === 'busy'}
            className="mt-6 rounded-xl bg-neutral-200 px-6 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === 'busy' ? 'Joining…' : `Join ${handle}’s team`}
          </button>
        )}

        {state.kind === 'error' && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {state.msg}
          </p>
        )}
      </div>
    </main>
  );
}
