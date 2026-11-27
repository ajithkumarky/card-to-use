import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bundled from '../src/data/rotating.json';
import {
  checkOffer,
  isFeed,
  mapTitle,
  mergeFeed,
  nextQuarter,
  offerFor,
  parseChase,
  parseDiscover,
  parseLongDate,
  quarterBounds,
  quarterOf,
  staleness,
  type RotatingFeed,
} from '../src/core/rotating';
import worker, { crawl } from '../worker/index';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/rotating/${name}`, import.meta.url), 'utf8');

describe('quarters and dates', () => {
  it('finds quarters and their bounds', () => {
    expect(quarterOf(new Date('2026-11-27T18:00:00Z'))).toBe('2026-Q4');
    expect(nextQuarter('2026-Q4')).toBe('2027-Q1');
    expect(quarterBounds('2026-Q1')).toEqual({ start: '2026-01-01', end: '2026-03-31' });
    expect(quarterBounds('2028-Q1').end).toBe('2028-03-31');
  });
  it('reads issuer dates', () => {
    expect(parseLongDate('October 01, 2026')).toBe('2026-10-01');
    expect(parseLongDate('September 14th, 2026')).toBe('2026-09-14');
    expect(parseLongDate('Smarch 3, 2026')).toBeNull();
  });
});

describe('mapTitle', () => {
  it('maps issuer wording to app categories and keeps the rest as extras', () => {
    expect(mapTitle('Grocery Stores, Wholesale Clubs, and Select Streaming Services')).toEqual({
      categories: ['groceries', 'wholesale', 'streaming'],
      extras: [],
    });
    expect(mapTitle('Restaurants and Home Improvement Stores')).toEqual({ categories: ['dining'], extras: ['Home Improvement Stores'] });
    expect(mapTitle('Gas Stations and EV Charging, Public Transit, Select Live Entertainment and United Way')).toEqual({
      categories: ['gas', 'transit', 'entertainment'],
      extras: ['United Way'],
    });
    expect(mapTitle('Amazon, Whole Foods Market, Chase Travel and Feeding America®')).toEqual({
      categories: ['amazon'],
      extras: ['Whole Foods Market', 'Chase Travel', 'Feeding America'],
    });
  });
});

describe('parseDiscover', () => {
  it('reads every quarter from the calendar data', () => {
    const offers = parseDiscover(JSON.parse(fixture('discover-offer-categories.json')));
    expect(offers.map((o) => o.quarter)).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    expect(offers[3]).toMatchObject({
      start: '2026-10-01',
      end: '2026-12-31',
      title: 'Restaurants, Entertainment and Utilities',
      categories: ['dining', 'entertainment', 'utilities'],
      extras: [],
    });
    expect(offers[2].categories).toEqual(['gas', 'transit', 'drugstore']);
    expect(offers.every((o) => checkOffer(o) === null)).toBe(true);
  });
  it('throws on data it does not recognise', () => {
    expect(() => parseDiscover({ error: 'Oops' })).toThrow();
    expect(() => parseDiscover({ quarters: [{ title: 'x' }] })).toThrow();
  });
});

describe('parseChase', () => {
  it('reads the headline and activation date', () => {
    const o = parseChase(fixture('chase-2026-q4.html'), '2026-Q4')!;
    expect(o).toMatchObject({
      quarter: '2026-Q4',
      start: '2026-10-01',
      end: '2026-12-31',
      title: 'Grocery Stores, Dining and American Red Cross Donations',
      categories: ['groceries', 'dining'],
      extras: ['American Red Cross Donations'],
      activateBy: '2026-12-14',
    });
    expect(checkOffer(o)).toBeNull();
    expect(parseChase(fixture('chase-2026-q3.html'), '2026-Q3')).toMatchObject({ categories: ['gas', 'transit', 'entertainment'], activateBy: '2026-09-14' });
    expect(parseChase(fixture('chase-2026-q1.html'), '2026-Q1')).toMatchObject({
      categories: ['dining'],
      extras: ['American Heart Association', 'Norwegian Cruise Line'],
    });
  });
  it('returns null for a quarter not announced yet, and throws when the page is about another quarter', () => {
    expect(parseChase(fixture('chase-not-found.html'), '2027-Q1')).toBeNull();
    expect(() => parseChase(fixture('chase-2026-q4.html'), '2027-Q1')).toThrow(/about 2026-Q4/);
  });
});

describe('mergeFeed', () => {
  const now = new Date('2026-11-27T12:00:00Z');
  const prev = bundled as RotatingFeed;
  it('keeps the previous quarter when a scrape fails the checks', () => {
    const bad = { ...prev.offers['discover-it'][0], start: '2026-10-05' };
    const { feed, changed, rejected } = mergeFeed(prev, { 'discover-it': [bad] }, [], now);
    expect(changed).toBe(false);
    expect(rejected[0]).toMatch(/^discover-it: /);
    expect(feed.offers['discover-it']).toEqual(prev.offers['discover-it']);
  });
  it('adds new quarters, prunes old ones and reports a change', () => {
    const discover = parseDiscover(JSON.parse(fixture('discover-offer-categories.json')));
    const { feed, changed } = mergeFeed(prev, { 'discover-it': discover }, [], now);
    // Q1 and Q2 ended long ago; Q3 is kept for one more quarter.
    expect(feed.offers['discover-it'].map((o) => o.quarter)).toEqual(['2026-Q3', '2026-Q4']);
    expect(changed).toBe(true);
    expect(feed.offers['chase-freedom-flex']).toEqual(prev.offers['chase-freedom-flex']);
    expect(isFeed(feed)).toBe(true);
  });
  it('finds the offer for a quarter', () => {
    expect(offerFor(prev, 'discover-it', '2026-Q4')?.categories).toEqual(['dining', 'entertainment', 'utilities']);
    expect(offerFor(prev, 'discover-it', '2027-Q1')).toBeUndefined();
  });
});

describe('staleness', () => {
  const feed = bundled as RotatingFeed;
  it('is unset while the feed covers this quarter', () => {
    expect(staleness(feed, 'discover-it', '2026-Q4')).toBeUndefined();
  });
  it('flags a crawled card once the quarter moves past the feed, with the newest known offer', () => {
    const s = staleness(feed, 'discover-it', '2027-Q1')!;
    expect(s.quarter).toBe('2027-Q1');
    expect(s.lastOffer?.quarter).toBe('2026-Q4');
    expect(s.checkedAt).toBe(feed.checkedAt);
    expect(staleness({ ...feed, offers: {} }, 'chase-freedom-flex', '2027-Q1')?.lastOffer).toBeUndefined();
  });
  it('ignores cards the crawler does not cover', () => {
    expect(staleness(feed, 'my-custom-card', '2027-Q1')).toBeUndefined();
  });
});

describe('the bundled copy', () => {
  it('passes the same checks as crawled data', () => {
    expect(isFeed(bundled)).toBe(true);
  });
});

describe('worker', () => {
  afterEach(() => vi.unstubAllGlobals());

  function kv(initial?: string) {
    const store = new Map<string, string>(initial ? [['feed', initial]] : []);
    return { store, get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) };
  }

  it('crawls both issuers and stores the result', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('discover.com')) return new Response(fixture('discover-offer-categories.json'), { status: 200 });
      if (url.endsWith('2026-q4-categories')) return new Response(fixture('chase-2026-q4.html'), { status: 200 });
      return new Response(fixture('chase-not-found.html'), { status: 404 });
    });
    const ROTATING = kv();
    const env = { ROTATING, ASSETS: { fetch: async () => new Response('asset') } };
    const { feed } = await crawl(env, new Date('2026-11-27T13:00:00Z'));
    expect(feed.status?.every((s) => s.ok)).toBe(true);
    expect(feed.offers['chase-freedom-flex'].map((o) => o.quarter)).toEqual(['2026-Q4']);
    expect(feed.offers['discover-it'].map((o) => o.quarter)).toEqual(['2026-Q3', '2026-Q4']);
    expect(JSON.parse(ROTATING.store.get('feed')!).offers).toEqual(feed.offers);

    const res = await worker.fetch(new Request('https://cards.example/api/rotating'), env);
    expect(res.headers.get('content-type')).toMatch(/json/);
    expect((await res.json()).offers['discover-it'].length).toBe(2);
    expect(await (await worker.fetch(new Request('https://cards.example/'), env)).text()).toBe('asset');
  });

  it('keeps earlier data and records the error when an issuer page changes', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('discover.com') ? new Response('<html>Oops</html>', { status: 200 }) : new Response('', { status: 503 }),
    );
    const ROTATING = kv(JSON.stringify(bundled));
    const { feed, changed } = await crawl({ ROTATING, ASSETS: { fetch: async () => new Response('') } }, new Date('2026-11-27T13:00:00Z'));
    expect(changed).toBe(false);
    expect(feed.offers).toEqual((bundled as RotatingFeed).offers);
    expect(feed.status?.map((s) => s.ok)).toEqual([false, false]);
    expect(feed.status?.[1].error).toMatch(/503/);
  });
});
