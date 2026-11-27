import { useMemo, useState, type FormEvent } from 'react';
import { BRANDS, CATEGORY_LABELS, brandOf, categorize, groupLabel, merchantKey } from '../core/categories';
import { programs } from '../core/catalog';
import type { ColumnMap, ParsedFile } from '../core/parse';
import { centsPerPoint, matchCardLabel, rateFor, rotatingBonus, type Plan } from '../core/recommend';
import { CATEGORY_IDS, type BrandId, type Card, type CategoryId, type PointMode, type ProgramId, type Transaction } from '../core/types';
import { fullName, rateText, usd } from './format';

const label = (c: CategoryId) => CATEGORY_LABELS[c];

export function Mini({ card }: { card: Card }) {
  return <span className="mini" style={{ background: card.color }} aria-hidden="true" />;
}

export function CardArt({ card }: { card: Card }) {
  return (
    <div className={`cc${card.light ? ' lt' : ''}`} style={{ background: `linear-gradient(135deg, ${card.color}, color-mix(in srgb, ${card.color} 70%, #000))` }}>
      <div className="chip" />
      <div>
        <div className="nm">{card.name}</div>
        <div className="is">{card.issuer}</div>
      </div>
    </div>
  );
}

/** Cards grouped by issuer, in catalog order. */
function byIssuer(cards: Card[]): [string, Card[]][] {
  const groups = new Map<string, Card[]>();
  for (const c of cards) groups.set(c.issuer, [...(groups.get(c.issuer) ?? []), c]);
  return [...groups.entries()];
}

interface PickerProps {
  cards: Card[];
  held: string[];
  onDone: (ids: string[]) => void;
  doneLabel?: string;
  intro?: string;
}

