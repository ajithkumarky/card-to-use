import { describe, expect, it } from 'vitest';
import { advise, isBusinessCard, welcomeValue } from '../src/core/advisor';
import { libraryCards, programs } from '../src/core/catalog';
import { earnedWith } from '../src/core/recommend';

const card = (id: string) => libraryCards.find((c) => c.id === id)!;
// A household spending mostly on groceries and dining.
const spend = new Map([
  ['groceries', 12000],
  ['dining', 6000],
  ['gas', 2400],
  ['other', 8000],
]);

describe('advisor', () => {
  it('ranks cards to add by yearly value after fees, best first', () => {
    const a = advise({ spend, held: [card('citi-double-cash')], library: libraryCards, programs, mode: 'cash' });
    expect(a.adds.length).toBeGreaterThan(40);
    for (let i = 1; i < a.adds.length; i++) expect(a.adds[i - 1].ongoing).toBeGreaterThanOrEqual(a.adds[i].ongoing);
    expect(a.adds.some((s) => s.cards[0].id === 'citi-double-cash')).toBe(false);
    expect(a.adds.some((s) => isBusinessCard(s.cards[0]))).toBe(false);
    const top = a.adds[0];
    expect(top.ongoing).toBeCloseTo(top.extraRewards - top.cards[0].annualFee, 6);
  });

  it('counts a welcome offer only when your spending reaches the minimum in time', () => {
    const csp = card('chase-sapphire-preferred');
    // $28,400 a year is about $7,100 in 3 months: enough for $5,000.
    expect(welcomeValue(csp, 28400, 0, programs, 'cash')).toMatchObject({ value: 750, reachable: true });
    expect(welcomeValue(csp, 12000, 0, programs, 'cash')!.reachable).toBe(false);
    const a = advise({ spend: new Map([['other', 6000]]), held: [], library: [csp], programs, mode: 'cash' });
    expect(a.adds[0].firstYear).toBeCloseTo(a.adds[0].ongoing, 6);
  });

  it('finds wallets at least as good as any single card and flags fees that outweigh what a card adds', () => {
    const held = [card('citi-double-cash'), card('amex-platinum')];
    const a = advise({ spend, held, library: libraryCards, programs, mode: 'best' });
    const [two, three] = a.wallets;
    expect(two.cards).toHaveLength(2);
    expect(three.cards).toHaveLength(3);
    expect(three.ongoing).toBeGreaterThanOrEqual(two.ongoing - 1e-6);
    const bestAlone = Math.max(...libraryCards.filter((c) => !isBusinessCard(c)).map((c) => earnedWith(spend, [c], programs, 'best').total - c.annualFee));
    expect(two.ongoing).toBeGreaterThanOrEqual(bestAlone - 1e-6);
    const plat = a.keep.find((k) => k.card.id === 'amex-platinum')!;
    expect(plat.adds).toBeLessThan(plat.fee);
  });

  it('dates every welcome offer', () => {
    for (const c of libraryCards.filter((c) => c.bonus)) {
      expect(c.bonus!.asOf, c.id).toMatch(/^\d{4}-\d{2}$/);
      expect(c.bonus!.source, c.id).toMatch(/^https:\/\//);
      expect(c.bonus!.months, c.id).toBeGreaterThan(0);
    }
  });
});
