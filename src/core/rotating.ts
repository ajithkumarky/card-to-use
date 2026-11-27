import { CATEGORY_IDS, type CategoryId } from './types';

/**
 * This quarter's 5% categories for rotating cards, read from the issuers' own pages.
 * The Worker's cron (worker/index.ts) fetches the pages and stores a RotatingFeed in KV; the app
 * reads it from /api/rotating and falls back to the copy bundled in src/data/rotating.json.
 * Everything here is pure so it runs the same in the Worker, the browser and the tests.
 */

export interface RotatingOffer {
  /** Calendar quarter, like "2026-Q4". */
  quarter: string;
  /** First and last day, YYYY-MM-DD. */
  start: string;
  end: string;
  /** The issuer's own wording, like "Restaurants, Entertainment and Utilities". */
  title: string;
  /** Parts of the title that match the app's spending categories. */
  categories: CategoryId[];
  /** Parts that don't, such as "Home Improvement Stores" or "American Red Cross". Shown, not counted. */
  extras: string[];
  /** Last day to activate, YYYY-MM-DD, when the issuer says. */
  activateBy?: string;
  source: string;
}

export interface SourceStatus {
  source: SourceId;
  ok: boolean;
  /** Quarters read on this run. */
  found: string[];
  error?: string;
}

export interface RotatingFeed {
  /** When the crawler last ran, ISO time. */
  checkedAt: string;
  /** When an offer last changed, ISO time. */
  changedAt: string;
  /** Offers by card id, oldest quarter first. */
  offers: Record<string, RotatingOffer[]>;
  status?: SourceStatus[];
}

export type SourceId = 'discover' | 'chase-freedom';

export const SOURCES: Record<SourceId, { name: string; cards: string[]; page: string }> = {
  discover: { name: 'Discover 5% calendar', cards: ['discover-it'], page: 'https://www.discover.com/credit-cards/cash-back/cashback-calendar.html' },
  'chase-freedom': {
    name: 'Chase Freedom press release',
    cards: ['chase-freedom-flex'],
    page: 'https://www.chase.com/personal/credit-cards/education/rewards-benefits/guide-to-chase-freedom-flex-rotating-bonus-categories',
  },
};

/** The issuer page where a person can read a crawled card's categories themselves. */
export const issuerPage = (cardId: string) => Object.values(SOURCES).find((s) => s.cards.includes(cardId))?.page;

export const DISCOVER_PAGE = 'https://www.discover.com/credit-cards/cash-back/cashback-calendar.html';
export const DISCOVER_URL = 'https://card.discover.com/cardissuer/public/rewards/offer/v1/offer-categories';

export const chaseUrl = (quarter: string) => {
  const [y, q] = quarter.split('-Q');
  return `https://media.chase.com/news/chase-freedom-${y}-q${q}-categories`;
};

