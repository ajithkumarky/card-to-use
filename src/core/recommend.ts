import { BRAND_IDS, CATEGORY_IDS, type BrandId, type Card, type CategoryId, type Network, type PointMode, type Program, type ProgramId, type Transaction } from './types';
import { BRANDS, PARENT, brandOf, categorize } from './categories';

export type Programs = Record<ProgramId, Program>;

export function centsPerPoint(card: Card, programs: Programs, mode: PointMode): number {
  const p = programs[card.program];
  return mode === 'best' ? p.bestCents : p.cashCents;
}

/**
 * The rate a card earns in a category, following parent categories (flights -> travel) before the base rate.
 * For a brand's purchases (Delta flights), the card's brand rate applies when it beats the category rate.
 */
export function rateFor(card: Card, cat: CategoryId, brand?: BrandId): { rate: number; cap: number } {
  let general = { rate: card.base, cap: 0 };
  let c: CategoryId | undefined = cat;
  while (c) {
    const r = card.rates[c];
    if (r) {
      general = { rate: r.rate, cap: r.cap ?? 0 };
      break;
    }
    c = PARENT[c];
  }
  const b = brand && card.brands?.[brand];
  if (b && b.rate > general.rate) return { rate: b.rate, cap: b.cap ?? 0 };
  return general;
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
  /** Set when this row is one brand's purchases within the category (Delta within flights). */
  brand?: BrandId;
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
  /** Yearly purchases (net of refunds) the plan covers. */
  yearlySpend: number;
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
function allocate(spend: number, cat: CategoryId, brand: BrandId | undefined, held: Card[], programs: Programs, mode: PointMode): Segment[] {
  type Option = { card: Card; rate: number; cents: number; cap: number; afterCap: boolean };
  const options: Option[] = [];
  for (const card of held) {
    const cpp = centsPerPoint(card, programs, mode);
    const r = rateFor(card, cat, brand);
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

function earnedOnOneCard(card: Card, spend: number, cat: CategoryId, brand: BrandId | undefined, programs: Programs, mode: PointMode): number {
  const cpp = centsPerPoint(card, programs, mode);
  const r = rateFor(card, cat, brand);
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

const groupKey = (cat: CategoryId, brand?: BrandId) => (brand ? `${cat}:${brand}` : cat);

/** Every category, each followed by the brands within it, in a stable order. */
const ALL_GROUPS: { key: string; cat: CategoryId; brand?: BrandId }[] = CATEGORY_IDS.flatMap((cat) => [
  { key: cat, cat },
  ...BRAND_IDS.filter((b) => BRANDS[b].category === cat).map((brand) => ({ key: groupKey(cat, brand), cat, brand })),
]);

export function buildPlan(input: PlanInput): Plan {
  const { transactions, held, programs, mode, overrides = {}, cardLabels = {} } = input;
  const months = Math.max(0.5, input.months);
  const yearly = 12 / months;
  // Spending is grouped by category, and within a category by brand where a brand applies.
  // Caps are applied per group, so a card's category cap can be counted once for the brand's row and once for the rest.
  const spend = new Map<string, number>();
  const tagged = transactions.map((t) => {
    const cat = categorize(t.description, t.bankCategory, overrides);
    return { t, cat, brand: brandOf(t.description, cat) };
  });
  for (const { t, cat, brand } of tagged) spend.set(groupKey(cat, brand), (spend.get(groupKey(cat, brand)) ?? 0) + t.amount * yearly);

  // Actual baseline: what each purchase earned on the card the file says was used.
  const byId = new Map(held.map((c) => [c.id, c]));
  const hasLabels = tagged.some(({ t }) => t.cardLabel);
  let actualByCat: Map<string, number> | null = null;
  let matched = 0;
  if (hasLabels && held.length) {
    actualByCat = new Map();
    for (const { t, cat, brand } of tagged) {
      const card = byId.get(cardLabels[t.cardLabel] ?? '') ?? matchCardLabel(t.cardLabel, held);
      if (card) matched++;
      // Unmatched purchases are assumed to earn 1 cent per dollar.
      const cents = card ? rateFor(card, cat, brand).rate * centsPerPoint(card, programs, mode) : 1;
      const key = groupKey(cat, brand);
      actualByCat.set(key, (actualByCat.get(key) ?? 0) + (t.amount * yearly * cents) / 100);
    }
    // If no label matches a held card, the comparison would be meaningless: fall back to the single best card.
    if (!matched) actualByCat = null;
  }

  const groups = ALL_GROUPS.filter((g) => (spend.get(g.key) ?? 0) >= 1);
  let singleBest: Plan['singleBest'];
  for (const card of held) {
    const earned = groups.reduce((a, g) => a + earnedOnOneCard(card, spend.get(g.key)!, g.cat, g.brand, programs, mode), 0);
    if (!singleBest || earned > singleBest.earned) singleBest = { card, earned };
  }

  const summaries = new Map<string, CardSummary>(held.map((c) => [c.id, { card: c, earned: 0, categories: [], net: -c.annualFee }]));
  const categories: CategoryPlan[] = groups.map(({ key, cat, brand }) => {
    const s = spend.get(key)!;
    const segments = allocate(s, cat, brand, held, programs, mode);
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
        const r = rateFor(c, cat, brand);
        return { card: c, rate: r.rate, cents: r.rate * centsPerPoint(c, programs, mode) };
      })
      .sort((a, b) => b.cents - a.cents)[0];
    const baseline = actualByCat
      ? actualByCat.get(key) ?? 0
      : singleBest
        ? earnedOnOneCard(singleBest.card, s, cat, brand, programs, mode)
        : 0;
    return { category: cat, brand, yearlySpend: s, segments, earned, runnerUp: segments.length === 1 ? runner : undefined, baseline };
  });
  categories.sort((a, b) => b.yearlySpend - a.yearlySpend);

  const total = categories.reduce((a, c) => a + c.earned, 0);
  const baseline = categories.reduce((a, c) => a + c.baseline, 0);
  return {
    categories,
    yearlySpend: categories.reduce((a, c) => a + c.yearlySpend, 0),
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
    for (const p of plan.categories.filter((x) => x.category === c)) {
      if (room <= 0) break;
      const spend = Math.min(room, p.yearlySpend / 4);
      const current = p.segments[0]?.cents ?? 0;
      if (cents > current) extra += (spend * (cents - current)) / 100;
      room -= spend;
    }
  }
  return extra;
}

export interface PurchasePick {
  card: Card;
  rate: number;
  /** Cents earned per dollar at the chosen point value. */
  cents: number;
  /** Why this rate applies: a brand bonus, this quarter's rotating category, a category rate, or the base rate. */
  source: 'brand' | 'rotating' | 'category' | 'base';
  /** The category whose rate applied (may be a parent, like travel for flights). */
  via?: CategoryId;
  /** Yearly cap on this rate in dollars, or the quarterly cap for a rotating category. 0 when uncapped. */
  cap: number;
  /** False when the merchant doesn't take the card's network; undefined when unknown or the merchant takes all. */
  accepted?: boolean;
}

/** Ranks held cards for a single purchase at a merchant in a category, best first. Rotating categories count only once set. */
export function rankForPurchase(
  held: Card[],
  cat: CategoryId,
  brand: BrandId | undefined,
  programs: Programs,
  mode: PointMode,
  accepts?: Network[],
): PurchasePick[] {
  const picks = held.map((card): PurchasePick => {
    let pick: Omit<PurchasePick, 'card' | 'cents'> = { rate: card.base, source: 'base', cap: 0 };
    for (let c: CategoryId | undefined = cat; c; c = PARENT[c]) {
      const r = card.rates[c];
      if (r) {
        pick = { rate: r.rate, source: 'category', via: c, cap: r.cap ?? 0 };
        break;
      }
    }
    const b = brand && card.brands?.[brand];
    if (b && b.rate > pick.rate) pick = { rate: b.rate, source: 'brand', cap: b.cap ?? 0 };
    const rot = card.rotating;
    if (rot && rot.rate > pick.rate && (rot.categories.includes(cat) || (PARENT[cat] && rot.categories.includes(PARENT[cat]!))))
      pick = { rate: rot.rate, source: 'rotating', cap: rot.quarterlyCap };
    const accepted = accepts && card.network ? accepts.includes(card.network) : undefined;
    return { card, ...pick, cents: pick.rate * centsPerPoint(card, programs, mode), accepted };
  });
  // Cards the merchant won't take go last, whatever they would earn.
  return picks.sort(
    (a, b) =>
      Number(a.accepted === false) - Number(b.accepted === false) ||
      b.cents - a.cents ||
      Number(a.card.program !== 'cash') - Number(b.card.program !== 'cash'),
  );
}
