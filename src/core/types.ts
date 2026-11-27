import type { RotatingOffer } from './rotating';

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
/** Merchants whose own cards pay a bonus there (an airline, a hotel chain, a store). */
export const BRAND_IDS = [
  'delta', 'united', 'american', 'southwest', 'jetblue', 'aircanada', 'avios',
  'marriott', 'hilton', 'hyatt', 'ihg', 'wyndham', 'choice',
  'wholefoods', 'doordash', 'instacart', 'costcogas',
] as const;
export type BrandId = (typeof BRAND_IDS)[number];

export type Network = 'visa' | 'mastercard' | 'amex' | 'discover';

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
  /** This quarter's categories as read from the issuer's site, when the crawler has them. */
  offer?: RotatingOffer;
}

/** One tier of a pick-your-category card: `count` categories chosen from `options` earn `rate`. */
export interface ChoiceTier {
  rate: number;
  count: number;
  options: CategoryId[];
  /** Used until the cardholder picks. */
  defaults: CategoryId[];
  /** Yearly cap in dollars for each chosen category (a quarterly or monthly cap times 4 or 12). */
  cap?: number;
}

/** Cards where you choose the bonus categories (U.S. Bank Cash+), or the card picks your top one (Citi Custom Cash). */
export interface Choice {
  tiers: ChoiceTier[];
  /** The card applies its bonus to your top eligible category automatically. */
  auto?: boolean;
  /** How often the choice can change, for the wallet tile. */
  period: string;
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
  /** Bonus rates at one brand's own merchants (Delta flights, Hilton hotels). The better of this and the category rate applies. */
  brands?: Partial<Record<BrandId, Rate>>;
  rotating?: Rotating;
  choice?: Choice;
  /** Categories now earning a chosen-category rate, filled in when choices are applied. */
  picked?: CategoryId[];
  /** Payment network, where it is the same for every cardholder. */
  network?: Network;
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
