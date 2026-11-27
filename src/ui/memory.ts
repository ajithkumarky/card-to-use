import { CATEGORY_IDS, type Card, type CategoryId, type PointMode } from '../core/types';

/**
 * What the app remembers in this browser between visits: the cards you hold, cards you added yourself,
 * this quarter's rotating categories, merchant category fixes and the point-value setting.
 * Transactions, file contents and card-number labels are never saved.
 */
export interface Memory {
  held: string[];
  custom: Card[];
  rotating: Record<string, CategoryId[]>;
  overrides: Record<string, CategoryId>;
  mode: PointMode;
}

const KEY = 'card-to-use:v1';

const isCategory = (c: unknown): c is CategoryId => CATEGORY_IDS.includes(c as CategoryId);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Reads saved choices, or null if there are none or storage is blocked. Anything malformed is dropped. */
export function recall(): Memory | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const m: unknown = JSON.parse(raw);
    if (!isObject(m)) return null;
    const held = Array.isArray(m.held) ? m.held.filter((x): x is string => typeof x === 'string') : [];
    const custom = Array.isArray(m.custom) ? (m.custom.filter((c) => isObject(c) && typeof c.id === 'string' && c.custom === true) as unknown as Card[]) : [];
    const rotating: Record<string, CategoryId[]> = {};
    if (isObject(m.rotating))
      for (const [k, v] of Object.entries(m.rotating)) if (Array.isArray(v)) rotating[k] = v.filter(isCategory);
    const overrides: Record<string, CategoryId> = {};
    if (isObject(m.overrides)) for (const [k, v] of Object.entries(m.overrides)) if (isCategory(v)) overrides[k] = v;
    const mode: PointMode = m.mode === 'cash' ? 'cash' : 'best';
    return { held, custom, rotating, overrides, mode };
  } catch {
    return null;
  }
}

export function remember(m: Memory): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // Storage is blocked or full: the app still works for this visit.
  }
}

export function forget(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