export function CardPicker({ cards, held, onDone, doneLabel = 'Show my recommendations', intro }: PickerProps) {
  const [picked, setPicked] = useState<string[]>(held);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? cards.filter((c) => [fullName(c).toLowerCase(), ...c.aliases].some((a) => a.includes(q))) : cards;
  return (
    <section className="form">
      <h3>Which of these cards do you hold?</h3>
      <p className="note">{intro ?? 'Tick every card you have so the recommendations only use your wallet. You can add a card that isn’t listed on the My cards tab.'}</p>
      <label className="find">
        Find a card
        <input type="search" value={query} placeholder="Name or issuer, like Delta or Venture" onChange={(e) => setQuery(e.target.value)} />
      </label>
      {byIssuer(shown).map(([issuer, group]) => (
        <fieldset className="issuer" key={issuer}>
          <legend>{issuer}</legend>
          <div className="checks">
            {group.map((c) => (
              <label className="ck" key={c.id}>
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                />
                <Mini card={c} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {!shown.length && <p className="note">No listed card matches “{query}”.</p>}
      <button className="btn" disabled={!picked.length} onClick={() => onDone(picked)}>
        {doneLabel}
      </button>
    </section>
  );
}

export function PlanView({ plan, held, mode, versus, onRotating }: { plan: Plan; held: Card[]; mode: PointMode; versus: string; onRotating: () => void }) {
  if (!held.length) return <p>Add the cards you hold on the My cards tab.</p>;
  const max = Math.max(1, ...plan.categories.map((c) => c.yearlySpend));
  const rotators = held.filter((c) => c.rotating);
  return (
    <section>
      <h2>Which card to use for each category</h2>
      <p className="sub">Sorted by yearly spend. Each row shows the card that earns most, where caps run out, and what you gain compared with {versus}.</p>
      {rotators.map((c) => {
        const r = c.rotating!;
        const bonus = rotatingBonus(c, plan, programs, mode);
        return (
          <div className="flag" key={c.id}>
            <b>⚠ Rotating {r.rate}% on {c.name}</b>,{' '}
            {r.categories.length ? (
              <>
                {r.quarter}: {r.categories.map(label).join(', ')}. Activate it first; {r.rate}% only covers the first {usd(r.quarterlyCap)} of the quarter. It could add about{' '}
                {usd(bonus)} this quarter over the plan below. Not counted in the yearly figures because the categories change.
              </>
            ) : (
              <>
                categories change every quarter. Check {c.issuer}’s site for this quarter’s list, then{' '}
                <button className="btn ghost" style={{ minHeight: 32, padding: '2px 10px' }} onClick={onRotating}>
                  set them on My cards
                </button>
              </>
            )}
          </div>
        );
      })}
      <div className="board">
        {plan.categories.map((p) => {
          const delta = p.earned - p.baseline;
          return (
            <div className="row" key={`${p.category}-${p.brand ?? ''}`}>
              <div className="cat">
                {groupLabel(p.category, p.brand)}
                <small>{usd(p.yearlySpend)} a year</small>
              </div>
              <div className="bar" role="img" aria-label={`${usd(p.yearlySpend)} a year`}>
                <i style={{ width: `${((p.yearlySpend / max) * 100).toFixed(1)}%` }} />
              </div>
              <div className="pick">
                {p.segments.map((g, i) => (
                  <div className="seg" key={`${g.card.id}-${i}`}>
                    <Mini card={g.card} />
                    <span>
                      <b>{g.card.name}</b>
                      <br />
                      {rateText(g.card, g.rate, programs, mode)}
                      {p.segments.length > 1 && ` on ${i === 0 ? 'the first' : 'the next'} ${usd(g.spend)}`}
                    </span>
                  </div>
                ))}
                {p.runnerUp && (
                  <span className="note">
                    Next best: {p.runnerUp.card.name}, {rateText(p.runnerUp.card, p.runnerUp.rate, programs, mode)}
                  </span>
                )}
              </div>
              <div className="val">
                <b>{usd(p.earned)}</b>
                {delta >= 1 ? <small>+{usd(delta)}</small> : <span className="note">no change</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface WalletProps {
  all: Card[];
  held: Card[];
  plan: Plan | null;
  mode: PointMode;
  onHeld: (ids: string[]) => void;
  onCustom: (c: Card) => void;
  rotating: Record<string, CategoryId[]>;
  onRotating: (id: string, cats: CategoryId[]) => void;
}

export function WalletView({ all, held, plan, mode, onHeld, onCustom, onRotating }: WalletProps) {
  const ids = held.map((c) => c.id);
  const available = all.filter((c) => !ids.includes(c.id));
  const [pick, setPick] = useState('');
  const [showForm, setShowForm] = useState(false);
  const chosen = available.some((c) => c.id === pick) ? pick : available[0]?.id ?? '';
  return (
    <section>
      <h2>Cards in your wallet</h2>
      <p className="sub">Each tile shows the rates, caps, fee and APR, and whether the card pays for itself at your spending.</p>
      <div className="addbar">
        <label className="sr" htmlFor="lib">Add a listed card</label>
        <select id="lib" value={chosen} onChange={(e) => setPick(e.target.value)} disabled={!available.length}>
          {available.length
            ? byIssuer(available).map(([issuer, group]) => (
                <optgroup key={issuer} label={issuer}>
                  {group.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                </optgroup>
              ))
            : <option>All listed cards added</option>}
        </select>
        <button className="btn" disabled={!chosen} onClick={() => onHeld([...ids, chosen])}>Add card</button>
        <button className="btn ghost" onClick={() => setShowForm(true)}>Add a card that isn’t listed</button>
      </div>
      {showForm && <CustomCardForm onSave={(c) => { onCustom(c); setShowForm(false); }} onCancel={() => setShowForm(false)} count={all.filter((c) => c.custom).length} />}
      <div className="tiles">
        {held.map((c) => {
          const sum = plan?.cards.find((s) => s.card.id === c.id);
          const program = programs[c.program];
          return (
            <article className="tile" key={c.id}>
              <CardArt card={c} />
              <dl className="kv">
                <dt>Annual fee</dt>
                <dd>{usd(c.annualFee)}</dd>
                <dt>APR</dt>
                <dd>{c.apr}</dd>
                <dt>Rewards</dt>
                <dd>{program.name}</dd>
                {c.program !== 'cash' && (
                  <>
                    <dt>Point value</dt>
                    <dd>{program.bestCents}¢ best, {program.cashCents}¢ cash</dd>
                  </>
                )}
              </dl>
              <div className="rates">
                {(Object.entries(c.rates) as [CategoryId, { rate: number; cap?: number }][]).map(([cat, r]) => (
                  <div key={cat}>
                    <span>{label(cat)}</span>
                    <span>{rateText(c, r.rate, programs, mode)}{r.cap ? ` up to ${usd(r.cap)}/yr` : ''}</span>
                  </div>
                ))}
                {(Object.entries(c.brands ?? {}) as [BrandId, { rate: number; cap?: number }][]).map(([b, r]) => (
                  <div key={b}>
                    <span>{BRANDS[b].name}</span>
                    <span>{rateText(c, r.rate, programs, mode)}{r.cap ? ` up to ${usd(r.cap)}/yr` : ''}</span>
                  </div>
                ))}
                <div>
                  <span>Everything else</span>
                  <span>{rateText(c, c.base, programs, mode)}</span>
                </div>
              </div>
              {c.rotating && (
                <div className="flag" style={{ margin: 0 }}>
                  <b>⚠ Rotating {c.rotating.rate}%</b> up to {usd(c.rotating.quarterlyCap)} a quarter. Activate each quarter.{' '}
                  {c.rotating.categories.length ? `Now set to ${c.rotating.categories.map(label).join(', ')}.` : 'No categories set yet.'}
                  <details open={!c.rotating.categories.length}>
                  <summary>Set {c.rotating.quarter}’s categories from {c.issuer}’s site</summary>
                  <div className="rotpick">
                    {CATEGORY_IDS.filter((k) => k !== 'other').map((k) => (
                      <label className="ck" key={k}>
                        <input
                          type="checkbox"
                          checked={c.rotating!.categories.includes(k)}
                          onChange={(e) =>
                            onRotating(c.id, e.target.checked ? [...c.rotating!.categories, k] : c.rotating!.categories.filter((x) => x !== k))
                          }
                        />
                        {label(k)}
                      </label>
                    ))}
                  </div>
                  </details>
                </div>
              )}
              {c.notes && <p className="note">{c.notes}</p>}
              {sum && (
                <>
                  <p style={{ fontSize: 14 }}>
                    <b>Use for:</b> {sum.categories.length ? sum.categories.map(label).join(', ') : 'nothing at your current spending'}
                  </p>
                  <p className={`verdict${sum.net < 0 ? ' bad' : ''}`}>
                    {sum.earned ? `Earns ${usd(sum.earned)} a year in this plan` : 'Earns nothing in this plan'}
                    {c.annualFee
                      ? sum.net >= 0
                        ? `, ${usd(sum.net)} more than its fee.`
                        : `. ▼ Below its fee: earns ${usd(-sum.net)} less than it costs. Credits and perks aren’t counted.`
                      : '.'}
                  </p>
                </>
              )}
              <button className="btn ghost" onClick={() => onHeld(ids.filter((x) => x !== c.id))}>Remove</button>
            </article>
          );
        })}
      </div>
      {!held.length && <p>No cards yet. Add one above.</p>}
    </section>
  );
}

function CustomCardForm({ onSave, onCancel, count }: { onSave: (c: Card) => void; onCancel: () => void; count: number }) {
  const [name, setName] = useState('');
  const [fee, setFee] = useState('0');
  const [program, setProgram] = useState<ProgramId>('cash');
  const [base, setBase] = useState('1');
  const [rates, setRates] = useState<Partial<Record<CategoryId, string>>>({});
  function submit(e: FormEvent) {
    e.preventDefault();
    const r: Card['rates'] = {};
    for (const [k, v] of Object.entries(rates) as [CategoryId, string][]) if (v !== '' && Number.isFinite(+v)) r[k] = { rate: +v };
    onSave({
      id: `custom-${count + 1}`,
      name: name.trim() || 'My card',
      issuer: 'Custom card',
      annualFee: Math.max(0, +fee || 0),
      apr: 'Not entered',
      program,
      base: Math.max(0, +base || 0),
      rates: r,
      color: ['#0b7a75', '#5b6b7f', '#d64f6b', '#3d8b37'][count % 4],
      aliases: [name.trim().toLowerCase()].filter(Boolean),
      custom: true,
    });
  }
  return (
    <form className="form" onSubmit={submit}>
      <h3>Add a card that isn’t listed</h3>
      <div className="g">
        <label>Card name<input type="text" id="c-name" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Annual fee ($)<input type="number" id="c-fee" min="0" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
        <label>
          Rewards type
          <select id="c-prog" value={program} onChange={(e) => setProgram(e.target.value as ProgramId)}>
            {Object.values(programs).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Everything else (x or %)<input type="number" id="c-base" step="0.1" min="0" value={base} onChange={(e) => setBase(e.target.value)} /></label>
      </div>
      <p className="note">Rate per category, as points per dollar or percent cash back. Leave blank to use the everything-else rate.</p>
      <div className="g">
        {CATEGORY_IDS.filter((k) => k !== 'other').map((k) => (
          <label key={k}>
            {label(k)}
            <input type="number" step="0.1" min="0" id={`c-${k}`} value={rates[k] ?? ''} onChange={(e) => setRates((r) => ({ ...r, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="row-btns">
        <button className="btn" type="submit">Save card</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

interface MerchantsProps {
  transactions: Transaction[];
  held: Card[];
  mode: PointMode;
  overrides: Record<string, CategoryId>;
  onOverride: (key: string, c: CategoryId) => void;
}

/** The held card that pays most per dollar for one merchant, ignoring caps. */
function bestFor(held: Card[], cat: CategoryId, brand: BrandId | undefined, mode: PointMode) {
  let best: { card: Card; rate: number; cents: number } | undefined;
  for (const card of held) {
    const rate = rateFor(card, cat, brand).rate;
    const cents = rate * centsPerPoint(card, programs, mode);
    if (!best || cents > best.cents || (cents === best.cents && card.program === 'cash' && best.card.program !== 'cash')) best = { card, rate, cents };
  }
  return best;
}

export function MerchantsView({ transactions, held, mode, overrides, onOverride }: MerchantsProps) {
  const [query, setQuery] = useState('');
  const merchants = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; count: number; spend: number; bank: string }>();
    for (const t of transactions) {
      const key = merchantKey(t.description);
      const g = groups.get(key) ?? { key, name: t.description, count: 0, spend: 0, bank: t.bankCategory };
      g.count++;
      g.spend += t.amount;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.spend - a.spend);
  }, [transactions]);
  const q = query.trim().toLowerCase();
  const matches = q ? merchants.filter((m) => m.name.toLowerCase().includes(q) || m.key.includes(q)) : merchants;
  const shown = q ? matches : matches.slice(0, 60);
  return (
    <section>
      <h2>Which card to use at each merchant</h2>
      <p className="sub">
        Issuers reward by a merchant code that bank exports leave out, so the app sorts by merchant name and your bank’s category. Fix any merchant and every
        purchase from it moves. The best card ignores yearly caps; the Which card where tab accounts for them.
      </p>
      <label className="find">
        Find a merchant
        <input type="search" value={query} placeholder="Like Starbucks, Delta or Costco" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p className="note">
        {q
          ? `${matches.length} of ${merchants.length} merchants match.`
          : merchants.length > 60
            ? `Showing your top 60 of ${merchants.length} merchants by spend. Search to find the rest.`
            : `${merchants.length} merchants.`}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Merchant</th><th className="n">Purchases</th><th className="n">Spent</th><th>Category</th><th>Best card</th></tr>
          </thead>
          <tbody>
            {shown.map((m) => {
              const cat = categorize(m.name, m.bank, overrides);
              const brand = brandOf(m.name, cat);
              const best = bestFor(held, cat, brand, mode);
              return (
                <tr key={m.key}>
                  <td>
                    {m.name}
                    {brand && <small className="tag">{BRANDS[brand].name}</small>}
                  </td>
                  <td className="n">{m.count}</td>
                  <td className="n">{usd(m.spend)}</td>
                  <td>
                    <select aria-label={`Category for ${m.name}`} value={cat} onChange={(e) => onOverride(m.key, e.target.value as CategoryId)}>
                      {CATEGORY_IDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
                    </select>
                  </td>
                  <td>
                    {best ? (
                      <span className="bestcard">
                        <Mini card={best.card} />
                        <span>
                          {best.card.name}
                          <small>{rateText(best.card, best.rate, programs, mode)}</small>
                        </span>
                      </span>
                    ) : (
                      <span className="note">Add your cards</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {q && !matches.length && <p className="note">No merchant in your file matches “{query}”.</p>}
    </section>
  );
}

interface ColumnsProps {
  file: ParsedFile;
  cols: ColumnMap;
  onCols: (c: ColumnMap) => void;
  negative: boolean;
  onNegative: (v: boolean) => void;
  months: number;
  onMonths: (m: number) => void;
  transactions: Transaction[];
  held: Card[];
  cardLabels: Record<string, string>;
  onCardLabel: (label: string, id: string) => void;
}

const FIELDS: [keyof ColumnMap, string][] = [
  ['date', 'Date'],
  ['description', 'Description or merchant'],
  ['amount', 'Amount'],
  ['debit', 'Debit (if separate)'],
  ['credit', 'Credit (if separate)'],
  ['category', 'Bank category'],
  ['card', 'Card used'],
];

export function ColumnsView({ file, cols, onCols, negative, onNegative, months, onMonths, transactions, held, cardLabels, onCardLabel }: ColumnsProps) {
  const labels = [...new Set(transactions.map((t) => t.cardLabel).filter(Boolean))];
  const separate = cols.debit >= 0 || cols.credit >= 0;
  return (
    <section>
      <h2>Columns found in your file</h2>
      <p className="sub">Matched from the header row. Change any that look wrong.</p>
      <div className="map">
        {FIELDS.map(([k, l]) => (
          <label key={k}>
            {l}
            <select id={`col-${k}`} value={cols[k]} onChange={(e) => onCols({ ...cols, [k]: +e.target.value })}>
              <option value={-1}>None</option>
              {file.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
            </select>
          </label>
        ))}
        {!separate && (
          <label>
            Purchases show as
            <select id="col-sign" value={negative ? '1' : '0'} onChange={(e) => onNegative(e.target.value === '1')}>
              <option value="0">Positive amounts</option>
              <option value="1">Negative amounts</option>
            </select>
          </label>
        )}
        <label>
          Months covered
          <input id="col-months" type="number" min="0.5" step="0.5" value={months} onChange={(e) => onMonths(Math.max(0.5, +e.target.value || 1))} />
        </label>
      </div>
      {labels.length > 0 && held.length > 0 && (
        <>
          <h3>Which card is which?</h3>
          <p className="note">Used to work out what you earn today. Purchases on a card you don’t match are counted at 1¢ per dollar.</p>
          <div className="map">
            {labels.slice(0, 20).map((l) => (
              <label key={l}>
                “{l}”
                <select value={cardLabels[l] ?? matchCardLabel(l, held)?.id ?? ''} onChange={(e) => onCardLabel(l, e.target.value)}>
                  <option value="">Not one of my cards</option>
                  {held.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                </select>
              </label>
            ))}
          </div>
        </>
      )}
      <h3>First rows</h3>
      <div className="scroll">
        <table>
          <thead><tr>{file.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {file.rows.slice(0, 6).map((r, i) => (
              <tr key={i}>{file.headers.map((_, j) => <td key={j}>{r[j] instanceof Date ? (r[j] as Date).toISOString().slice(0, 10) : String(r[j] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StackNote({ asOf }: { asOf: string }) {
  return (
    <p className="note" style={{ marginTop: 24 }}>
      Card rates as of {asOf}. Benefits like travel credits, lounge access and insurance aren’t counted in the dollar figures.
    </p>
  );
}
