/**
 * Usage analytics for the owner: which features get used, and by whom. Nothing about anyone's purchases ever
 * reaches this code. The browser sends counts of event names from EVENTS (plus, for a few, which tab or page),
 * and anything else is rejected. The person comes from the email Cloudflare Access already puts on each request.
 *
 * Storage is Workers KV, in the ROTATING namespace under the "usage:" prefix (the rotating feed uses "feed").
 * KV's free plan allows 1,000 writes a day, so the page batches its events and sends them at most every few
 * minutes and when it's hidden, and the Worker keeps one key per person per day ("usage:<day>:<email>") holding
 * that day's counts. Each key expires after RETAIN_DAYS, so no cleanup job is needed. The counts are also kept
 * in the key's metadata, so the stats page reads everything with a single list call.
 */

/** Every event the app may send, with the details each one may carry. Nothing outside this list is stored. */
export const EVENTS: Record<string, readonly string[]> = {
  open: ['plan', 'use', 'cards'], // the app was opened or a top page shown
  tab: ['plan', 'suggest', 'wallet', 'merchants', 'columns'], // a tab on the spending analysis
  upload: [], // a transaction file was read (its name and contents are not sent)
  sample: [], // sample data was loaded
  lookup: [], // "Which card here?" showed an answer (what was typed is not sent)
  cards_saved: [], // the person saved their cards (which cards is not sent)
  forget: [], // "Forget me" was used
};

export const RETAIN_DAYS = 180;
/** Writes per person per day. 40 people at this cap would still fit KV's 1,000 free writes a day. */
export const DAILY_WRITES = 20;
const PREFIX = 'usage:';

/** One person's counts for one day, keyed "event:detail" ("tab:wallet", "upload:"). */
export interface DayRecord {
  c: Record<string, number>;
  last: number;
  w: number;
}

/** Returns the batch of counts if every entry is on the list, otherwise null. */
export function parseBatch(body: unknown): Record<string, number> | null {
  if (!body || typeof body !== 'object') return null;
  const counts = (body as { counts?: unknown }).counts;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
  const entries = Object.entries(counts as Record<string, unknown>);
  if (!entries.length || entries.length > 20) return null;
  const out: Record<string, number> = {};
  for (const [key, n] of entries) {
    const i = key.indexOf(':');
    const event = i < 0 ? key : key.slice(0, i);
    const detail = i < 0 ? '' : key.slice(i + 1);
    if (!Object.hasOwn(EVENTS, event) || !Number.isInteger(n) || (n as number) < 1 || (n as number) > 500) return null;
    const allowed = EVENTS[event];
    if (allowed.length ? !allowed.includes(detail) : detail !== '') return null;
    out[`${event}:${detail}`] = n as number;
  }
  return out;
}

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ keys: { name: string; metadata?: unknown }[]; list_complete: boolean; cursor?: string }>;
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const accessEmail = (request: Request) => (request.headers.get('Cf-Access-Authenticated-User-Email') ?? '').trim().toLowerCase();

const isRecord = (v: unknown): v is DayRecord =>
  !!v && typeof v === 'object' && typeof (v as DayRecord).c === 'object' && typeof (v as DayRecord).last === 'number' && typeof (v as DayRecord).w === 'number';

/** POST /api/event. Always answers 204 so the page never waits on or reacts to analytics. */
export async function recordEvents(request: Request, kv: KVStore | undefined, now = new Date()): Promise<Response> {
  const done = new Response(null, { status: 204 });
  const who = accessEmail(request);
  if (!kv || !who || who.length > 200) return done;
  let counts: Record<string, number> | null;
  try {
    const text = await request.text();
    if (text.length > 1000) return done;
    counts = parseBatch(JSON.parse(text));
  } catch {
    return done;
  }
  if (!counts) return done;
  try {
    const key = `${PREFIX}${dayOf(now)}:${who}`;
    let rec: DayRecord = { c: {}, last: 0, w: 0 };
    const raw = await kv.get(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) rec = parsed;
    }
    if (rec.w >= DAILY_WRITES) return done;
    for (const [k, n] of Object.entries(counts)) rec.c[k] = (rec.c[k] ?? 0) + n;
    rec.last = now.getTime();
    rec.w += 1;
    const value = JSON.stringify(rec);
    // The same counts go in the metadata (limit 1,024 bytes; the full event list fits) so the stats page needs only list calls.
    await kv.put(key, value, { expirationTtl: RETAIN_DAYS * 86400, metadata: value.length <= 1000 ? rec : undefined });
  } catch (e) {
    console.log(JSON.stringify({ usage: 'write failed', error: String((e as Error)?.message ?? e).slice(0, 200) }));
  }
  return done;
}

