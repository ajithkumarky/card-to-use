import { describe, expect, it } from 'vitest';
import { libraryCards, programs } from '../src/core/catalog';
import { buildPlan, rateFor, rotatingBonus } from '../src/core/recommend';
import type { Transaction } from '../src/core/types';
import { loadFixture } from './helpers';

const card = (id: string) => libraryCards.find((c) => c.id === id)!;
const tx = (description: string, amount: number, cardLabel = ''): Transaction => ({ date: null, description, amount, bankCategory: '', cardLabel });

describe('rates', () => {
  it('falls back from flights to travel to base', () => {
    expect(rateFor(card('chase-sapphire-preferred'), 'airfare').rate).toBe(2);
    expect(rateFor(card('chase-freedom-unlimited'), 'airfare').rate).toBe(1.5);
  });
});

describe('plan', () => {
  it('picks the card that pays most per dollar at best point values', () => {
    const plan = buildPlan({
      transactions: [tx('THE CORNER BISTRO', 100)],
      months: 12,
      held: [card('amex-gold'), card('citi-double-cash')],
      programs,
      mode: 'best',
    });
    expect(plan.categories[0].segments[0].card.id).toBe('amex-gold');
    expect(plan.total).toBeCloseTo(8, 5);
  });

  it('switches when points are valued at cash-out', () => {
    const plan = buildPlan({
      transactions: [tx('ACME HARDWARE', 100)],
      months: 12,
      held: [card('amex-gold'), card('citi-double-cash')],
      programs,
      mode: 'cash',
    });
    expect(plan.categories[0].segments[0].card.id).toBe('citi-double-cash');
  });

  it('moves spending past a cap to the next best card', () => {
    const plan = buildPlan({
      transactions: [tx('SAFEWAY 1234', 10000)],
      months: 12,
      held: [card('amex-blue-cash-preferred'), card('citi-double-cash')],
      programs,
      mode: 'best',
    });
    const segs = plan.categories[0].segments;
    expect(segs.map((s) => [s.card.id, s.spend])).toEqual([
      ['amex-blue-cash-preferred', 6000],
      ['citi-double-cash', 4000],
    ]);
    expect(plan.total).toBeCloseTo(360 + 80, 5);
  });

  it('annualizes from the months covered', () => {
    const plan = buildPlan({ transactions: [tx('ACME', 100)], months: 3, held: [card('citi-double-cash')], programs, mode: 'best' });
    expect(plan.categories[0].yearlySpend).toBe(400);
  });

  it('compares against the cards actually used when the file has a card column', () => {
    const { txns } = loadFixture('combined-with-card.csv');
    const plan = buildPlan({
      transactions: txns,
      months: 3,
      held: [card('amex-gold'), card('chase-freedom-unlimited'), card('citi-double-cash')],
      programs,
      mode: 'best',
    });
    expect(plan.baselineKind).toBe('actual');
    expect(plan.matchedShare).toBe(1);
    expect(plan.total).toBeGreaterThan(plan.baseline);
  });

  it('uses card labels the person mapped, like last-four numbers', () => {
    const plan = buildPlan({
      transactions: [tx('THE CORNER BISTRO', 100, '1234')],
      months: 12,
      held: [card('amex-gold'), card('citi-double-cash')],
      programs,
      mode: 'best',
      cardLabels: { '1234': 'citi-double-cash' },
    });
    expect(plan.baseline).toBeCloseTo(2, 5);
    expect(plan.matchedShare).toBe(1);
  });

  it('ignores a card column when no label matches a held card', () => {
    const plan = buildPlan({ transactions: [tx('ACME', 100, '1234')], months: 12, held: [card('citi-double-cash')], programs, mode: 'best' });
    expect(plan.baselineKind).toBe('single');
  });

  it('falls back to the single best card when there is no card column', () => {
    const plan = buildPlan({
      transactions: [tx('THE CORNER BISTRO', 100), tx('ACME', 100)],
      months: 12,
      held: [card('amex-gold'), card('citi-double-cash')],
      programs,
      mode: 'best',
    });
    expect(plan.baselineKind).toBe('single');
    expect(plan.singleBest?.card.id).toBe('amex-gold');
  });

  it('reports each card net of its fee', () => {
    const plan = buildPlan({ transactions: [tx('ACME', 100)], months: 12, held: [card('amex-platinum'), card('citi-double-cash')], programs, mode: 'best' });
    expect(plan.cards.find((c) => c.card.id === 'amex-platinum')!.net).toBe(-895);
  });

  it('estimates the rotating 5% bonus over the planned card, capped per quarter', () => {
    const flex = { ...card('chase-freedom-flex'), rotating: { ...card('chase-freedom-flex').rotating!, categories: ['amazon' as const] } };
    const plan = buildPlan({ transactions: [tx('AMAZON.COM', 12000)], months: 12, held: [flex, card('citi-double-cash')], programs, mode: 'cash' });
    // 3000 a quarter, capped at 1500, 5% vs Double Cash's 2%.
    expect(rotatingBonus(flex, plan, programs, 'cash')).toBeCloseTo(45, 5);
  });
});
