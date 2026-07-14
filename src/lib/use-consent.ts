'use client';

import { useEffect, useState } from 'react';
import { CONSENT_EVENT, getConsent, type ConsentState } from '@/lib/consent';

// Live cookie-consent state: null while undecided (and during SSR/first
// client render — read post-mount so hydration markup matches, the same
// deliberate pattern as CookieConsent). Updates the moment the banner's
// choice lands in this tab via CONSENT_EVENT.
export function useConsent(): ConsentState | null {
  const [consent, setConsent] = useState<ConsentState | null>(null);

  useEffect(() => {
    const sync = () => setConsent(getConsent());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  return consent;
}
