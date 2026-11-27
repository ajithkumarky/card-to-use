import { describe, expect, it } from 'vitest';
import { DAILY_CAP, parseEvent, pruneEvents, recordEvent, statsPage, type D1, type D1Stmt } from '../worker/usage';

/** A tiny in-memory stand-in for D1 that understands the few statements usage.ts runs. */
function fakeDb() {
  const rows: { day: string; ts: number; who: string; event: string; detail: string }[] = [];
  const db: D1 = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt: D1Stmt = {
        bind: (...v) => ((args = v), stmt),
        async run() {
          if (sql.startsWith('INSERT')) {
            const [day, ts, who, event, detail] = args as [string, number, string, string, string];
            rows.push({ day, ts, who, event, detail });
          } else if (sql.startsWith('DELETE')) {
            const keep = rows.filter((r) => r.day >= (args[0] as string));
            rows.splice(0, rows.length, ...keep);
          }
          return {};
        },
        async first<T>() {
          return { n: rows.filter((r) => r.day === args[0] && r.who === args[1]).length } as T;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
      return stmt;
    },
    batch: async () => [],
  };
  return { db, rows };
}

const post = (body: unknown, email = 'a@example.com') =>
  new Request('https://x/api/event', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: email ? { 'Cf-Access-Authenticated-User-Email': email } : {},
  });

describe('usage events', () => {
  it('accepts only listed events and details', () => {
    expect(parseEvent({ event: 'tab', detail: 'wallet' })).toEqual({ event: 'tab', detail: 'wallet' });
    expect(parseEvent({ event: 'upload' })).toEqual({ event: 'upload', detail: '' });
    expect(parseEvent({ event: 'tab', detail: 'Costco' })).toBeNull();
    expect(parseEvent({ event: 'lookup', detail: 'Starbucks' })).toBeNull();
    expect(parseEvent({ event: 'merchant', detail: '' })).toBeNull();
    expect(parseEvent({ event: 'toString' })).toBeNull();
    expect(parseEvent('upload')).toBeNull();
  });

  it('stores the Access email, the day and the event, and nothing else', async () => {
    const { db, rows } = fakeDb();
    const now = new Date('2026-11-27T12:00:00Z');
    expect((await recordEvent(post({ event: 'tab', detail: 'plan', merchant: 'Costco' }, 'A@Example.com'), db, now)).status).toBe(204);
    expect(rows).toEqual([{ day: '2026-11-27', ts: now.getTime(), who: 'a@example.com', event: 'tab', detail: 'plan' }]);
  });

  it('drops unsigned, unknown, oversized and over-cap events', async () => {
    const { db, rows } = fakeDb();
    await recordEvent(post({ event: 'upload' }, ''), db);
    await recordEvent(post({ event: 'nope' }), db);
    await recordEvent(post('not json'), db);
    await recordEvent(post({ event: 'upload', pad: 'x'.repeat(300) }), db);
    expect(rows).toHaveLength(0);
    for (let i = 0; i < DAILY_CAP + 5; i++) await recordEvent(post({ event: 'lookup' }), db);
    expect(rows).toHaveLength(DAILY_CAP);
  });

  it('prunes rows older than the retention window', async () => {
    const { db, rows } = fakeDb();
    rows.push({ day: '2026-01-01', ts: 0, who: 'a', event: 'upload', detail: '' }, { day: '2026-11-01', ts: 0, who: 'a', event: 'upload', detail: '' });
    await pruneEvents(db, new Date('2026-11-27T00:00:00Z'));
    expect(rows.map((r) => r.day)).toEqual(['2026-11-01']);
  });

  it('shows the stats page only to the owner', async () => {
    const { db } = fakeDb();
    const get = (email: string, jwt = true) =>
      new Request('https://x/api/stats', { headers: { 'Cf-Access-Authenticated-User-Email': email, ...(jwt ? { 'Cf-Access-Jwt-Assertion': 'x' } : {}) } });
    expect((await statsPage(get('owner@example.com'), db, 'owner@example.com, other@example.com')).status).toBe(200);
    expect((await statsPage(get('someone@example.com'), db, 'owner@example.com')).status).toBe(404);
    expect((await statsPage(get('owner@example.com', false), db, 'owner@example.com')).status).toBe(404);
    expect((await statsPage(get('owner@example.com'), db, undefined)).status).toBe(404);
  });
});
