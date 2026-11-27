import type { CategoryId, Network } from './types';

/**
 * Common US merchants, the category card issuers usually give them, and anything worth knowing at the register.
 * Issuers go by the merchant category code (MCC) the store's payment processor assigns, not by what you buy,
 * so a supermarket inside a superstore still codes as the superstore. Checked in order: specific names first.
 */
export interface Merchant {
  name: string;
  pattern: RegExp;
  category: CategoryId;
  /** Networks the merchant takes, when it takes only some of them. */
  accepts?: Network[];
  note?: string;
}

const SUPERSTORE = 'Codes as a discount store or superstore, so grocery and supermarket bonuses don’t apply, even to food.';
const WAREHOUSE = 'Codes as a warehouse club. Most grocery and supermarket bonuses exclude warehouse clubs.';
const CONVENIENCE = 'Pumps usually code as gas; purchases inside the store may code as a convenience store instead.';
const DELIVERY = 'Delivery apps usually code as restaurants.';

/** A name like "Chick-fil-A" or "Arby's" as a pattern that also matches "CHICKFILA" or "ARBYS #123". */
function namePattern(name: string): RegExp {
  const words = name
    .toLowerCase()
    .replace(/[.+]/g, ' ')
    .split(/[^a-z0-9&]+/)
    .filter(Boolean)
    .map((w) => w.replace(/&/g, '\\s*&?\\s*'));
  return new RegExp(`\\b${words.join("[\\s'’.-]*")}(?![a-z0-9])`);
}

const simple = (category: CategoryId, names: string[]): Merchant[] => names.map((name) => ({ name, pattern: namePattern(name), category }));

