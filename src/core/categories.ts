import type { BrandId, CategoryId } from './types';

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

/** Brand names, the purchases they cover, and their category. Checked before the merchant rules. */
export const BRANDS: Record<BrandId, { name: string; pattern: RegExp; category: CategoryId }> = {
  delta: { name: 'Delta', pattern: /delta air|delta\.com|\bdelta\s+\d{6,}/, category: 'airfare' },
  united: { name: 'United', pattern: /united air|united\.com|\bunited\s+\d{6,}/, category: 'airfare' },
  american: { name: 'American Airlines', pattern: /american air|\baa\.com|aa inflight|admirals club/, category: 'airfare' },
  southwest: { name: 'Southwest', pattern: /southwest air|southwest\.com|southwes\s+\d/, category: 'airfare' },
  jetblue: { name: 'JetBlue', pattern: /jetblue|jet blue/, category: 'airfare' },
  aircanada: { name: 'Air Canada', pattern: /air canada/, category: 'airfare' },
  avios: { name: 'British Airways, Aer Lingus, Iberia', pattern: /british a(ir|w)|aer lingus|iberia/, category: 'airfare' },
  marriott: {
    name: 'Marriott',
    pattern: /marriott|westin|sheraton|ritz.carlton|residence inn|fairfield inn|springhill suites|st\.? regis|le meridien|aloft|renaissance hotel|moxy|element by|four points|autograph collection/,
    category: 'hotels',
  },
  hilton: { name: 'Hilton', pattern: /hilton|hampton inn|doubletree|embassy suites|homewood suites|home2|conrad hotel|waldorf|tru by|canopy by/, category: 'hotels' },
  hyatt: { name: 'Hyatt', pattern: /hyatt|andaz|thompson hotel|alila/, category: 'hotels' },
  ihg: { name: 'IHG', pattern: /\bihg\b|holiday inn|intercontinental|crowne plaza|kimpton|candlewood|staybridge|hotel indigo|avid hotel/, category: 'hotels' },
  wyndham: { name: 'Wyndham', pattern: /wyndham|days inn|super 8|la quinta|ramada|microtel|baymont|howard johnson|travelodge/, category: 'hotels' },
  choice: { name: 'Choice Hotels', pattern: /choice hotel|comfort inn|comfort suites|quality inn|sleep inn|clarion|econo lodge|rodeway|cambria hotel|ascend hotel/, category: 'hotels' },
  wholefoods: { name: 'Whole Foods', pattern: /whole\s*foods|wholefds/, category: 'groceries' },
  doordash: { name: 'DoorDash', pattern: /doordash|caviar/, category: 'dining' },
  instacart: { name: 'Instacart', pattern: /instacart/, category: 'groceries' },
  costcogas: { name: 'Costco gas', pattern: /costco\s*(gas|fuel)/, category: 'gas' },
};

/** A plan row's name: the category, or the brand within it ("Flights: Delta"). */
export function groupLabel(category: CategoryId, brand?: BrandId): string {
  return brand ? `${CATEGORY_LABELS[category]}: ${BRANDS[brand].name}` : CATEGORY_LABELS[category];
}

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
  [/airline|airways|delta air|united air|american air|southwest air|jetblue|alaska air|spirit air|frontier/, 'airfare'],
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

/** Rows that move money but aren't purchases and earn no rewards: transfers, pay, interest and card fees. */
export const NOT_PURCHASE_PATTERN =
  /\btransfer\b|\bxfer\b|zelle|direct dep|payroll|interest charge|interest paid|late fee|annual (membership )?fee|cash advance|atm withdrawal|foreign transaction fee/i;

/** Bank or budgeting-app categories that aren't card purchases. */
export const NOT_PURCHASE_CATEGORY = /^(payments?|transfers?|credit card payment|income|paycheck|salary|investments?|interest|fees?\b|fees & adjustments|loan)/i;

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

/** The brand a purchase belongs to, if any, for cards that pay a bonus at that brand. */
export function brandOf(description: string, category: CategoryId): BrandId | undefined {
  const d = description.toLowerCase();
  for (const [id, b] of Object.entries(BRANDS) as [BrandId, (typeof BRANDS)[BrandId]][]) {
    // A merchant moved to another category no longer counts as the brand.
    if (b.category === category && b.pattern.test(d)) return id;
  }
  return undefined;
}

export function categorize(
  description: string,
  bankCategory: string,
  overrides: Record<string, CategoryId> = {},
): CategoryId {
  const key = merchantKey(description);
  if (overrides[key]) return overrides[key];
  const d = description.toLowerCase();
  for (const b of Object.values(BRANDS)) if (b.pattern.test(d)) return b.category;
  for (const [re, cat] of MERCHANT_RULES) if (re.test(d)) return cat;
  const b = bankCategory.toLowerCase();
  for (const [re, cat] of BANK_RULES) if (re.test(b)) return cat;
  return 'other';
}
