/**
 * Feature-usage counts for the app's owner (see worker/usage.ts). Only event names, and for a few events which
 * tab or page, are ever sent. Never merchants, amounts, file names or contents, or which cards someone holds.
 * Nothing is sent when the browser asks not to be tracked (Do Not Track or Global Privacy Control).
 *
 * Events are counted here and sent together, at most every few minutes and when the page is hidden or closed,
 * so a visit costs one or two storage writes on the free plan instead of one per click.
 */
export type UsageEvent =
  | { event: 'open'; detail: 'plan' | 'use' | 'cards' }
  | { event: 'tab'; detail: 'plan' | 'suggest' | 'wallet' | 'merchants' | 'columns' }
  | { event: 'upload' | 'sample' | 'lookup' | 'cards_saved' | 'forget' };

const FLUSH_MS = 5 * 60_000;
const MAX_PER_BATCH = 200;
let pending: Record<string, number> = {};
let total = 0;
let timer: number | undefined;
let listening = false;

function optedOut() {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
}

function flush() {
  window.clearTimeout(timer);
  timer = undefined;
  if (!total) return;
  const body = JSON.stringify({ counts: pending });
  pending = {};
  total = 0;
  try {
    void fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
  } catch {
    // Analytics never gets in the way of the app.
  }
}

export function track(e: UsageEvent) {
  try {
    if (import.meta.env.DEV || optedOut() || total >= MAX_PER_BATCH) return;
    const key = `${e.event}:${'detail' in e ? e.detail : ''}`;
    pending[key] = (pending[key] ?? 0) + 1;
    total++;
    if (!listening) {
      listening = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
      window.addEventListener('pagehide', flush);
    }
    timer ??= window.setTimeout(flush, FLUSH_MS);
  } catch {
    // Analytics never gets in the way of the app.
  }
}
