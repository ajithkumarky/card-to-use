/**
 * The app's only server code. It does two things and never sees anything about the people using the app:
 *  - GET /api/rotating returns this quarter's rotating 5% categories from KV (or the bundled copy).
 *  - A daily cron reads the issuers' public pages, checks the result, and updates KV when it changed.
 * Every other request is a static file served straight from ./dist without running this script.
 */
import bundled from '../src/data/rotating.json';
import {
  DISCOVER_PAGE,
  DISCOVER_URL,
  SOURCES,
  chaseUrl,
  isFeed,
  mergeFeed,
  nextQuarter,
  parseChase,
  parseDiscover,
  quarterOf,
  type RotatingFeed,
  type RotatingOffer,
  type SourceId,
  type SourceStatus,
} from '../src/core/rotating';

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
interface Env {
  ROTATING: KV;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const FEED_KEY = 'feed';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function readFeed(env: Env): Promise<RotatingFeed> {
  try {
    const raw = await env.ROTATING.get(FEED_KEY);
    if (raw) {
      const f: unknown = JSON.parse(raw);
      if (isFeed(f)) return f;
    }
  } catch {
    // Fall through to the bundled copy.
  }
  return bundled as RotatingFeed;
}

async function crawlDiscover(): Promise<RotatingOffer[]> {
  const r = await fetch(DISCOVER_URL, {
    headers: { ...BROWSER_HEADERS, Accept: 'application/json', Referer: DISCOVER_PAGE, Origin: 'https://www.discover.com' },
  });
  if (!r.ok) throw new Error(`Discover answered ${r.status}`);
  return parseDiscover(await r.json());
}

async function crawlChase(now: Date): Promise<RotatingOffer[]> {
  // Chase announces each quarter about two weeks before it starts, so check this quarter and the next.
  const out: RotatingOffer[] = [];
  for (const q of [quarterOf(now), nextQuarter(quarterOf(now))]) {
    const r = await fetch(chaseUrl(q), { headers: { ...BROWSER_HEADERS, Accept: 'text/html' }, redirect: 'follow' });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`Chase ${q} answered ${r.status}`);
    const offer = parseChase(await r.text(), q);
    if (offer) out.push(offer);
  }
  return out;
}

export async function crawl(env: Env, now = new Date()) {
  const fresh: Record<string, RotatingOffer[]> = {};
  const status: SourceStatus[] = [];
  const jobs: [SourceId, () => Promise<RotatingOffer[]>][] = [
    ['discover', crawlDiscover],
    ['chase-freedom', () => crawlChase(now)],
  ];
  for (const [source, run] of jobs) {
    try {
      const offers = await run();
      for (const card of SOURCES[source].cards) fresh[card] = offers;
      status.push({ source, ok: true, found: offers.map((o) => o.quarter) });
    } catch (e) {
      status.push({ source, ok: false, found: [], error: String((e as Error)?.message ?? e).slice(0, 300) });
    }
  }
  const prev = await readFeed(env);
  const { feed, changed, rejected } = mergeFeed(prev, fresh, status, now);
  for (const r of rejected) {
    const source = (Object.keys(SOURCES) as SourceId[]).find((s) => SOURCES[s].cards.some((c) => r.startsWith(`${c}:`)));
    const s = status.find((x) => x.source === source);
    if (s) {
      s.ok = false;
      s.error = [s.error, `Kept the previous data because ${r}`].filter(Boolean).join('; ');
    }
  }
  // KV's free plan allows 1,000 writes a day; this writes once a day at most.
  await env.ROTATING.put(FEED_KEY, JSON.stringify(feed));
  console.log(JSON.stringify({ changed, status }));
  return { feed, changed };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/rotating' && request.method === 'GET') {
      return new Response(JSON.stringify(await readFeed(env)), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=3600' },
      });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: unknown, env: Env, ctx: Ctx): Promise<void> {
    ctx.waitUntil(crawl(env));
  },
};
