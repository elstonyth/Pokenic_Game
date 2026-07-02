'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getCreditBalance } from '@/lib/actions/vault';
import { openAuth } from '@/components/AuthButton';
import { useAuth } from '@/components/auth/AuthProvider';
import TopUpSheet from './TopUpSheet';

type TopUpContextValue = {
  /** RM credit balance; null while loading or logged out. */
  balance: number | null;
  /** Open the global top-up sheet (routes logged-out users to login). */
  openTopUp: () => void;
  /** Re-fetch the balance from the backend. */
  refreshBalance: () => Promise<void>;
  /** Push a known-fresh balance (e.g. returned by a purchase action). */
  applyBalance: (balance: number) => void;
};

const TopUpContext = createContext<TopUpContextValue | null>(null);

export function useTopUp(): TopUpContextValue {
  const ctx = useContext(TopUpContext);
  if (!ctx) throw new Error('useTopUp must be used within TopUpProvider');
  return ctx;
}

/**
 * Holds the header credit balance and the global top-up sheet. Balance is not
 * part of AuthProvider (it changes on every purchase/top-up), so it lives here
 * and pages can push fresh values via applyBalance.
 */
export function TopUpProvider({ children }: { children: ReactNode }) {
  const { customer } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  // Fetch on login / account switch. setState only ever runs in promise
  // callbacks (never synchronously in the effect); logged-out renders null
  // via derivation below instead of a state write.
  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    getCreditBalance()
      .then((value) => {
        if (!cancelled) setBalance(value);
      })
      .catch(() => {
        // Header chip degrades to "—"; pages surface their own errors.
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  // Event-handler refresh (post-purchase, focus, etc.) — not effect-driven.
  const refreshBalance = useCallback(async () => {
    if (!customer) return;
    try {
      setBalance(await getCreditBalance());
    } catch {
      setBalance(null);
    }
  }, [customer]);

  const openTopUp = useCallback(() => {
    if (!customer) {
      openAuth('login');
      return;
    }
    setOpen(true);
  }, [customer]);

  // Logged-out is derived, not stored — no state write needed on logout.
  const shownBalance = customer ? balance : null;

  return (
    <TopUpContext.Provider
      value={{
        balance: shownBalance,
        openTopUp,
        refreshBalance,
        applyBalance: setBalance,
      }}
    >
      {children}
      <TopUpSheet
        open={open}
        balance={shownBalance}
        onClose={() => setOpen(false)}
        onToppedUp={(next) => setBalance(next)}
      />
    </TopUpContext.Provider>
  );
}
