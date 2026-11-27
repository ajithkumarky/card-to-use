# Card to Use

Upload a credit card transaction export, tick the cards you hold, and see which card to use for each spending category, with estimated yearly rewards.

**Nothing leaves the browser, and your purchases are never stored.** Files are read in the page, and there are no cookies. The only server code is a small Worker that publishes this quarter's rotating 5% categories and counts which features get used (see **Usage stats** below); it never receives your transactions, merchants or cards. Once you pick cards, the app remembers your cards, cards you added, rotating categories, merchant fixes and the point-value setting in this browser's `localStorage` (`src/ui/memory.ts`), so a return visit skips the how-it-works page. Transactions, file contents and card-number labels are never saved. **Forget me** under the file box clears everything. Fonts are self-hosted, and the Content-Security-Policy in `public/_headers` blocks requests to any other site.

> Not financial advice. Rates, caps, fees, APRs and point values are approximate and can change; check the issuer's terms.

## How it works

- **Which card here?** (`#use`, `src/ui/quick.tsx`, the home page once you've saved cards): type where you're about to pay, or pick a kind of purchase, and see which of your saved cards earns most there. It uses brand bonuses, category rates and the rotating categories you've set. No file is needed, so it works at the checkout on a phone.

- `src/core/parse.ts` finds the header row, guesses the date, description, amount (or debit/credit), category and card columns, and drops payments.
- `src/core/categories.ts` sorts merchants into categories: brand names first (Hampton Inn is a Hilton hotel), then merchant-name rules (Costco is a warehouse club, Uber Eats is dining), then the bank's own category. Merchant fixes made in the app override all of them.
- `src/core/recommend.ts` ranks your cards per category (and per brand within a category) by cents earned per dollar, fills yearly caps before moving to the next card, and compares the result against the cards you actually used (if the file has a card column) or your single best card.
- `src/data/cards.json` is the card catalog: rates, caps, fees, APR ranges, rewards program and point values (best realistic value and cash-out value), with an `asOf` date.

Supported files: CSV/TSV exports (tested with Chase, Amex, Citi, Capital One and Discover layouts) and `.xlsx`.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # core logic tests with bank-export fixtures
npm run build      # type-check and build to dist/
```

## Deploy to Cloudflare

The app is static files plus the small rotating-categories script (`wrangler.jsonc`). The first `npm run deploy` creates the `ROTATING` KV namespace automatically.

**Option A: Git integration (recommended).** In the Cloudflare dashboard go to Workers & Pages → Create → Import a repository, pick this repo, and set:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Every push to `main` deploys, and pull requests get preview URLs.

**Option B: from your machine.** `npx wrangler login`, then `npm run deploy`.

## Limit access to family and friends with Cloudflare Access

No code changes are needed; Access puts a sign-in page in front of the app.

1. In the dashboard, open **Zero Trust** (first time: pick a team name and the Free plan, which covers up to 50 users).
2. **Access → Applications → Add an application → Self-hosted.**
3. Application domain: `cards.kidiyoor.com` (the custom domain in `wrangler.jsonc`). Also turn off the `workers.dev` address and preview URLs under the Worker's Settings → Domains & Routes so the app is only reachable through Access.
4. Add a policy: Action **Allow**, Include **Emails** → list the people you want to invite (or **Emails ending in** for a whole domain).
5. Login methods: **One-time PIN** works with any email address. Add **Google** under Settings → Authentication if you prefer.
6. Turn off preview URLs for the Worker, or protect them with the same policy, so the app isn't reachable around Access.

## Usage stats

The owner can see who uses the app and which features, at **`/api/stats`** (`worker/usage.ts`, `src/ui/usage.ts`).

- **Recorded:** the day and time, the email Cloudflare Access signed the person in with, and one event name from a fixed list: a page opened (which one), a spending-analysis tab viewed (which one), a file uploaded, sample data loaded, a "Which card here?" lookup run, cards saved, or Forget me used.
- **Never recorded:** merchants, amounts, transactions, file names or contents, which cards anyone holds or picked, what was typed into a lookup, IP addresses or cookies. The Worker rejects any event or detail not on the list.
- Browsers with Do Not Track or Global Privacy Control on send nothing.
- Counts are stored in the existing `ROTATING` KV namespace, one key per person per day (`usage:<day>:<email>`), which expires after 180 days. The page batches its events and sends them at most every 5 minutes and when it's hidden, so a visit costs one or two writes. Each person is capped at 20 writes a day, which keeps everyone well under KV's 1,000 free writes a day.

**Setup (once):** `npx wrangler secret put STATS_OWNER` and enter your email (comma-separate several). Until it's set, `/api/stats` answers 404 for everyone, and it always does for anyone not on the list.

## Updating card data

Edit `src/data/cards.json` and bump `asOf`. Rates are per dollar (points) or percent (cash back); `cap` is a yearly dollar limit for that rate. Rotating 5% cards (Freedom Flex, Discover it) get this quarter's categories from the crawler below; the person can still change the ticks, which are saved per quarter.

## Rotating 5% categories crawler

`worker/index.ts` runs on a daily cron (13:00 UTC) on the Workers free plan:

- **Discover it:** reads the JSON that Discover's own 5% calendar page loads (`card.discover.com/.../offer-categories`).
- **Freedom Flex:** reads Chase's quarterly press release (`media.chase.com/news/chase-freedom-YYYY-qN-categories`) for this quarter and the next.

`src/core/rotating.ts` turns the issuer's wording into the app's categories ("Restaurants" → Dining). Parts that aren't one of the app's categories (Home Improvement Stores, charity donations) are shown but not counted. Every offer is checked (the quarter's dates, a sensible title, 1–8 categories) before it's stored, and a failed or odd scrape keeps the previous data. The result goes to KV under `feed` and the app reads it from `/api/rotating`; if that fails, the copy in `src/data/rotating.json` is used. The `status` field in `/api/rotating` says whether each source worked on the last run. If the feed has nothing for the current quarter (the crawl has failed since the quarter changed), the app marks that card's categories as possibly out of date on My cards, the plan and What do I use?, links to the issuer's page, and counts no 5% until the person ticks this quarter's categories.

Cost: cron triggers, KV (one read per page load, one write a day) and the `/api/*` requests fit the free plan; static files never run the script. To run the crawl locally: `npx wrangler dev --test-scheduled`, then open `http://localhost:8787/cdn-cgi/handler/scheduled` and `http://localhost:8787/api/rotating`. Refresh the bundled copy from time to time by pasting `/api/rotating` output into `src/data/rotating.json` (drop the `status` field).

The catalog covers about 80 personal and popular business cards from Chase, American Express, Citi, Capital One, U.S. Bank, Wells Fargo, Bank of America, Discover, Barclays and Bilt, plus airline, hotel and retail co-brands. Rates, fees and APR ranges were checked in November 2026 against issuer pages where they could be read, and against NerdWallet, The Points Guy and Bankrate review pages where issuer pages render only with JavaScript (mainly American Express). APRs are shown as approximate ranges. Check the issuer's current terms before relying on them.

Brand bonuses (3x on Delta, 12x at Hilton, 5% at Whole Foods) live in a card's `brands` field. `BRANDS` in `src/core/categories.ts` lists the merchant names for each brand; those purchases get their own row in the plan (for example "Flights: Delta"), and a card earns the better of its brand rate and its category rate there.

What the catalog leaves out on purpose:
- Bonuses earned only through an issuer's travel portal (Chase Travel, Amex Travel, Capital One Travel, Citi Travel and so on).
- Credits, free nights, lounge access, status and welcome offers.
- Combined caps shared by several categories are applied to each category separately, and each card's note says so.

Point values (`programs`) come in two numbers. `bestCents` is a realistic best value, from The Points Guy's November 2026 valuations where published (Chase, Amex, Citi and Capital One use the earlier figures; Wells Fargo at 1.5¢ is an estimate). `cashCents` is the cash-out or statement-credit value, or, for airline and hotel programs that can't be cashed out, a typical low-effort redemption such as Delta's Pay with Miles at 1¢.
