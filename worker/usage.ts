/**
 * Usage analytics for the owner: which features get used, and by whom. Nothing about anyone's purchases ever
 * reaches this code. The browser sends only an event name from EVENTS (plus, for a few, which tab or page),
 * and anything else is rejected. The person comes from the email Cloudflare Access already puts on each request.
 * Rows live in D1 (free plan: 100,000 writes a day) and are deleted after RETAIN_DAYS.
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
/** Stops a stuck page from filling the table: events past this many per person per day are dropped. */
export const DAILY_CAP = 500;

export interface UsageEvent {
  event: string;
  detail: string;
}

/** Returns the event if it is on the list, otherwise null. */
export function parseEvent(body: unknown): UsageEvent | null {
  if (!body || typeof body !== 'object') return null;
  const { event, detail = '' } = body as Record<string, unknown>;
  if (typeof event !== 'string' || !Object.hasOwn(EVENTS, event) || typeof detail !== 'string') return null;
  const allowed = EVENTS[event];
  if (allowed.length ? !allowed.includes(detail) : detail !== '') return null;
  return { event, detail };
}

export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface D1 {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<unknown>;
}

let ready: Promise<unknown> | null = null;
/** Creates the table on first use, once per Worker instance, so no migration step is needed. */
function ensureTable(db: D1) {
  ready ??= db
    .batch([
      db.prepare('CREATE TABLE IF NOT EXISTS events (day TEXT NOT NULL, ts INTEGER NOT NULL, who TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL)'),
      db.prepare('CREATE INDEX IF NOT EXISTS events_day ON events (day, who)'),
    ])
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const accessEmail = (request: Request) => (request.headers.get('Cf-Access-Authenticated-User-Email') ?? '').trim().toLowerCase();

/** POST /api/event. Always answers 204 so the page never waits on or reacts to analytics. */
export async function recordEvent(request: Request, db: D1 | undefined, now = new Date()): Promise<Response> {
  const done = new Response(null, { status: 204 });
  const who = accessEmail(request);
  if (!db || !who) return done;
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 200) return done;
    body = JSON.parse(text);
  } catch {
    return done;
  }
  const ev = parseEvent(body);
  if (!ev) return done;
  try {
    await ensureTable(db);
    const day = dayOf(now);
    const count = await db.prepare('SELECT COUNT(*) AS n FROM events WHERE day = ? AND who = ?').bind(day, who).first<{ n: number }>();
    if ((count?.n ?? 0) >= DAILY_CAP) return done;
    await db.prepare('INSERT INTO events (day, ts, who, event, detail) VALUES (?, ?, ?, ?, ?)').bind(day, now.getTime(), who, ev.event, ev.detail).run();
  } catch (e) {
    console.log(JSON.stringify({ usage: 'write failed', error: String((e as Error)?.message ?? e).slice(0, 200) }));
  }
  return done;
}

/** Run by the daily cron: deletes rows older than RETAIN_DAYS. */
export async function pruneEvents(db: D1 | undefined, now = new Date()) {
  if (!db) return;
  await ensureTable(db);
  const cutoff = dayOf(new Date(now.getTime() - RETAIN_DAYS * 86400_000));
  await db.prepare('DELETE FROM events WHERE day < ?').bind(cutoff).run();
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
export async function statsPage(request: Request, db: D1 | undefined, ownerList: string | undefined, now = new Date()): Promise<Response> {
  const who = accessEmail(request);
  if (!who || !request.headers.get('Cf-Access-Jwt-Assertion') || !owners(ownerList).includes(who)) return new Response('Not found', { status: 404 });
  const since = dayOf(new Date(now.getTime() - 29 * 86400_000));
  let byDay: { day: string; people: number; events: number }[] = [];
  let byFeature: { event: string; detail: string; n: number; people: number }[] = [];
  let byPerson: { who: string; days: number; events: number; last: number }[] = [];
  if (db) {
    await ensureTable(db);
    [byDay, byFeature, byPerson] = await Promise.all([
      db.prepare('SELECT day, COUNT(DISTINCT who) AS people, COUNT(*) AS events FROM events WHERE day >= ? GROUP BY day ORDER BY day DESC').bind(since).all<(typeof byDay)[0]>().then((r) => r.results),
      db.prepare('SELECT event, detail, COUNT(*) AS n, COUNT(DISTINCT who) AS people FROM events WHERE day >= ? GROUP BY event, detail ORDER BY n DESC').bind(since).all<(typeof byFeature)[0]>().then((r) => r.results),
      db.prepare('SELECT who, COUNT(DISTINCT day) AS days, COUNT(*) AS events, MAX(ts) AS last FROM events WHERE day >= ? GROUP BY who ORDER BY last DESC').bind(since).all<(typeof byPerson)[0]>().then((r) => r.results),
    ]);
  }
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
${byFeature.map((f) => `<tr><td>${esc(LABELS[`${f.event}:${f.detail}`] ?? `${f.event} ${f.detail}`)}</td><td class="n">${f.n}</td><td class="n">${f.people}</td><td class="b">${bar(f.n, maxFeat)}</td></tr>`).join('') || '<tr><td colspan="4">No usage yet.</td></tr>'}</table></div>
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