// ---- Quarters ----

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function quarterOf(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** The quarter in the person's own time zone, for the app. */
export function localQuarter(d: Date = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function nextQuarter(q: string): string {
  const [y, n] = q.split('-Q').map(Number);
  return n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`;
}

export function quarterBounds(q: string): { start: string; end: string } {
  const [y, n] = q.split('-Q').map(Number);
  const m = (n - 1) * 3 + 1;
  const last = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return { start: iso(y, m, 1), end: iso(y, m + 2, last) };
}

export function quarterLabel(q: string): string {
  const [y, n] = q.split('-Q');
  return `Q${n} ${y}`;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "October 01, 2026" or "December 14th, 2026" → "2026-10-01". */
export function parseLongDate(s: string): string | null {
  const m = s.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase()) && m[1].length >= 3);
  const day = Number(m[2]);
  if (month < 0 || day < 1 || day > 31) return null;
  return iso(Number(m[3]), month + 1, day);
}

// ---- Turning the issuer's words into categories ----

/** Checked in order; the first match wins. null means "show it, but it isn't one of our categories". */
const TERMS: [RegExp, CategoryId | null][] = [
  [/whole foods|chase travel|walmart|target|paypal|donation|red cross|heart association|united way|feeding america|cruise|home improvement|department store/, null],
  [/grocer|supermarket/, 'groceries'],
  [/wholesale|warehouse club/, 'wholesale'],
  [/restaurant|dining/, 'dining'],
  [/gas station|\bgas\b|ev charging|electric vehicle/, 'gas'],
  [/transit|transportation|rideshare/, 'transit'],
  [/streaming/, 'streaming'],
  [/entertainment/, 'entertainment'],
  [/drug ?store|pharmac/, 'drugstore'],
  [/utilit/, 'utilities'],
  [/\bamazon\b/, 'amazon'],
  [/flight|airline|airfare/, 'airfare'],
  [/hotel/, 'hotels'],
];

/** Splits an issuer title like "Grocery Stores, Wholesale Clubs, and Select Streaming Services" into its parts. */
export function splitTitle(title: string): string[] {
  return title
    .replace(/\s+/g, ' ')
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)
    .map((s) => s.replace(/^(?:supporting|donations to)\s+(?:the\s+)?/i, '').replace(/[.®™]/g, '').trim())
    .filter(Boolean);
}

export function mapTitle(title: string): { categories: CategoryId[]; extras: string[] } {
  const categories: CategoryId[] = [];
  const extras: string[] = [];
  for (const part of splitTitle(title)) {
    const hit = TERMS.find(([re]) => re.test(part.toLowerCase()));
    const cat = hit ? hit[1] : null;
    if (cat) {
      if (!categories.includes(cat)) categories.push(cat);
    } else if (!extras.includes(part)) extras.push(part);
  }
  return { categories, extras };
}

// ---- Sanity checks: a bad scrape never replaces good data ----

export function checkOffer(o: RotatingOffer): string | null {
  if (!/^\d{4}-Q[1-4]$/.test(o.quarter)) return `bad quarter "${o.quarter}"`;
  const b = quarterBounds(o.quarter);
  if (o.start !== b.start || o.end !== b.end) return `${o.quarter} dates ${o.start}–${o.end} don't match the quarter`;
  if (o.title.length < 3 || o.title.length > 200 || /[<>{}]/.test(o.title)) return `odd title "${o.title.slice(0, 80)}"`;
  if (!o.categories.length && !o.extras.length) return `${o.quarter} has no categories`;
  if (o.categories.length + o.extras.length > 8) return `${o.quarter} has too many categories`;
  if (o.categories.some((c) => !CATEGORY_IDS.includes(c) || c === 'other')) return `${o.quarter} has an unknown category`;
  if (o.extras.some((e) => e.length > 80)) return `${o.quarter} has an odd category name`;
  if (o.activateBy && !(/^\d{4}-\d{2}-\d{2}$/.test(o.activateBy) && o.activateBy <= o.end)) return `${o.quarter} has an odd activation date`;
  return null;
}

// ---- Discover: the JSON the calendar page itself loads ----

interface DiscoverQuarter {
  title?: unknown;
  quarterLabelStartDate?: unknown;
  quarterLabelEndDate?: unknown;
}

export function parseDiscover(json: unknown): RotatingOffer[] {
  const quarters = (json as { quarters?: DiscoverQuarter[] })?.quarters;
  if (!Array.isArray(quarters) || !quarters.length) throw new Error('Discover: no quarters in the calendar data');
  const out: RotatingOffer[] = [];
  for (const q of quarters) {
    if (typeof q.title !== 'string' || typeof q.quarterLabelStartDate !== 'string' || typeof q.quarterLabelEndDate !== 'string') continue;
    const start = parseLongDate(q.quarterLabelStartDate);
    const end = parseLongDate(q.quarterLabelEndDate);
    if (!start || !end) continue;
    const quarter = quarterOf(new Date(`${start}T12:00:00Z`));
    const title = q.title.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    out.push({ quarter, start, end, title, ...mapTitle(title), source: DISCOVER_PAGE });
  }
  if (!out.length) throw new Error('Discover: the calendar data had no readable quarters');
  return out;
}

// ---- Chase: the quarterly press release, which is plain server-rendered HTML ----

const decode = (s: string) =>
  s
    .replace(/&reg;|&#174;/g, '®')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&#8217;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');

/** Returns null when Chase hasn't published that quarter yet (the caller treats a 404 the same way). */
export function parseChase(html: string, quarter: string, url = chaseUrl(quarter)): RotatingOffer | null {
  const raw =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)?.[1] ?? html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const heading = decode(raw).replace(/\s+/g, ' ').trim();
  if (/page not found/i.test(heading)) return null;
  const m = heading.match(/\bQ([1-4])\s+(\d{4})\b[^:]*?Categories:\s*(.+)$/i);
  if (!m) throw new Error(`Chase ${quarter}: no categories in the headline "${heading.slice(0, 120)}"`);
  const found = `${m[2]}-Q${m[1]}`;
  if (found !== quarter) throw new Error(`Chase ${quarter}: the page is about ${found}`);
  const title = m[3].replace(/\s*\|.*$/, '').trim();
  const text = decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
  const act = text.match(/have until ([A-Z][a-z]+\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}),? to activate/);
  const activateBy = act ? parseLongDate(act[1]) ?? undefined : undefined;
  return { quarter, ...quarterBounds(quarter), title, ...mapTitle(title), ...(activateBy ? { activateBy } : {}), source: url };
}

// ---- Combining runs ----

/**
 * Adds this run's offers to the previous feed. Offers that fail checkOffer are dropped and reported,
 * so the previous value for that quarter stays. Quarters that ended more than a quarter ago are pruned.
 */
export function mergeFeed(
  prev: RotatingFeed | null,
  fresh: Record<string, RotatingOffer[]>,
  status: SourceStatus[],
  now: Date,
): { feed: RotatingFeed; changed: boolean; rejected: string[] } {
  const rejected: string[] = [];
  const offers: Record<string, RotatingOffer[]> = {};
  const keepFrom = quarterBounds(quarterOf(new Date(now.getTime() - 92 * 864e5))).start;
  const ids = new Set([...Object.keys(prev?.offers ?? {}), ...Object.keys(fresh)]);
  for (const id of ids) {
    const byQuarter = new Map((prev?.offers[id] ?? []).map((o) => [o.quarter, o]));
    for (const o of fresh[id] ?? []) {
      const problem = checkOffer(o);
      if (problem) rejected.push(`${id}: ${problem}`);
      else byQuarter.set(o.quarter, o);
    }
    const list = [...byQuarter.values()].filter((o) => o.end >= keepFrom).sort((a, b) => a.quarter.localeCompare(b.quarter));
    if (list.length) offers[id] = list;
  }
  const changed = JSON.stringify(offers) !== JSON.stringify(prev?.offers ?? {});
  const at = now.toISOString();
  return { feed: { checkedAt: at, changedAt: changed || !prev ? at : prev.changedAt, offers, status }, changed, rejected };
}

/** The offer for a card in a given quarter, if the feed has one. */
export function offerFor(feed: RotatingFeed | null, cardId: string, quarter: string): RotatingOffer | undefined {
  return feed?.offers[cardId]?.find((o) => o.quarter === quarter);
}

export interface Staleness {
  /** The quarter the app needs, like "2027-Q1". */
  quarter: string;
  /** The newest offer the feed does have for this card, from an earlier quarter. */
  lastOffer?: RotatingOffer;
  /** When the crawler last ran, ISO time. */
  checkedAt: string;
}

/**
 * Set when a crawled card has no categories for this quarter: the issuer hasn't been read since the
 * quarter changed (the crawl is failing, or the issuer's page moved). The app then warns and asks for ticks.
 */
export function staleness(feed: RotatingFeed, cardId: string, quarter: string): Staleness | undefined {
  if (!crawledCards.has(cardId) || offerFor(feed, cardId, quarter)) return undefined;
  const lastOffer = (feed.offers[cardId] ?? []).filter((o) => o.quarter < quarter).pop();
  return { quarter, lastOffer, checkedAt: feed.checkedAt };
}

const crawledCards = new Set(Object.values(SOURCES).flatMap((s) => s.cards));

/** Loose shape check for a feed fetched over the network. */
export function isFeed(v: unknown): v is RotatingFeed {
  const f = v as RotatingFeed;
  return !!f && typeof f === 'object' && typeof f.checkedAt === 'string' && !!f.offers && typeof f.offers === 'object' &&
    Object.values(f.offers).every((list) => Array.isArray(list) && list.every((o) => !checkOffer(o)));
}
