import { CATEGORY_IDS, type Card, type CategoryId, type PointMode, type Program, type ProgramId, type Transaction } from './types';
import { PARENT, categorize } from './categories';

export type Programs = Record<ProgramId, Program>;

export function centsPerPoint(card: Card, programs: Programs, mode: PointMode): number {
  const p = programs[card.program];
  return mode === 'best' ? p.bestCents : p.cashCents;
}

/** The rate a card earns in a category, following parent categories (flights -> travel) before the base rate. */
export function rateFor(card: Card, cat: CategoryId): { rate: number; cap: number } {
  let c: CategoryId | undefined = cat;
  while (c) {
    const r = card.rates[c];
    if (r) return { rate: r.rate, cap: r.cap ?? 0 };
    c = PARENT[c];
  }
  return { rate: card.base, cap: 0 };
}

export interface Segment {
  card: Card;
  rate: number;
  /** Cents earned per dollar. */
  cents: number;
  /** Yearly dollars routed to this card at this rate. */
  spend: number;
  earned: number;
}

export interface CategoryPlan {
  category: CategoryId;
  yearlySpend: number;
  segments: Segment[];
  earned: number;
  runnerUp?: { card: Card; rate: number; cents: number };
  /** What this category earns today (actual cards used) or on the single best card. */
  baseline: number;
}

export interface CardSummary {
  card: Card;
  earned: number;
  categories: CategoryId[];
  net: number;
}

export interface Plan {
  categories: CategoryPlan[];
  total: number;
  baseline: number;
  baselineKind: 'actual' | 'single' | 'none';
  singleBest?: { card: Card; earned: number };
  /** Share of purchases whose card label matched a held card (actual baseline only). */
  matchedShare: number;
  fees: number;
  cards: CardSummary[];
}

export interface PlanInput {
  transactions: Transaction[];
  months: number;
  held: Card[];
  programs: Programs;
  mode: PointMode;
  overrides?: Record<string, CategoryId>;
  /** Card label in the file -> held card id. */
  cardLabels?: Record<string, string>;
}

/** Fills each category from the best-paying card down, respecting yearly caps. */
function allocate(spend: number, cat: CategoryId, held: Card[], programs: Programs, mode: PointMode): Segment[] {
  type Option = { card: Card; rate: number; cents: number; cap: number; afterCap: boolean };
  const options: Option[] = [];
  for (const card of held) {
    const cpp = centsPerPoint(card, programs, mode);
    const r = rateFor(card, cat);
    options.push({ card, rate: r.rate, cents: r.rate * cpp, cap: r.cap, afterCap: false });
    if (r.cap) options.push({ card, rate: card.base, cents: card.base * cpp, cap: 0, afterCap: true });
  }
  // On a tie, prefer cash back (its value is certain) over points.
  options.sort((a, b) => b.cents - a.cents || Number(a.card.program !== 'cash') - Number(b.card.program !== 'cash'));
  const segments: Segment[] = [];
  const used = new Set<string>();
  let remaining = spend;
  for (const o of options) {
    if (remaining <= 0) break;
    if (o.afterCap && !used.has(o.card.id)) continue;
    const take = o.cap ? Math.min(remaining, o.cap) : remaining;
    segments.push({ card: o.card, rate: o.rate, cents: o.cents, spend: take, earned: (take * o.cents) / 100 });
    used.add(o.card.id);
    remaining -= take;
  }
  return segments;
}

function earnedOnOneCard(card: Card, spend: number, cat: CategoryId, programs: Programs, mode: PointMode): number {
  const cpp = centsPerPoint(card, programs, mode);
  const r = rateFor(card, cat);
  const atRate = r.cap ? Math.min(spend, r.cap) : spend;
  return ((atRate * r.rate + (spend - atRate) * card.base) * cpp) / 100;
}

/** Guesses which held card a label from the file means, by the card's aliases. */
export function matchCardLabel(label: string, held: Card[]): Card | undefined {
  const l = label.toLowerCase();
  if (!l) return undefined;
  // The longest matching name wins, so "Delta SkyMiles Gold" picks the Delta card over the Amex Gold Card.
  let best: Card | undefined;
  let bestLen = 0;
  for (const c of held) {
    for (const a of [c.name.toLowerCase(), ...c.aliases]) {
      if (a && a.length > bestLen && l.includes(a)) {
        best = c;
        bestLen = a.length;
      }
    }
  }
  return best;
}

