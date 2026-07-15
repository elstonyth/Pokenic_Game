export type ConsentState = 'accepted' | 'rejected';
export const CONSENT_KEY = 'polycards.cookie-consent';
// Fired on window whenever setConsent records a choice, so live UI (e.g. the
// vault action bar, which stays hidden while the consent banner overlaps its
// dock) can react in the same tab without polling localStorage.
export const CONSENT_EVENT = 'polycards:consent';

export function getConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(CONSENT_KEY);
  return v === 'accepted' || v === 'rejected' ? v : null;
}

export function setConsent(state: ConsentState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, state);
  // Mirror to a cookie so server middleware can read it later if needed.
  // Secure (HTTPS prod; allowed on http://localhost) + encodeURIComponent
  // future-proof the value if ConsentState ever widens beyond the fixed enum.
  document.cookie = `${CONSENT_KEY}=${encodeURIComponent(state)}; path=/; max-age=31536000; SameSite=Lax; Secure`;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
