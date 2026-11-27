export const CATEGORY_IDS = [
  'dining', 'groceries', 'gas', 'airfare', 'hotels', 'travel', 'transit', 'streaming',
  'entertainment', 'drugstore', 'amazon', 'online', 'wholesale', 'utilities', 'other',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const PROGRAM_IDS = [
  'ur', 'mr', 'ty', 'c1', 'bilt', 'wf', 'usb', 'bofa',
  'delta', 'united', 'aa', 'southwest', 'jetblue', 'aeroplan', 'avios',
  'marriott', 'hilton', 'hyatt', 'ihg', 'wyndham', 'choice', 'cash',
] as const;
export type ProgramId = (typeof PROGRAM_IDS)[number];
export type PointMode = 'best' | 'cash';

export interface Program {
  id: ProgramId;
  name: string;
  /** Cents per point at a realistic best redemption, such as transfers to partners or award stays (published estimate). */
  bestCents: number;
  /** Cents per point when cashed out or used as a statement credit, or for airline and hotel programs a typical low-effort redemption. */
  cashCents: number;
}

export interface Rate {
  /** Points per dollar, or percent cash back for cash programs. */
  rate: number;
  /** Yearly spending cap in dollars for this rate; above it the base rate applies. */
  cap?: number;
}

export interface Rotating {
  rate: number;
  quarterlyCap: number;
  quarter: string;
  categories: CategoryId[];
}

export interface Card {
  id: string;
  name: string;
  issuer: string;
  annualFee: number;
  apr: string;
  program: ProgramId;
  base: number;
  rates: Partial<Record<CategoryId, Rate>>;
  rotating?: Rotating;
  color: string;
  light?: boolean;
  /** Lowercase words that identify this card in a bank export's card column. */
  aliases: string[];
  notes?: string;
  custom?: boolean;
}

export interface Catalog {
  asOf: string;
  programs: Program[];
  cards: Card[];
}

export interface Transaction {
  date: Date | null;
  description: string;
  /** Positive for purchases, negative for refunds. Payments are removed. */
  amount: number;
  bankCategory: string;
  cardLabel: string;
}