/** Every person-day since `since`, read from key metadata (falling back to the value). */
async function readDays(kv: KVStore, since: string) {
  const out: { day: string; who: string; rec: DayRecord }[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: PREFIX, cursor });
    for (const k of page.keys) {
      const day = k.name.slice(PREFIX.length, PREFIX.length + 10);
      if (day < since) continue;
      const who = k.name.slice(PREFIX.length + 11);
      let rec = isRecord(k.metadata) ? k.metadata : null;
      if (!rec) {
        try {
          const v: unknown = JSON.parse((await kv.get(k.name)) ?? 'null');
          if (isRecord(v)) rec = v;
        } catch {
          // Skip a damaged key.
        }
      }
      if (rec) out.push({ day, who, rec });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LABELS: Record<string, string> = {
  'open:use': 'Opened “Which card here?”',
  'open:cards': 'Opened “My cards”',
  'open:plan': 'Opened “Analyze my spending”',
  'tab:plan': 'Tab: Which card where',
  'tab:suggest': 'Tab: Cards to consider',
  'tab:wallet': 'Tab: My cards',
  'tab:merchants': 'Tab: Merchants',
  'tab:columns': 'Tab: File columns',
  'upload:': 'Uploaded a file',
  'sample:': 'Loaded sample data',
  'lookup:': 'Ran a “Which card here?” lookup',
  'cards_saved:': 'Saved their cards',
  'forget:': 'Used “Forget me”',
};

/** The owner list, from the STATS_OWNER secret (comma-separated emails). */
export const owners = (raw: string | undefined) => (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** GET /api/stats: a plain HTML report for the owner. Anyone else gets a 404, as if the page didn't exist. */
export async function statsPage(request: Request, kv: KVStore | undefined, ownerList: string | undefined, now = new Date()): Promise<Response> {
  const who = accessEmail(request);
  if (!who || !request.headers.get('Cf-Access-Jwt-Assertion') || !owners(ownerList).includes(who)) return new Response('Not found', { status: 404 });
  const since = dayOf(new Date(now.getTime() - 29 * 86400_000));
  const rows = kv ? await readDays(kv, since) : [];
  const sum = (c: Record<string, number>) => Object.values(c).reduce((a, n) => a + n, 0);

  const days = new Map<string, { people: number; events: number }>();
  const feats = new Map<string, { n: number; people: Set<string> }>();
  const people = new Map<string, { days: number; events: number; last: number }>();
  for (const { day, who: w, rec } of rows) {
    const d = days.get(day) ?? { people: 0, events: 0 };
    d.people += 1;
    d.events += sum(rec.c);
    days.set(day, d);
    for (const [k, n] of Object.entries(rec.c)) {
      const f = feats.get(k) ?? { n: 0, people: new Set<string>() };
      f.n += n;
      f.people.add(w);
      feats.set(k, f);
    }
    const p = people.get(w) ?? { days: 0, events: 0, last: 0 };
    p.days += 1;
    p.events += sum(rec.c);
    p.last = Math.max(p.last, rec.last);
    people.set(w, p);
  }
  const byDay = [...days].map(([day, d]) => ({ day, ...d })).sort((a, b) => (a.day < b.day ? 1 : -1));
  const byFeature = [...feats].map(([k, f]) => ({ key: k, n: f.n, people: f.people.size })).sort((a, b) => b.n - a.n);
  const byPerson = [...people].map(([w, p]) => ({ who: w, ...p })).sort((a, b) => b.last - a.last);
  const maxDay = Math.max(1, ...byDay.map((d) => d.events));
  const maxFeat = Math.max(1, ...byFeature.map((f) => f.n));
  const bar = (n: number, max: number) => `<span class="bar" style="width:${Math.round((n / max) * 100)}%"></span>`;
  const when = (ts: number) => new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const totalPeople = byPerson.length;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Usage · Card to Use</title><style>
:root{color-scheme:light dark;--fg:#1a1d24;--mute:#5d6472;--bg:#f7f7f9;--card:#fff;--line:#e3e5ea;--accent:#3a5bd9}
@media (prefers-color-scheme:dark){:root{--fg:#e8eaf0;--mute:#9aa1ae;--bg:#14161b;--card:#1c1f26;--line:#2c303a;--accent:#7d97f5}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}main{max-width:860px;margin:0 auto;padding:24px 16px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}p{color:var(--mute);margin:0 0 12px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.tile b{display:block;font-size:26px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}th{color:var(--mute);font-weight:600;font-size:13px}
td.n{text-align:right;width:70px}td.b{width:35%}.bar{display:block;height:8px;border-radius:4px;background:var(--accent)}tr:last-child td{border-bottom:0}.wrap{overflow-x:auto}
</style></head><body><main>
<h1>Usage, last 30 days</h1>
<p>Only feature names are recorded, never merchants, amounts, files or cards. Rows are deleted after ${RETAIN_DAYS} days.</p>
<div class="tiles"><div class="tile"><b>${totalPeople}</b>people</div><div class="tile"><b>${byDay.reduce((s, d) => s + d.events, 0)}</b>events</div><div class="tile"><b>${byDay[0]?.day === dayOf(now) ? byDay[0].people : 0}</b>people today</div></div>
<h2>People</h2><div class="wrap"><table><tr><th>Email</th><th>Last used</th><th class="n">Days</th><th class="n">Events</th></tr>
${byPerson.map((p) => `<tr><td>${esc(p.who)}</td><td>${when(p.last)}</td><td class="n">${p.days}</td><td class="n">${p.events}</td></tr>`).join('') || '<tr><td colspan="4">No usage yet.</td></tr>'}</table></div>
<h2>Features</h2><div class="wrap"><table><tr><th>What</th><th class="n">Times</th><th class="n">People</th><th></th></tr>
${byFeature.map((f) => `<tr><td>${esc(LABELS[f.key] ?? f.key)}</td><td class="n">${f.n}</td><td class="n">${f.people}</td><td class="b">${bar(f.n, maxFeat)}</td></tr>`).join('') || '<tr><td colspan="4">No usage yet.</td></tr>'}</table></div>
<h2>By day</h2><div class="wrap"><table><tr><th>Day (UTC)</th><th class="n">People</th><th class="n">Events</th><th></th></tr>
${byDay.map((d) => `<tr><td>${d.day}</td><td class="n">${d.people}</td><td class="n">${d.events}</td><td class="b">${bar(d.events, maxDay)}</td></tr>`).join('') || '<tr><td colspan="4">No usage yet.</td></tr>'}</table></div>
</main></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
