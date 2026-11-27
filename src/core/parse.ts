import { NOT_PURCHASE_CATEGORY, NOT_PURCHASE_PATTERN, PAYMENT_PATTERN } from './categories';
import type { Transaction } from './types';

export type Cell = string | number | boolean | Date | null | undefined;
export type Table = Cell[][];

export interface ColumnMap {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  category: number;
  card: number;
}

export interface ParsedFile {
  headers: string[];
  rows: Table;
  columns: ColumnMap;
  /** True when purchases are negative numbers in the amount column (Chase style). */
  purchasesNegative: boolean;
  /**
   * The same guess made per card label, for files that combine exports from banks with different sign conventions.
   * Used while the file-wide setting is left as guessed.
   */
  negativeByCard: Record<string, boolean>;
}

const HEADER_WORDS = /date|desc|merchant|payee|amount|debit|credit|categ|card|account|name|memo|details/i;

const text = (c: Cell): string => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? '')).trim();

/** Picks the header row: the row near the top with the most header-like words. */
function findHeaderRow(table: Table): number {
  let best = 0;
  let bestScore = -1;
  table.slice(0, 15).forEach((row, i) => {
    const score = row.filter((c) => HEADER_WORDS.test(text(c))).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function guessColumns(headers: string[]): ColumnMap {
  const find = (re: RegExp, not?: RegExp) => headers.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const firstOf = (...idx: number[]) => idx.find((i) => i >= 0) ?? -1;
  const debit = find(/^debit|debit amount|^charges?$/i);
  return {
    date: firstOf(find(/trans.*date/i), find(/^date$/i), find(/date/i, /post/i), find(/date/i)),
    description: firstOf(find(/desc/i), find(/merchant|payee/i), find(/^name$|details|memo/i)),
    amount: debit >= 0 ? find(/^amount$|amount/i, /debit|credit/i) : find(/amount|amt/i),
    debit,
    credit: find(/^credit|credit amount/i, /card/i),
    category: find(/categ/i),
    card: firstOf(find(/^card$|card name|card used|card no|card number|last ?4/i, /member/i), find(/account/i)),
  };
}

export function parseAmount(c: Cell): number {
  if (typeof c === 'number') return c;
  const s = text(c);
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[$\s]/g, '')) || /\bcr\b/i.test(s);
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export function parseDate(c: Cell): Date | null {
  if (c instanceof Date) return isNaN(+c) ? null : c;
  if (typeof c === 'number' && c > 20000 && c < 80000) return new Date(Date.UTC(1899, 11, 30) + c * 864e5);
  const s = text(c);
  if (!s) return null;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const y = +us[3] < 100 ? 2000 + +us[3] : +us[3];
    return new Date(Date.UTC(y, +us[1] - 1, +us[2]));
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

/** Signed amount as written in the file: positive means money out, before any sign flip. */
function rawAmount(row: Cell[], cols: ColumnMap): number {
  if (cols.debit >= 0 || cols.credit >= 0) {
    const debit = cols.debit >= 0 ? Math.abs(parseAmount(row[cols.debit])) : 0;
    const credit = cols.credit >= 0 ? Math.abs(parseAmount(row[cols.credit])) : 0;
    if (debit || credit) return debit - credit;
  }
  return cols.amount >= 0 ? parseAmount(row[cols.amount]) : 0;
}

export function readTable(table: Table): ParsedFile {
  const h = findHeaderRow(table);
  const headers = (table[h] ?? []).map(text);
  const rows = table.slice(h + 1).filter((r) => r.some((c) => text(c) !== ''));
  const columns = guessColumns(headers);
  const usesSeparateColumns = columns.debit >= 0 || columns.credit >= 0;
  let purchasesNegative = false;
  const negativeByCard: Record<string, boolean> = {};
  if (!usesSeparateColumns && columns.amount >= 0) {
    const mostlyNegative = (rs: Table) => {
      const values = rs
        .filter((r) => !PAYMENT_PATTERN.test(text(r[columns.description])))
        .map((r) => parseAmount(r[columns.amount]))
        .filter(Boolean);
      return values.filter((v) => v < 0).length > values.length / 2;
    };
    purchasesNegative = mostlyNegative(rows);
    if (columns.card >= 0) {
      const byCard = new Map<string, Table>();
      for (const r of rows) byCard.set(text(r[columns.card]), [...(byCard.get(text(r[columns.card])) ?? []), r]);
      // Only labels with a few rows give a reliable guess.
      for (const [label, rs] of byCard) if (rs.length >= 3) negativeByCard[label] = mostlyNegative(rs);
    }
  }
  return { headers, rows, columns, purchasesNegative, negativeByCard };
}

export function missingColumns(cols: ColumnMap): string[] {
  const missing: string[] = [];
  if (cols.description < 0) missing.push('description');
  if (cols.amount < 0 && cols.debit < 0) missing.push('amount');
  return missing;
}

export function toTransactions(file: ParsedFile, cols = file.columns, purchasesNegative = file.purchasesNegative): Transaction[] {
  if (missingColumns(cols).length) return [];
  const separate = cols.debit >= 0 || cols.credit >= 0;
  const out: Transaction[] = [];
  for (const row of file.rows) {
    const description = text(row[cols.description]);
    const bankCategory = cols.category >= 0 ? text(row[cols.category]) : '';
    if (PAYMENT_PATTERN.test(description) || NOT_PURCHASE_PATTERN.test(description) || NOT_PURCHASE_CATEGORY.test(bankCategory)) continue;
    let amount = rawAmount(row, cols);
    const label = cols.card >= 0 ? text(row[cols.card]) : '';
    // A combined file can mix sign conventions; trust each card's own guess unless the person changed the setting.
    const negative = purchasesNegative === file.purchasesNegative && cols === file.columns ? (file.negativeByCard[label] ?? purchasesNegative) : purchasesNegative;
    if (!separate && negative) amount = -amount;
    if (!amount) continue;
    out.push({
      date: cols.date >= 0 ? parseDate(row[cols.date]) : null,
      description,
      amount,
      bankCategory,
      cardLabel: label,
    });
  }
  return out;
}

/** Months covered by the transactions, to the nearest tenth, at least 1. */
export function monthsCovered(txns: Transaction[]): number {
  const times = txns.map((t) => t.date?.getTime()).filter((t): t is number => t !== undefined);
  if (times.length < 2) return 1;
  const days = (Math.max(...times) - Math.min(...times)) / 864e5 + 1;
  return Math.max(1, Math.round((days / 30.44) * 10) / 10);
}
