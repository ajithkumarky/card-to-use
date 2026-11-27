import { describe, expect, it } from 'vitest';
import { brandOf, categorize, merchantKey } from '../src/core/categories';
import { findMerchant, MERCHANTS } from '../src/core/merchants';
import { missingColumns, monthsCovered, parseAmount, parseDate, readTable, toTransactions } from '../src/core/parse';
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

describe('brands', () => {
  it('finds airline and hotel brands, and leaves look-alikes alone', () => {
    const b = (d: string) => brandOf(d, categorize(d, ''));
    expect(b('DELTA AIR LINES ATLANTA')).toBe('delta');
    expect(b('SOUTHWES 5262345678901')).toBe('southwest');
    expect(b('SOUTHWEST AIRLINES (526')).toBe('southwest');
    expect(b('SOUTHWEST GAS CORP')).toBeUndefined();
    expect(b('HAMPTON INN DENVER')).toBe('hilton');
    expect(b('COURTYARD BY MARRIOTT')).toBe('marriott');
    expect(b('HOLIDAY INN EXPRESS')).toBe('ihg');
    expect(b('WHOLEFDS MKT 10234')).toBe('wholefoods');
    expect(b('STARBUCKS')).toBeUndefined();
    expect(categorize('HAMPTON INN DENVER', '')).toBe('hotels');
    expect(categorize('SOUTHWEST GAS CORP', 'Utilities')).toBe('utilities');
  });
});

describe('what counts as a purchase', () => {
  const table = (rows: string[][]) => readTable([['Date', 'Description', 'Amount', 'Category', 'Card'], ...rows]);

  it('drops transfers, pay, interest and card fees', () => {
    const file = table([
      ['2026-09-01', 'STARBUCKS', '6.50', 'Food & Drink', 'Amex Gold'],
      ['2026-09-02', 'Online Transfer to Savings', '2000', '', 'Amex Gold'],
      ['2026-09-03', 'ZELLE TO JOHN', '150', '', 'Amex Gold'],
      ['2026-09-04', 'INTEREST CHARGE ON PURCHASES', '12', '', 'Amex Gold'],
      ['2026-09-05', 'ANNUAL MEMBERSHIP FEE', '325', 'Fees & Adjustments', 'Amex Gold'],
      ['2026-09-06', 'ACME CORP', '5000', 'Paycheck', 'Amex Gold'],
      ['2026-09-07', 'TRANSFERWISE', '40', 'Shopping', 'Amex Gold'],
    ]);
    expect(toTransactions(file).map((t) => t.description)).toEqual(['STARBUCKS', 'TRANSFERWISE']);
  });

  it('reads each card’s sign convention in a combined file', () => {
    const file = table([
      ['2026-09-01', 'CHASE PURCHASE 1', '-10', '', 'Freedom'],
      ['2026-09-02', 'CHASE PURCHASE 2', '-20', '', 'Freedom'],
      ['2026-09-03', 'CHASE PURCHASE 3', '-30', '', 'Freedom'],
      ['2026-09-04', 'CHASE PURCHASE 4', '-40', '', 'Freedom'],
      ['2026-09-05', 'AMEX PURCHASE 1', '15', '', 'Gold'],
      ['2026-09-06', 'AMEX PURCHASE 2', '25', '', 'Gold'],
      ['2026-09-07', 'AMEX REFUND', '-5', '', 'Gold'],
    ]);
    expect(toTransactions(file).map((t) => t.amount)).toEqual([10, 20, 30, 40, 15, 25, -5]);
  });
});

describe('merchant directory', () => {
  it('codes common chains the way issuers do', () => {
    const c = (d: string) => categorize(d, '');
    expect(c('TARGET 00012345')).toBe('other');
    expect(c('TARGET.COM')).toBe('online');
    expect(c('WAL-MART #1234')).toBe('other');
    expect(c('COSTCO WHSE #0412')).toBe('wholesale');
    expect(c('COSTCO GAS #0412')).toBe('gas');
    expect(c("ARBY'S #6012")).toBe('dining');
    expect(c('ARBYS 6012')).toBe('dining');
    expect(c('CHICK-FIL-A #01234')).toBe('dining');
    expect(c('KING SOOPERS #12')).toBe('groceries');
    expect(c('LOWES FOODS #22')).toBe('groceries');
    expect(c("LOWE'S #1234")).toBe('other');
    expect(c('PHILLIPS 66 - 12345')).toBe('gas');
    expect(c('CINEMARK 0412')).toBe('entertainment');
  });

  it('has no duplicate names and matches each name to itself', () => {
    const names = MERCHANTS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(400);
    for (const m of MERCHANTS) expect(findMerchant(m.name)?.name, m.name).toBe(m.name);
  });
});
