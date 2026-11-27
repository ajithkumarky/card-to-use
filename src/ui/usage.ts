/**
 * Feature-usage counts for the app's owner (see worker/usage.ts). Only an event name, and for a few events which
 * tab or page, is ever sent. Never merchants, amounts, file names or contents, or which cards someone holds.
 * Nothing is sent when the browser asks not to be tracked (Do Not Track or Global Privacy Control).
 */
export type UsageEvent =
  | { event: 'open'; detail: 'plan' | 'use' | 'cards' }
  | { event: 'tab'; detail: 'plan' | 'suggest' | 'wallet' | 'merchants' | 'columns' }
  | { event: 'upload' | 'sample' | 'lookup' | 'cards_saved' | 'forget' };

const MAX_PER_PAGE = 200;
let sent = 0;

function optedOut() {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
}

export function track(e: UsageEvent) {
  try {
    if (import.meta.env.DEV || optedOut() || sent >= MAX_PER_PAGE) return;
    sent++;
    void fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: e.event, detail: 'detail' in e ? e.detail : '' }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  } catch {
    // Analytics never gets in the way of the app.
  }
}
