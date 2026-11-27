import { describe, expect, it } from 'vitest';
import { categorize, merchantKey } from '../src/core/categories';
import { missingColumns, monthsCovered, parseAmount, parseDate, readTable } from '../src/core/parse';
import { loadFixture } from './helpers';

describe('bank exports', () => {
  it('reads Chase: negative purchases, drops payments, keeps returns as refunds', () => {
    const { file, txns } = loadFixture('chase.csv');
    expect(file.purchasesNegative).toBe(true);
    expect(file.headers[file.columns.date]).toBe('Transaction Date');
    expect(txns.map((t) => t.amount)).toEqual([84.1, 15.2, 23.4, 31, 45.99, -12]);
    expect(txns[0].date?.toISOString().slice(0, 10)).toBe('2026-11-02');
  });

  it('reads Amex: positive purchases, finds the account column as the card', () => {
    const { file, txns } = loadFixture('amex.csv');
    expect(file.purchasesNegative).toBe(false);
    expect(txns).toHaveLength(2);
    expect(file.headers[file.columns.card]).toBe('Account #');
  });

  it('reads Citi debit and credit columns', () => {
    const { file, txns } = loadFixture('citi.csv');
    expect(file.columns.debit).toBe(3);
    expect(file.columns.credit).toBe(4);
    expect(txns.map((t) => [t.description, t.amount])).toEqual([
      ['TRADER JOE S #552', 62.1],
      ['NETFLIX.COM', 15.49],
      ['TARGET.COM REFUND', -20],
    ]);
  });

  it('reads Capital One with card numbers and drops payment rows', () => {
    const { file, txns } = loadFixture('capitalone.csv');
    expect(file.headers[file.columns.card]).toBe('Card No.');
    expect(txns.map((t) => t.cardLabel)).toEqual(['1234', '5678']);
  });

  it('reads Discover and drops rows the bank labels as payments', () => {
    const { file, txns } = loadFixture('discover.csv');
    expect(file.headers[file.columns.date]).toBe('Trans. Date');
    expect(txns).toHaveLength(1);
  });

  it('reports missing columns instead of guessing', () => {
    const file = readTable([['When', 'What', 'Value'], ['2026-11-02', 'Shop', '12']]);
    expect(missingColumns(file.columns)).toEqual(['description', 'amount']);
  });

  it('skips title rows above the header', () => {
    const file = readTable([['Account summary'], [''], ['Date', 'Description', 'Amount'], ['2026-01-01', 'Shell', '10']]);
    expect(file.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(file.rows).toHaveLength(1);
  });
});

describe('values', () => {
  it('parses money formats', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56);
    expect(parseAmount('(12.00)')).toBe(-12);
    expect(parseAmount('-$5')).toBe(-5);
    expect(parseAmount('')).toBe(0);
  });
  it('parses US, ISO and Excel dates', () => {
    expect(parseDate('11/02/26')?.toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(parseDate('2026-11-02')?.toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(parseDate(46328)?.toISOString().slice(0, 10)).toBe('2026-11-02');
  });
  it('counts months covered', () => {
    const { txns } = loadFixture('combined-with-card.csv');
    expect(monthsCovered(txns)).toBe(3);
  });
});

describe('categories', () => {
  it.each([
    ['WHOLEFDS MKT 10234', 'Groceries', 'groceries'],
    ['UBER   *EATS', '', 'dining'],
    ['UBER   *TRIP', 'Travel', 'transit'],
    ['COSTCO WHSE #0412', 'Merchandise', 'wholesale'],
    ['AMAZON MKTPL*2K4L1', 'Shopping', 'amazon'],
    ['DELTA AIR LINES', 'Airfare', 'airfare'],
    ['SHELL OIL 5744', 'Transportation-Fuel', 'gas'],
    ['NETFLIX.COM', '', 'streaming'],
    ['JOE SMITH LLC', 'Restaurant-Restaurant', 'dining'],
    ['ACME HARDWARE', '', 'other'],
  ])('%s -> %s', (desc, bank, cat) => {
    expect(categorize(desc, bank)).toBe(cat);
  });
  it('lets a merchant fix override every rule', () => {
    expect(categorize('STARBUCKS STORE 08812', '', { [merchantKey('STARBUCKS STORE 1')]: 'groceries' })).toBe('groceries');
  });
});