export function buildPlan(input: PlanInput): Plan {
  const { transactions, held, programs, mode, overrides = {}, cardLabels = {} } = input;
  const months = Math.max(0.5, input.months);
  const yearly = 12 / months;
  const spend: Partial<Record<CategoryId, number>> = {};
  const tagged = transactions.map((t) => ({ t, cat: categorize(t.description, t.bankCategory, overrides) }));
  for (const { t, cat } of tagged) spend[cat] = (spend[cat] ?? 0) + t.amount * yearly;

  // Actual baseline: what each purchase earned on the card the file says was used.
  const byId = new Map(held.map((c) => [c.id, c]));
  const hasLabels = tagged.some(({ t }) => t.cardLabel);
  let actualByCat: Partial<Record<CategoryId, number>> | null = null;
  let matched = 0;
  if (hasLabels && held.length) {
    actualByCat = {};
    for (const { t, cat } of tagged) {
      const card = byId.get(cardLabels[t.cardLabel] ?? '') ?? matchCardLabel(t.cardLabel, held);
      if (card) matched++;
      // Unmatched purchases are assumed to earn 1 cent per dollar.
      const cents = card ? rateFor(card, cat).rate * centsPerPoint(card, programs, mode) : 1;
      actualByCat[cat] = (actualByCat[cat] ?? 0) + (t.amount * yearly * cents) / 100;
    }
    // If no label matches a held card, the comparison would be meaningless: fall back to the single best card.
    if (!matched) actualByCat = null;
  }

  const cats = CATEGORY_IDS.filter((c) => (spend[c] ?? 0) >= 1);
  let singleBest: Plan['singleBest'];
  for (const card of held) {
    const earned = cats.reduce((a, c) => a + earnedOnOneCard(card, spend[c]!, c, programs, mode), 0);
    if (!singleBest || earned > singleBest.earned) singleBest = { card, earned };
  }

  const summaries = new Map<string, CardSummary>(held.map((c) => [c.id, { card: c, earned: 0, categories: [], net: -c.annualFee }]));
  const categories: CategoryPlan[] = cats.map((cat) => {
    const s = spend[cat]!;
    const segments = allocate(s, cat, held, programs, mode);
    const earned = segments.reduce((a, g) => a + g.earned, 0);
    for (const g of segments) {
      const sum = summaries.get(g.card.id)!;
      sum.earned += g.earned;
      sum.net += g.earned;
      if (!sum.categories.includes(cat)) sum.categories.push(cat);
    }
    const top = segments[0]?.card.id;
    const runner = held
      .filter((c) => c.id !== top)
      .map((c) => {
        const r = rateFor(c, cat);
        return { card: c, rate: r.rate, cents: r.rate * centsPerPoint(c, programs, mode) };
      })
      .sort((a, b) => b.cents - a.cents)[0];
    const baseline = actualByCat
      ? actualByCat[cat] ?? 0
      : singleBest
        ? earnedOnOneCard(singleBest.card, s, cat, programs, mode)
        : 0;
    return { category: cat, yearlySpend: s, segments, earned, runnerUp: segments.length === 1 ? runner : undefined, baseline };
  });
  categories.sort((a, b) => b.yearlySpend - a.yearlySpend);

  const total = categories.reduce((a, c) => a + c.earned, 0);
  const baseline = categories.reduce((a, c) => a + c.baseline, 0);
  return {
    categories,
    total,
    baseline,
    baselineKind: actualByCat ? 'actual' : singleBest ? 'single' : 'none',
    singleBest,
    matchedShare: transactions.length ? matched / transactions.length : 0,
    fees: held.reduce((a, c) => a + c.annualFee, 0),
    cards: [...summaries.values()],
  };
}

/**
 * Extra dollars this quarter from a rotating 5% card compared with the plan's best card for
 * each active category, filling the quarterly cap in order. Not part of the yearly totals.
 */
export function rotatingBonus(card: Card, plan: Plan, programs: Programs, mode: PointMode): number {
  if (!card.rotating || !card.rotating.categories.length) return 0;
  const cents = card.rotating.rate * centsPerPoint(card, programs, mode);
  let room = card.rotating.quarterlyCap;
  let extra = 0;
  for (const c of card.rotating.categories) {
    const p = plan.categories.find((x) => x.category === c);
    if (!p || room <= 0) continue;
    const spend = Math.min(room, p.yearlySpend / 4);
    const current = p.segments[0]?.cents ?? 0;
    if (cents > current) extra += (spend * (cents - current)) / 100;
    room -= spend;
  }
  return extra;
}
