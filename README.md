# Card to Use

Upload a credit card transaction export, tick the cards you hold, and see which card to use for each spending category, with estimated yearly rewards.

**Nothing is stored and nothing leaves the browser.** Files are read in the page, there is no server code, no analytics, no cookies and no local storage. Fonts are self-hosted, and the Content-Security-Policy in `public/_headers` blocks requests to any other site.

> Not financial advice. Rates, caps, fees, APRs and point values are approximate and can change; check the issuer's terms.

## How it works

- `src/core/parse.ts` finds the header row, guesses the date, description, amount (or debit/credit), category and card columns, and drops payments.
- `src/core/categories.ts` sorts merchants into categories: merchant-name rules first (Costco is a warehouse club, Uber Eats is dining), then the bank's own category. Merchant fixes made in the app override both.
- `src/core/recommend.ts` ranks your cards per category by cents earned per dollar, fills yearly caps before moving to the next card, and compares the result against the cards you actually used (if the file has a card column) or your single best card.
- `src/data/cards.json` is the card catalog: rates, caps, fees, APR ranges, rewards program and point values (best transfer value and cash-out value), with an `asOf` date.

Supported files: CSV/TSV exports (tested with Chase, Amex, Citi, Capital One and Discover layouts) and `.xlsx`.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # core logic tests with bank-export fixtures
npm run build      # type-check and build to dist/
```

## Deploy to Cloudflare

The app is static files served by a Worker with no script (`wrangler.jsonc`).

**Option A: Git integration (recommended).** In the Cloudflare dashboard go to Workers & Pages → Create → Import a repository, pick this repo, and set:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Every push to `main` deploys, and pull requests get preview URLs.

**Option B: from your machine.** `npx wrangler login`, then `npm run deploy`.

## Limit access to family and friends with Cloudflare Access

No code changes are needed; Access puts a sign-in page in front of the app.

1. In the dashboard, open **Zero Trust** (first time: pick a team name and the Free plan, which covers up to 50 users).
2. **Access → Applications → Add an application → Self-hosted.**
3. Application domain: the Worker's address (for example `card-to-use.<your-subdomain>.workers.dev`) or your custom domain. To protect a `workers.dev` address you can also open the Worker → Settings → Domains & Routes and turn on Cloudflare Access there, which creates the application for you.
4. Add a policy: Action **Allow**, Include **Emails** → list the people you want to invite (or **Emails ending in** for a whole domain).
5. Login methods: **One-time PIN** works with any email address. Add **Google** under Settings → Authentication if you prefer.
6. Turn off preview URLs for the Worker, or protect them with the same policy, so the app isn't reachable around Access.

## Updating card data

Edit `src/data/cards.json` and bump `asOf`. Rates are per dollar (points) or percent (cash back); `cap` is a yearly dollar limit for that rate. Rotating 5% cards (Freedom Flex, Discover it) ship with no categories set: the app asks the person to tick this quarter's categories from the issuer's site.

The catalog values were compiled from general knowledge and should be checked against each issuer's current terms before relying on them.
