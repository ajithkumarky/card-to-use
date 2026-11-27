import type { CategoryId } from './types';

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  dining: 'Dining',
  groceries: 'Groceries',
  gas: 'Gas and EV charging',
  airfare: 'Flights',
  hotels: 'Hotels',
  travel: 'Other travel',
  transit: 'Rideshare and transit',
  streaming: 'Streaming',
  entertainment: 'Entertainment',
  drugstore: 'Drugstores',
  amazon: 'Amazon',
  online: 'Online shopping',
  wholesale: 'Warehouse clubs',
  utilities: 'Bills and utilities',
  other: 'Everything else',
};

/** When a card has no rate for a category, the parent category's rate applies before the base rate. */
export const PARENT: Partial<Record<CategoryId, CategoryId>> = {
  airfare: 'travel',
  hotels: 'travel',
  transit: 'travel',
  amazon: 'online',
};

/** Merchant name patterns, checked in order. Specific merchants come before broad words. */
const MERCHANT_RULES: [RegExp, CategoryId][] = [
  [/uber\W*eats|doordash|grubhub|seamless|postmates/, 'dining'],
  [/amazon|amzn/, 'amazon'],
  [/costco|sam'?s\s*club|bj'?s\s*wholesale/, 'wholesale'],
  [/netflix|spotify|hulu|disney\s*\+|disneyplus|hbo|max\.com|youtube\s*(premium|tv)|apple\s*music|peacock|paramount|sirius/, 'streaming'],
  [/\buber\b|lyft|\bmta\b|metro|transit|bart\b|clipper|parking|toll|e-?zpass|fastrak/, 'transit'],
  [/airline|airways|delta air|united air|american air|southwest|jetblue|alaska air|spirit air|frontier/, 'airfare'],
  [/marriott|hilton|hyatt|\bihg\b|holiday inn|westin|sheraton|airbnb|vrbo|hotel|motel|resort/, 'hotels'],
  [/expedia|booking\.com|priceline|hertz|avis|enterprise rent|national car|amtrak|cruise/, 'travel'],
  [/whole\s*foods|wholefds|trader joe|safeway|kroger|publix|aldi|wegmans|h-e-b|\bheb\b|grocery|sprouts|albertsons|food lion|giant eagle|harris teeter|meijer|instacart/, 'groceries'],
  [/shell|chevron|exxon|mobil|valero|arco|sunoco|speedway|wawa|citgo|marathon petro|fuel|supercharg|chargepoint|electrify america|\bbp\b|quiktrip|racetrac|circle k/, 'gas'],
  [/restaurant|cafe|coffee|starbucks|dunkin|mcdonald|chipotle|pizza|taco|sushi|burger|bistro|diner|bakery|panera|sweetgreen|chick-fil|wendy|subway|kitchen|grill/, 'dining'],
  [/ticketmaster|\bamc\b|regal|cinema|theat(er|re)|stubhub|live nation|bowling|museum/, 'entertainment'],
  [/cvs|walgreens|rite aid|pharmacy/, 'drugstore'],
  [/comcast|xfinity|verizon|at&t|t-mobile|spectrum|pg&e|con ?ed|electric|utilit|water dept|internet/, 'utilities'],
  [/etsy|ebay|wayfair|target\.com|walmart\.com|best buy\.com|shopify/, 'online'],
];

/** Bank category names (Chase, Amex, Capital One, Discover, Citi) to our categories. */
const BANK_RULES: [RegExp, CategoryId][] = [
  [/restaurant|dining|food\s*&\s*drink|fast food|\bbars?\b|caf/, 'dining'],
  [/grocer|supermarket/, 'groceries'],
  [/gas|fuel/, 'gas'],
  [/airline|air travel|airfare/, 'airfare'],
  [/hotel|lodging/, 'hotels'],
  [/rideshare|taxi|parking|transport|transit/, 'transit'],
  [/travel/, 'travel'],
  [/entertain/, 'entertainment'],
  [/pharma|drug/, 'drugstore'],
  [/utilit|bills|phone|internet|cable/, 'utilities'],
];

export const PAYMENT_PATTERN = /payment|autopay|thank you|pymt|\bpmt\b|balance transfer/i;

/** A short, stable key that groups a merchant's transactions ("STARBUCKS STORE 08812" -> "starbucks store"). */
export function merchantKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[#*\d]+/g, ' ')
    .replace(/[^a-z&'.+ -]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

export function categorize(
  description: string,
  bankCategory: string,
  overrides: Record<string, CategoryId> = {},
): CategoryId {
  const key = merchantKey(description);
  if (overrides[key]) return overrides[key];
  const d = description.toLowerCase();
  for (const [re, cat] of MERCHANT_RULES) if (re.test(d)) return cat;
  const b = bankCategory.toLowerCase();
  for (const [re, cat] of BANK_RULES) if (re.test(b)) return cat;
  return 'other';
}
