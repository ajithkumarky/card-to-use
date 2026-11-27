import { applyChoices } from './choices';
import { centsPerPoint, earnedWith, type Programs } from './recommend';
import { CATEGORY_IDS, type Card, type CategoryId, type PointMode } from './types';

/** Business cards need a business (a sole proprietorship counts), so they're left out unless asked for. */
export const isBusinessCard = (c: Card) => /business/i.test(c.name) || /^business card/i.test(c.notes ?? '');

export interface Welcome {
  /** Dollar value of the welcome offer at the chosen point value, including any credit. */
  value: number;
  /** Whether a year of your spending, at its usual pace, reaches the minimum in time. Undefined when there's no minimum. */
  reachable?: boolean;
  /** Your usual spending in the bonus window. */
  windowSpend: number;
}

export interface Suggestion {
  cards: Card[];
  /** Extra rewards a year over what you hold now (or over nothing, for a fresh wallet). */
  extraRewards: number;
  /** Extra annual fees. */
  extraFees: number;
  /** extraRewards minus extraFees: what it's worth every year. */
  ongoing: number;
  /** The first year: ongoing, plus welcome offers you'd reach, plus any first-year fee waiver. */
  firstYear: number;
  welcome?: Welcome;
}

export interface KeepOrCancel {
  card: Card;
  /** Rewards a year this card adds over what your other cards would earn on the same spending. */
  adds: number;
  fee: number;
}

export interface Advice {
  adds: Suggestion[];
  wallets: Suggestion[];
  current: { rewards: number; fees: number; net: number };
  keep: KeepOrCancel[];
}

interface AdviceInput {
  spend: Map<string, number>;
  held: Card[];
  library: Card[];
  programs: Programs;
  mode: PointMode;
  includeBusiness?: boolean;
}

/** Spend per top-level category, for picking the categories on choose-your-category cards. */
function spendByCategory(spend: Map<string, number>): Partial<Record<CategoryId, number>> {
  const out: Partial<Record<CategoryId, number>> = {};
  for (const [key, v] of spend) {
    const cat = key.split(':')[0] as CategoryId;
    if (CATEGORY_IDS.includes(cat)) out[cat] = (out[cat] ?? 0) + v;
  }
  return out;
}

export function welcomeValue(card: Card, yearlySpend: number, earnedOnCard: number, programs: Programs, mode: PointMode): Welcome | undefined {
  const b = card.bonus;
  if (!b) return undefined;
  const windowSpend = (yearlySpend / 12) * b.months;
  let value = (b.extraDollars ?? 0) + (b.unit === 'dollars' ? b.amount : b.unit === 'points' ? (b.amount * centsPerPoint(card, programs, mode)) / 100 : 0);
  // A cash-back match doubles what the card earns in its first year.
  if (b.unit === 'match') value += earnedOnCard;
  return { value, reachable: b.spend ? windowSpend >= b.spend : undefined, windowSpend };
}

function firstYearExtra(card: Card, w: Welcome | undefined): number {
  const waiver = card.bonus?.firstYearFee !== undefined ? card.annualFee - card.bonus.firstYearFee : 0;
  return (w && w.reachable !== false ? w.value : 0) + waiver;
}

/** The single best card to add, the best two- and three-card wallets, and held cards whose fee outweighs what they add. */
export function advise({ spend, held, library, programs, mode, includeBusiness = false }: AdviceInput): Advice {
  const cats = spendByCategory(spend);
  const yearlySpend = [...spend.values()].reduce((a, v) => a + v, 0);
  // Choose-your-category cards are tried with the categories where you spend most.
  const tune = (c: Card) => (c.choice ? applyChoices({ ...c, choice: { ...c.choice, auto: true } }, undefined, cats) : c);
  const heldIds = new Set(held.map((c) => c.id));
  const pool = library.filter((c) => !c.custom && (includeBusiness || !isBusinessCard(c) || heldIds.has(c.id))).map((c) => (heldIds.has(c.id) ? held.find((h) => h.id === c.id)! : tune(c)));
  const fees = (cards: Card[]) => cards.reduce((a, c) => a + c.annualFee, 0);

  const now = earnedWith(spend, held, programs, mode);
  const current = { rewards: now.total, fees: fees(held), net: now.total - fees(held) };

  // 1. One card to add.
  const adds: Suggestion[] = pool
    .filter((c) => !heldIds.has(c.id))
    .map((c) => {
      const withIt = earnedWith(spend, [...held, c], programs, mode);
      const extraRewards = withIt.total - now.total;
      const ongoing = extraRewards - c.annualFee;
      const welcome = welcomeValue(c, yearlySpend, withIt.byCard.get(c.id) ?? 0, programs, mode);
      return { cards: [c], extraRewards, extraFees: c.annualFee, ongoing, firstYear: ongoing + firstYearExtra(c, welcome), welcome };
    })
    .sort((a, b) => b.ongoing - a.ongoing);

  // 2. Best wallet of two or three cards from the whole catalog, searched among the cards that do well alone or lead a category you spend in.
  const alone = pool.map((c) => ({ c, net: earnedWith(spend, [c], programs, mode).total - c.annualFee })).sort((a, b) => b.net - a.net);
  const shortlist = new Map<string, Card>(alone.slice(0, 18).map(({ c }) => [c.id, c]));
  for (const key of [...spend.keys()].filter((k) => (spend.get(k) ?? 0) >= 100)) {
    const only = new Map([[key, spend.get(key)!]]);
    pool
      .map((c) => ({ c, v: earnedWith(only, [c], programs, mode).total - c.annualFee * 0.25 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .forEach(({ c }) => shortlist.set(c.id, c));
  }
  const list = [...shortlist.values()];
  const wallets: Suggestion[] = [];
  for (const size of [2, 3]) {
    let best: Suggestion | undefined;
    const tryWallet = (cards: Card[]) => {
      const e = earnedWith(spend, cards, programs, mode);
      const net = e.total - fees(cards);
      if (!best || net > best.ongoing) {
        const firstYear =
          net +
          cards
            .filter((c) => !heldIds.has(c.id))
            .reduce((a, c) => a + firstYearExtra(c, welcomeValue(c, yearlySpend, e.byCard.get(c.id) ?? 0, programs, mode)), 0);
        best = { cards, extraRewards: e.total, extraFees: fees(cards), ongoing: net, firstYear };
      }
    };
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        if (size === 2) tryWallet([list[i], list[j]]);
        else for (let k = j + 1; k < list.length; k++) tryWallet([list[i], list[j], list[k]]);
      }
    if (best) wallets.push(best);
  }

  // 3. Held cards with a fee: what each adds over the rest of the wallet.
  const keep: KeepOrCancel[] = held
    .filter((c) => c.annualFee > 0)
    .map((c) => ({ card: c, adds: now.total - earnedWith(spend, held.filter((h) => h.id !== c.id), programs, mode).total, fee: c.annualFee }));

  return { adds, wallets, current, keep };
}
