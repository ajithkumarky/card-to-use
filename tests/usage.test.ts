import { describe, expect, it } from 'vitest';
import { DAILY_WRITES, RETAIN_DAYS, parseBatch, recordEvents, statsPage, type KVStore } from '../worker/usage';

/** An in-memory stand-in for KV that keeps values, metadata and the expiry asked for. */
function fakeKv() {
  const data = new Map<string, { value: string; metadata?: unknown; ttl?: number }>();
  let writes = 0;
  const kv: KVStore = {
    async get(key) {
      return data.get(key)?.value ?? null;
    },
    async put(key, value, o) {
      writes++;
      data.set(key, { value, metadata: o?.metadata, ttl: o?.expirationTtl });
    },
    async list({ prefix }) {
      const keys = [...data].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, v]) => ({ name, metadata: v.metadata }));
      return { keys, list_complete: true };
    },
  };
  return { kv, data, writes: () => writes };
}

const post = (body: unknown, email = 'a@example.com') =>
  new Request('https://x/api/event', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: email ? { 'Cf-Access-Authenticated-User-Email': email } : {},
  });

describe('usage events', () => {
  it('accepts only listed events and details', () => {
    expect(parseBatch({ counts: { 'tab:wallet': 2, 'upload:': 1, upload: 1 } })).toEqual({ 'tab:wallet': 2, 'upload:': 1 });
    expect(parseBatch({ counts: { 'tab:Costco': 1 } })).toBeNull();
    expect(parseBatch({ counts: { 'lookup:Starbucks': 1 } })).toBeNull();
    expect(parseBatch({ counts: { 'merchant:': 1 } })).toBeNull();
    expect(parseBatch({ counts: { 'toString:': 1 } })).toBeNull();
    expect(parseBatch({ counts: { 'upload:': 1.5 } })).toBeNull();
    expect(parseBatch({ counts: { 'upload:': 0 } })).toBeNull();
    expect(parseBatch({ counts: {} })).toBeNull();
    expect(parseBatch('upload')).toBeNull();
  });

  it('adds batches into one key per person per day that expires after the retention window', async () => {
    const { kv, data, writes } = fakeKv();
    const now = new Date('2026-11-27T12:00:00Z');
    expect((await recordEvents(post({ counts: { 'tab:plan': 2 }, merchant: 'Costco' }, 'A@Example.com'), kv, now)).status).toBe(204);
    await recordEvents(post({ counts: { 'tab:plan': 1, 'lookup:': 3 } }, 'a@example.com'), kv, now);
    const stored = data.get('usage:2026-11-27:a@example.com')!;
    expect(JSON.parse(stored.value)).toEqual({ c: { 'tab:plan': 3, 'lookup:': 3 }, last: now.getTime(), w: 2 });
    expect(stored.metadata).toEqual(JSON.parse(stored.value));
    expect(stored.ttl).toBe(RETAIN_DAYS * 86400);
    expect(stored.value).not.toContain('Costco');
    expect(writes()).toBe(2);
  });

  it('never touches the rotating feed key', async () => {
    const { kv, data } = fakeKv();
    await kv.put('feed', '{"x":1}');
    await recordEvents(post({ counts: { 'upload:': 1 } }), kv);
    expect(data.get('feed')!.value).toBe('{"x":1}');
  });

  it('drops unsigned, unknown, oversized and over-cap batches', async () => {
    const { kv, data, writes } = fakeKv();
    await recordEvents(post({ counts: { 'upload:': 1 } }, ''), kv);
    await recordEvents(post({ counts: { 'nope:': 1 } }), kv);
    await recordEvents(post('not json'), kv);
    await recordEvents(post({ counts: { 'upload:': 1 }, pad: 'x'.repeat(1100) }), kv);
    expect(data.size).toBe(0);
    for (let i = 0; i < DAILY_WRITES + 5; i++) await recordEvents(post({ counts: { 'lookup:': 1 } }), kv);
    expect(writes()).toBe(DAILY_WRITES);
  });

  it('shows the stats page only to the owner, with the stored counts', async () => {
    const { kv } = fakeKv();
    const now = new Date('2026-11-27T12:00:00Z');
    await recordEvents(post({ counts: { 'lookup:': 4 } }, 'mom@example.com'), kv, now);
    await recordEvents(post({ counts: { 'upload:': 1 } }, 'mom@example.com'), kv, new Date('2026-09-01T12:00:00Z'));
    const get = (email: string, jwt = true) =>
      new Request('https://x/api/stats', { headers: { 'Cf-Access-Authenticated-User-Email': email, ...(jwt ? { 'Cf-Access-Jwt-Assertion': 'x' } : {}) } });
    const ok = await statsPage(get('owner@example.com'), kv, 'owner@example.com, other@example.com', now);
    expect(ok.status).toBe(200);
    const html = await ok.text();
    expect(html).toContain('mom@example.com');
    expect(html).toContain('Ran a “Which card here?” lookup');
    expect(html).not.toContain('Uploaded a file'); // older than 30 days
    expect((await statsPage(get('someone@example.com'), kv, 'owner@example.com')).status).toBe(404);
    expect((await statsPage(get('owner@example.com', false), kv, 'owner@example.com')).status).toBe(404);
    expect((await statsPage(get('owner@example.com'), kv, undefined)).status).toBe(404);
  });
});