export const MERCHANTS: Merchant[] = [
  // Warehouse clubs and superstores
  { name: 'Costco gas', pattern: /costco\s*(gas|fuel)/, category: 'gas', accepts: ['visa', 'mastercard', 'amex', 'discover'], note: 'Costco gas stations code as gas, not as the warehouse. Most take any Visa, and many take Mastercard too.' },
  { name: 'Costco', pattern: /costco/, category: 'wholesale', accepts: ['visa'], note: `${WAREHOUSE} US Costco warehouses take only Visa credit cards.` },
  { name: "Sam's Club", pattern: /sam'?s\s*club/, category: 'wholesale', note: WAREHOUSE },
  { name: "BJ's Wholesale", pattern: /bj'?s\s*(wholesale|club)/, category: 'wholesale', note: WAREHOUSE },
  { name: 'Walmart.com', pattern: /walmart\.com|wal-mart\.com|wm\.com/, category: 'online', note: 'Online orders usually code as online shopping, but some cards exclude superstores’ sites too.' },
  { name: 'Walmart', pattern: /wal-?mart|wm supercenter/, category: 'other', note: SUPERSTORE },
  { name: 'Target.com', pattern: /target\.com/, category: 'online', note: 'Online orders usually code as online shopping.' },
  { name: 'Target', pattern: /\btarget\b/, category: 'other', note: SUPERSTORE },
  { name: 'Meijer', pattern: /meijer/, category: 'other', note: SUPERSTORE },
  { name: 'Fred Meyer', pattern: /fred meyer/, category: 'other', note: SUPERSTORE },
  { name: 'Dollar General', pattern: /dollar general/, category: 'other', note: SUPERSTORE },
  { name: 'Dollar Tree', pattern: /dollar tree/, category: 'other', note: SUPERSTORE },

  // Amazon and online
  { name: 'Whole Foods Market', pattern: /whole\s*foods|wholefds/, category: 'groceries', note: 'Codes as a supermarket. Amazon’s cards pay extra here.' },
  { name: 'Amazon Fresh', pattern: /amazon\s*fresh/, category: 'groceries', note: 'Amazon Fresh stores code as supermarkets; Fresh delivery may code as Amazon.' },
  { name: 'Amazon', pattern: /amazon|amzn/, category: 'amazon' },
  { name: 'eBay', pattern: /ebay/, category: 'online' },
  { name: 'Etsy', pattern: /etsy/, category: 'online' },
  { name: 'Wayfair', pattern: /wayfair/, category: 'online' },
  { name: 'Chewy', pattern: /chewy/, category: 'online' },
  { name: 'Temu', pattern: /\btemu\b/, category: 'online' },
  { name: 'Shein', pattern: /shein/, category: 'online' },

  // Supermarkets
  { name: 'Kroger', pattern: /kroger/, category: 'groceries' },
  { name: 'Safeway', pattern: /safeway/, category: 'groceries' },
  { name: 'Albertsons', pattern: /albertsons/, category: 'groceries' },
  { name: 'Publix', pattern: /publix/, category: 'groceries' },
  { name: 'H-E-B', pattern: /h-e-b|\bheb\b/, category: 'groceries' },
  { name: "Trader Joe's", pattern: /trader joe/, category: 'groceries' },
  { name: 'Aldi', pattern: /\baldi\b/, category: 'groceries' },
  { name: 'Wegmans', pattern: /wegmans/, category: 'groceries' },
  { name: 'Sprouts', pattern: /sprouts/, category: 'groceries' },
  { name: 'Food Lion', pattern: /food lion/, category: 'groceries' },
  { name: 'Giant', pattern: /giant (eagle|food)|\bgiant\b/, category: 'groceries' },
  { name: 'Stop & Shop', pattern: /stop\s*&?\s*shop/, category: 'groceries' },
  { name: 'Harris Teeter', pattern: /harris teeter/, category: 'groceries' },
  { name: 'Ralphs', pattern: /ralphs/, category: 'groceries' },
  { name: 'Vons', pattern: /\bvons\b/, category: 'groceries' },
  { name: 'Hy-Vee', pattern: /hy-?vee/, category: 'groceries' },
  { name: 'ShopRite', pattern: /shoprite/, category: 'groceries' },
  { name: 'Market Basket', pattern: /market basket/, category: 'groceries' },
  { name: 'WinCo', pattern: /winco/, category: 'groceries' },
  { name: 'Instacart', pattern: /instacart/, category: 'groceries', note: 'Usually codes as a grocery store, but some cards treat it as online shopping.' },

  // Gas
  { name: 'Shell', pattern: /\bshell\b/, category: 'gas' },
  { name: 'Chevron', pattern: /chevron/, category: 'gas' },
  { name: 'Exxon', pattern: /exxon/, category: 'gas' },
  { name: 'Mobil', pattern: /\bmobil\b/, category: 'gas' },
  { name: 'BP', pattern: /\bbp\b/, category: 'gas' },
  { name: 'Valero', pattern: /valero/, category: 'gas' },
  { name: 'Marathon Petroleum', pattern: /marathon petro/, category: 'gas' },
  { name: 'Sunoco', pattern: /sunoco/, category: 'gas' },
  { name: 'Citgo', pattern: /citgo/, category: 'gas' },
  { name: 'Arco', pattern: /\barco\b/, category: 'gas' },
  { name: 'Speedway', pattern: /speedway/, category: 'gas', note: CONVENIENCE },
  { name: 'Wawa', pattern: /wawa/, category: 'gas', note: CONVENIENCE },
  { name: 'Sheetz', pattern: /sheetz/, category: 'gas', note: CONVENIENCE },
  { name: 'QuikTrip', pattern: /quiktrip|\bqt\b/, category: 'gas', note: CONVENIENCE },
  { name: 'RaceTrac', pattern: /racetrac/, category: 'gas', note: CONVENIENCE },
  { name: 'Circle K', pattern: /circle k/, category: 'gas', note: CONVENIENCE },
  { name: "Casey's", pattern: /casey'?s/, category: 'gas', note: CONVENIENCE },
  { name: "Buc-ee's", pattern: /buc-?ee'?s/, category: 'gas', note: CONVENIENCE },
  { name: '7-Eleven', pattern: /7-?eleven/, category: 'gas', note: CONVENIENCE },
  { name: 'Tesla Supercharger', pattern: /supercharg/, category: 'gas', note: 'EV charging counts with gas on most cards that name it.' },
  { name: 'ChargePoint', pattern: /chargepoint/, category: 'gas', note: 'EV charging counts with gas on most cards that name it.' },
  { name: 'Electrify America', pattern: /electrify america/, category: 'gas', note: 'EV charging counts with gas on most cards that name it.' },

  // Dining
  { name: 'Uber Eats', pattern: /uber\W*eats/, category: 'dining', note: DELIVERY },
  { name: 'DoorDash', pattern: /doordash|caviar/, category: 'dining', note: DELIVERY },
  { name: 'Grubhub', pattern: /grubhub|seamless/, category: 'dining', note: DELIVERY },
  { name: 'Starbucks', pattern: /starbucks/, category: 'dining', note: 'Reloading the Starbucks app usually still codes as dining.' },
  { name: "Dunkin'", pattern: /dunkin/, category: 'dining' },
  { name: "McDonald's", pattern: /mcdonald/, category: 'dining' },
  { name: 'Chipotle', pattern: /chipotle/, category: 'dining' },
  { name: 'Chick-fil-A', pattern: /chick-?fil/, category: 'dining' },
  { name: 'Subway', pattern: /\bsubway\b/, category: 'dining' },
  { name: 'Taco Bell', pattern: /taco bell/, category: 'dining' },
  { name: "Wendy's", pattern: /wendy'?s/, category: 'dining' },
  { name: 'Burger King', pattern: /burger king/, category: 'dining' },
  { name: 'Panera', pattern: /panera/, category: 'dining' },
  { name: "Domino's", pattern: /domino'?s/, category: 'dining' },
  { name: 'Pizza Hut', pattern: /pizza hut/, category: 'dining' },
  { name: 'Panda Express', pattern: /panda express/, category: 'dining' },
  { name: 'Sweetgreen', pattern: /sweetgreen/, category: 'dining' },
  { name: 'Shake Shack', pattern: /shake shack/, category: 'dining' },
  { name: 'Five Guys', pattern: /five guys/, category: 'dining' },
  { name: 'Olive Garden', pattern: /olive garden/, category: 'dining' },
  { name: "Applebee's", pattern: /applebee/, category: 'dining' },
  { name: 'Cheesecake Factory', pattern: /cheesecake factory/, category: 'dining' },
  { name: 'Texas Roadhouse', pattern: /texas roadhouse/, category: 'dining' },

  // Drugstores
  { name: 'CVS', pattern: /\bcvs\b/, category: 'drugstore' },
  { name: 'Walgreens', pattern: /walgreens/, category: 'drugstore' },
  { name: 'Rite Aid', pattern: /rite aid/, category: 'drugstore' },

  // Streaming and entertainment
  { name: 'Netflix', pattern: /netflix/, category: 'streaming' },
  { name: 'Spotify', pattern: /spotify/, category: 'streaming' },
  { name: 'Hulu', pattern: /hulu/, category: 'streaming' },
  { name: 'Disney+', pattern: /disney\s*\+|disneyplus/, category: 'streaming' },
  { name: 'HBO Max', pattern: /\bhbo\b|max\.com/, category: 'streaming' },
  { name: 'YouTube Premium', pattern: /youtube\s*(premium|tv)/, category: 'streaming' },
  { name: 'Apple Music', pattern: /apple\s*music/, category: 'streaming' },
  { name: 'Peacock', pattern: /peacock/, category: 'streaming' },
  { name: 'Paramount+', pattern: /paramount/, category: 'streaming' },
  { name: 'SiriusXM', pattern: /sirius/, category: 'streaming' },
  { name: 'Ticketmaster', pattern: /ticketmaster/, category: 'entertainment' },
  { name: 'StubHub', pattern: /stubhub/, category: 'entertainment' },
  { name: 'Live Nation', pattern: /live nation/, category: 'entertainment' },
  { name: 'AMC Theatres', pattern: /\bamc\b/, category: 'entertainment' },
  { name: 'Regal', pattern: /\bregal\b/, category: 'entertainment' },
  { name: 'Topgolf', pattern: /topgolf/, category: 'entertainment' },

  // Getting around and travel
  { name: 'Uber', pattern: /\buber\b/, category: 'transit' },
  { name: 'Lyft', pattern: /lyft/, category: 'transit' },
  { name: 'E-ZPass', pattern: /e-?zpass|fastrak|sunpass|toll/, category: 'transit' },
  { name: 'ParkMobile', pattern: /parkmobile|spothero|parking/, category: 'transit' },
  { name: 'Alaska Airlines', pattern: /alaska air/, category: 'airfare' },
  { name: 'Spirit Airlines', pattern: /spirit air/, category: 'airfare' },
  { name: 'Frontier Airlines', pattern: /frontier air/, category: 'airfare' },
  { name: 'Expedia', pattern: /expedia/, category: 'travel', note: 'Hotels booked here may code as travel agency rather than hotel, so hotel-only bonuses may not apply.' },
  { name: 'Booking.com', pattern: /booking\.com/, category: 'travel', note: 'May code as travel agency rather than hotel.' },
  { name: 'Hotels.com', pattern: /hotels\.com/, category: 'travel', note: 'May code as travel agency rather than hotel.' },
  { name: 'Airbnb', pattern: /airbnb/, category: 'hotels', note: 'Most cards count Airbnb as travel; hotel-only bonuses may not apply.' },
  { name: 'Vrbo', pattern: /vrbo/, category: 'hotels', note: 'Most cards count Vrbo as travel; hotel-only bonuses may not apply.' },
  { name: 'Hertz', pattern: /hertz/, category: 'travel' },
  { name: 'Avis', pattern: /\bavis\b/, category: 'travel' },
  { name: 'Enterprise Rent-A-Car', pattern: /enterprise rent/, category: 'travel' },
  { name: 'National Car Rental', pattern: /national car/, category: 'travel' },
  { name: 'Amtrak', pattern: /amtrak/, category: 'travel' },

  // Bills
  { name: 'Verizon', pattern: /verizon/, category: 'utilities' },
  { name: 'AT&T', pattern: /at&t|\batt\b/, category: 'utilities' },
  { name: 'T-Mobile', pattern: /t-?mobile/, category: 'utilities' },
  { name: 'Comcast Xfinity', pattern: /comcast|xfinity/, category: 'utilities' },
  { name: 'Spectrum', pattern: /spectrum/, category: 'utilities' },

  // Common stores with no bonus category on most cards
  { name: 'Home Depot', pattern: /home depot/, category: 'other', note: 'Codes as home improvement, a bonus category on only a few cards (Bank of America Customized Cash, some U.S. Bank and Citi picks).' },
  { name: "Lowe's", pattern: /\blowe'?s\b(?!\s*foods)/, category: 'other', note: 'Codes as home improvement, a bonus category on only a few cards.' },
  { name: 'Best Buy', pattern: /best buy/, category: 'other', note: 'Codes as an electronics store; bestbuy.com may count as online shopping.' },
  { name: 'Apple Store', pattern: /apple store|apple\.com/, category: 'other', note: 'Apple Card pays 3% at Apple, which the app doesn’t count.' },
  { name: 'IKEA', pattern: /ikea/, category: 'other' },
  { name: "Macy's", pattern: /macy'?s/, category: 'other', note: 'Department stores are a bonus category on only a few cards.' },
  { name: 'Nordstrom', pattern: /nordstrom/, category: 'other' },
  { name: 'TJ Maxx', pattern: /tj ?maxx|marshalls|homegoods/, category: 'other' },
  { name: 'Ulta', pattern: /\bulta\b/, category: 'other' },
  { name: 'Sephora', pattern: /sephora/, category: 'other' },
  { name: 'PetSmart', pattern: /petsmart/, category: 'other' },
  { name: 'Petco', pattern: /petco/, category: 'other' },

  // More national chains, matched by name
  ...simple('dining', ["Arby's", "Sonic Drive-In", "Jack in the Box", "Popeyes", "KFC", "Little Caesars", "Papa John's", "Jimmy John's", "Jersey Mike's", "Firehouse Subs", "Wingstop", "Buffalo Wild Wings", "Raising Cane's", "Whataburger", "In-N-Out", "Culver's", "Zaxby's", "Bojangles", "Dairy Queen", "Krispy Kreme", "Tim Hortons", "Dutch Bros", "Peet's Coffee", "Caribou Coffee", "Tropical Smoothie", "Smoothie King", "Jamba", "Qdoba", "Moe's Southwest", "Del Taco", "El Pollo Loco", "Noodles & Company", "Potbelly", "McAlister's", "Jason's Deli", "Einstein Bros", "Auntie Anne's", "Cinnabon", "Baskin-Robbins", "Cold Stone", "Denny's", "IHOP", "Waffle House", "Cracker Barrel", "Chili's", "Red Lobster", "Outback Steakhouse", "LongHorn Steakhouse", "Red Robin", "TGI Fridays", "Ruby Tuesday", "Bob Evans", "Perkins", "Hooters", "BJ's Restaurant", "P.F. Chang's", "Benihana", "Maggiano's", "Carrabba's", "Bonefish Grill", "Ruth's Chris", "Morton's", "Fogo de Chao", "Dave & Buster's", "Golden Corral", "Steak n Shake", "Hardee's", "Carl's Jr", "White Castle", "Checkers", "Church's Chicken", "Portillo's", "Cava", "Chopt", "Just Salad", "Pret A Manger", "Le Pain Quotidien", "Blaze Pizza", "MOD Pizza", "Marco's Pizza", "Papa Murphy's", "Round Table Pizza", "Crumbl", "Nothing Bundt Cakes", "Insomnia Cookies", "Shipley Do-Nuts", "Pollo Tropical", "Torchy's Tacos", "Bubba's 33", "Yard House", "Cheddar's", "Logan's Roadhouse", "Twin Peaks", "Hibachi"]),
  ...simple('groceries', ["Food 4 Less", "Smart & Final", "Grocery Outlet", "Lidl", "Save A Lot", "Piggly Wiggly", "Winn-Dixie", "Ingles", "Weis Markets", "Price Chopper", "Hannaford", "Shaw's", "Acme Markets", "Jewel-Osco", "Tom Thumb", "Randalls", "Pavilions", "King Soopers", "Fry's Food", "Smith's Food", "QFC", "Dillons", "Mariano's", "Pick 'n Save", "Harps", "Brookshire", "Schnucks", "Dierbergs", "Raley's", "Bristol Farms", "Gelson's", "Stater Bros", "Cardenas", "Fiesta Mart", "El Super", "Northgate Market", "99 Ranch", "H Mart", "Patel Brothers", "Fresh Thyme", "Natural Grocers", "The Fresh Market", "Earth Fare", "Lunds & Byerlys", "Cub Foods", "Festival Foods", "Woodman's", "Food City", "Lowes Foods", "Bi-Lo", "Tops Markets", "Big Y", "Key Food", "Fairway", "Gristedes", "D'Agostino", "Foodtown", "FreshDirect", "Thrive Market", "Imperfect Foods", "Misfits Market", "Weee"]),
  ...simple('gas', ["Phillips 66", "Conoco", "Texaco", "Gulf Oil", "Sinclair", "Holiday Stationstores", "Kum & Go", "Love's Travel", "Pilot Travel", "Flying J", "TA Petro", "Murphy USA", "Thorntons", "Kwik Trip", "Kwik Fill", "GetGo", "Cumberland Farms", "Stewart's Shops", "Maverik", "Rutter's", "Royal Farms", "Weigel's", "EVgo", "Blink Charging"]),
  ...simple('drugstore', ["Duane Reade", "Bartell Drugs", "Kinney Drugs", "Discount Drug Mart", "Health Mart", "Good Neighbor Pharmacy"]),
  ...simple('streaming', ["Apple TV+", "Crunchyroll", "Fubo", "Sling TV", "Philo", "Starz", "Showtime", "Audible", "Pandora", "Tidal", "ESPN+", "DAZN", "Discovery+", "BritBox", "Curiosity Stream"]),
  ...simple('entertainment', ["Cinemark", "Alamo Drafthouse", "Marcus Theatres", "Harkins", "Six Flags", "Cedar Fair", "SeaWorld", "Universal Studios", "Walt Disney World", "Disneyland", "Main Event", "Round1", "Chuck E. Cheese", "Bowlero", "Eventbrite", "SeatGeek", "Vivid Seats", "AXS"]),
  ...simple('transit', ["Curb Mobility", "Citi Bike", "Waymo", "Metrocard", "Ventra", "SEPTA", "WMATA", "Caltrain", "Metra", "NJ Transit", "LIRR", "Metro-North", "Greyhound", "Megabus", "FlixBus", "ParkWhiz", "Impark", "Ampco"]),
  ...simple('travel', ["Priceline", "Kayak", "Orbitz", "Travelocity", "Hopper", "Trip.com", "Agoda", "Budget Rent", "Alamo Rent", "Thrifty", "Dollar Rent", "Sixt", "Turo", "Carnival", "Royal Caribbean", "Norwegian Cruise", "Princess Cruises", "Celebrity Cruises", "Disney Cruise", "Brightline", "Southwest Vacations"]),
  ...simple('airfare', ["Hawaiian Airlines", "Allegiant", "Sun Country", "Breeze Airways", "Avelo", "Air France", "KLM", "Lufthansa", "Emirates", "Qatar Airways", "Singapore Airlines", "Virgin Atlantic", "WestJet", "Aer Lingus", "Turkish Airlines", "Japan Airlines", "Cathay Pacific", "Qantas", "Volaris", "Aeromexico", "LATAM", "Copa Airlines", "Icelandair", "Etihad", "Korean Air", "ANA"]),
  ...simple('hotels', ["Best Western", "Motel 6", "Red Roof", "Extended Stay America", "Omni Hotels", "Loews Hotels", "Fairmont", "Four Seasons", "Kimpton", "Graduate Hotels", "Ace Hotel", "Margaritaville", "Great Wolf Lodge", "Sonesta", "Drury Inn", "MGM Resorts", "Caesars", "Wynn", "Atlantis", "Accor", "Novotel", "Sofitel", "Club Med"]),
  ...simple('utilities', ["Cox Communications", "Optimum", "Frontier Communications", "CenturyLink", "Lumen", "Google Fiber", "Mint Mobile", "Visible", "Cricket Wireless", "Boost Mobile", "US Cellular", "Consumer Cellular", "Google Fi", "Starlink", "Duke Energy", "Dominion Energy", "Con Edison", "PG&E", "Southern California Edison", "Georgia Power", "FPL", "National Grid", "Xcel Energy", "DTE Energy", "ComEd", "PSE&G", "Eversource"]),
  ...simple('online', ["Shopify", "Zappos", "Overstock", "Newegg", "B&H Photo", "Wish", "AliExpress", "Poshmark", "Mercari", "Depop", "StockX", "Grailed", "ThredUp", "Rakuten", "Uniqlo.com", "Nike.com", "Lululemon.com", "Warby Parker", "Glossier", "Allbirds"]),
  ...simple('other', ["Kohl's", "JCPenney", "Dillard's", "Belk", "Saks Fifth Avenue", "Neiman Marcus", "Bloomingdale's", "Old Navy", "Gap", "Banana Republic", "H&M", "Zara", "Uniqlo", "Forever 21", "American Eagle", "Abercrombie", "Hollister", "J.Crew", "Ann Taylor", "Talbots", "Chico's", "Lululemon", "Nike", "Adidas", "Foot Locker", "Finish Line", "DSW", "Famous Footwear", "Ross Stores", "Burlington", "Five Below", "Big Lots", "Ollie's", "Family Dollar", "Michaels", "Hobby Lobby", "Joann", "Bed Bath", "Crate & Barrel", "Pottery Barn", "Williams-Sonoma", "West Elm", "Pier 1", "Kirkland's", "At Home", "Ashley Furniture", "Rooms To Go", "Mattress Firm", "Menards", "Ace Hardware", "True Value", "Harbor Freight", "Tractor Supply", "AutoZone", "O'Reilly Auto", "Advance Auto", "NAPA Auto", "Pep Boys", "Jiffy Lube", "Valvoline", "Discount Tire", "Firestone", "Goodyear", "Midas", "Dick's Sporting", "Academy Sports", "Bass Pro", "Cabela's", "REI", "GameStop", "Barnes & Noble", "Staples", "Office Depot", "OfficeMax", "FedEx Office", "UPS Store", "USPS", "Bath & Body Works", "Victoria's Secret", "Claire's", "Kay Jewelers", "Zales", "Jared", "Party City", "Spirit Halloween", "Guitar Center", "Planet Fitness", "LA Fitness", "24 Hour Fitness", "Equinox", "Orangetheory", "Anytime Fitness", "Crunch Fitness", "Gold's Gym", "SoulCycle", "Great Clips", "Supercuts", "Sport Clips", "European Wax", "Massage Envy", "H&R Block", "Jackson Hewitt", "Microsoft Store", "Samsung.com", "Dell.com", "Lenovo", "LensCrafters", "Pearle Vision", "America's Best", "Banfield", "VCA Animal"]),
];

/** The directory entry a merchant name matches, if any. */
export function findMerchant(description: string): Merchant | undefined {
  const d = description.toLowerCase();
  return MERCHANTS.find((m) => m.pattern.test(d));
}
