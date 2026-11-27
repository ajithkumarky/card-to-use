import { useMemo, useRef, useState } from 'react';
import { catalog, libraryCards, programs } from '../core/catalog';
import { missingColumns, monthsCovered, readTable, toTransactions, type ColumnMap, type ParsedFile } from '../core/parse';
import { buildPlan } from '../core/recommend';
import type { Card, CategoryId, PointMode } from '../core/types';
import { CATEGORY_LABELS } from '../core/categories';
import { usd } from './format';
import { readFile } from './readFile';
import { SAMPLE_HELD, sampleTable } from './sample';
import { CardPicker, ColumnsView, MerchantsView, PlanView, StackNote, WalletView } from './views';

type Tab = 'plan' | 'wallet' | 'merchants' | 'columns';
const TABS: [Tab, string][] = [
  ['plan', 'Which card where'],
  ['wallet', 'My cards'],
  ['merchants', 'Merchants'],
  ['columns', 'File columns'],
];

const SAMPLE = readTable(sampleTable());

export function App() {
  // Everything lives in memory only. Nothing is written to storage or sent over the network.
  const [file, setFile] = useState<ParsedFile>(SAMPLE);
  const [fileName, setFileName] = useState<string | null>(null);
  const [cols, setCols] = useState<ColumnMap>(SAMPLE.columns);
  const [negative, setNegative] = useState(SAMPLE.purchasesNegative);
  const [monthsOverride, setMonthsOverride] = useState<number | null>(null);
  const [held, setHeld] = useState<string[]>(SAMPLE_HELD);
  const [touched, setTouched] = useState(false);
  const [asking, setAsking] = useState(false);
  const [custom, setCustom] = useState<Card[]>([]);
  const [rotating, setRotating] = useState<Record<string, CategoryId[]>>({});
  const [overrides, setOverrides] = useState<Record<string, CategoryId>>({});
  const [cardLabels, setCardLabels] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<PointMode>('best');
  const [tab, setTab] = useState<Tab>('plan');
  const [readError, setReadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const allCards = useMemo(
    () =>
      [...libraryCards, ...custom].map((c) =>
        c.rotating ? { ...c, rotating: { ...c.rotating, categories: rotating[c.id] ?? c.rotating.categories } } : c,
      ),
    [custom, rotating],
  );
  const heldCards = useMemo(() => held.map((id) => allCards.find((c) => c.id === id)).filter((c): c is Card => !!c), [held, allCards]);
  const missing = missingColumns(cols);
  const transactions = useMemo(() => toTransactions(file, cols, negative), [file, cols, negative]);
  const months = monthsOverride ?? monthsCovered(transactions);
  const plan = useMemo(
    () => buildPlan({ transactions, months, held: heldCards, programs, mode, overrides, cardLabels }),
    [transactions, months, heldCards, mode, overrides, cardLabels],
  );

  async function load(f: File | undefined) {
    if (!f) return;
    setReadError('');
    try {
      const parsed = readTable(await readFile(f));
      setFile(parsed);
      setFileName(f.name);
      setCols(parsed.columns);
      setNegative(parsed.purchasesNegative);
      setMonthsOverride(null);
      setOverrides({});
      setCardLabels({});
      if (!touched) setHeld([]);
      setAsking(true);
      setTab(missingColumns(parsed.columns).length ? 'columns' : 'plan');
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Couldn’t read this file.');
    }
  }

  function loadSample() {
    setFile(SAMPLE);
    setFileName(null);
    setCols(SAMPLE.columns);
    setNegative(SAMPLE.purchasesNegative);
    setMonthsOverride(null);
    setOverrides({});
    setCardLabels({});
    setAsking(false);
    setReadError('');
    if (!touched) setHeld(SAMPLE_HELD);
  }

  const changeHeld = (ids: string[]) => {
    setHeld(ids);
    setTouched(true);
  };

  const gain = Math.max(0, plan.total - plan.baseline);
  const single = plan.singleBest?.card.name ?? '';
  const versus = plan.baselineKind === 'actual' ? 'what you earned with the cards you used' : `putting everything on ${single}`;
  const top = [...plan.categories].sort((a, b) => b.earned - a.earned)[0];
  const showNumbers = !missing.length && !asking && heldCards.length > 0;

  let headline = 'Add the cards you hold to see where each one fits';
  if (missing.length) headline = 'Pick the right columns to continue';
  else if (asking) headline = 'Which cards do you hold?';
  else if (heldCards.length)
    headline =
      gain >= 1
        ? `Earn about ${usd(gain)} more a year by switching cards per category`
        : plan.baselineKind === 'actual'
          ? 'You already use the right card for each category'
          : `${single} alone earns as much as any mix of your cards`;

  return (
    <>
      <header className="band top">
        <div className="wrap grid">
          <div>
            {!fileName && <span className="badge">Sample data, not yours</span>}
            <h1>{headline}</h1>
            {showNumbers && (
              <>
                <p className="lede">
                  Compared with {versus}
                  {plan.baselineKind === 'actual' && plan.matchedShare < 1 &&
                    ` (${Math.round(plan.matchedShare * 100)}% of purchases matched to one of your cards; match the rest on File columns)`}
                  .{top && ` Your biggest earner is ${CATEGORY_LABELS[top.category].toLowerCase()} on ${top.segments[0].card.name}.`} Figures are a
                  year’s estimate from your file, with points at {mode === 'best' ? 'their best transfer value' : 'cash-out value'}.
                </p>
                <div className="figs">
                  <div className="hero">
                    <span className="fig-n">{usd(gain)}</span>
                    <small>more a year than {plan.baselineKind === 'actual' ? 'with the cards you used' : `using only ${single}`}</small>
                  </div>
                  <div>
                    <span className="fig-n">{usd(plan.total)}</span>
                    <small>rewards a year with this plan</small>
                  </div>
                  <div>
                    <span className="fig-n">{usd(plan.baseline)}</span>
                    <small>{plan.baselineKind === 'actual' ? 'what you earn now' : `on ${single} alone`}</small>
                  </div>
                  <div>
                    <span className="fig-n">{usd(plan.total - plan.fees)}</span>
                    <small>net after {usd(plan.fees)} in annual fees</small>
                  </div>
                </div>
              </>
            )}
            {asking && !missing.length && <p className="lede">Your file is loaded. Tick your cards below and the app will work out which one to use for each category.</p>}
            <div className="modebar">
              <label htmlFor="mode">Value points at</label>
              <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as PointMode)}>
                <option value="best">Best value (transfer partners)</option>
                <option value="cash">Cash-out value</option>
              </select>
            </div>
          </div>
          <div
            className={`drop${dragging ? ' on' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              load(e.dataTransfer.files[0]);
            }}
          >
            <h3>Your transactions</h3>
            {readError ? (
              <p className="err" role="alert">{readError}</p>
            ) : missing.length ? (
              <p className="err" role="alert">
                Couldn’t find a {missing.join(' or ')} column in this file. Pick it on the File columns tab.
              </p>
            ) : (
              <p>
                {fileName
                  ? `${fileName}: ${transactions.length} purchases over about ${months} month${months === 1 ? '' : 's'}.`
                  : `Showing ${transactions.length} sample purchases over 3 months. Drop a CSV or Excel export here to use your own.`}
              </p>
            )}
            <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="row-btns">
              <button className="btn" onClick={() => input.current?.click()}>Choose a file</button>
              <button className="btn ghost" onClick={loadSample}>Use sample data</button>
            </div>
            <p className="privacy">Your file is read inside this tab only. Nothing is uploaded or saved, and closing the tab clears it. Estimates only, not financial advice.</p>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        <div className="wrap" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="band">
        <div className="wrap">
          {tab === 'plan' &&
            (asking && !missing.length ? (
              <CardPicker cards={allCards} held={held} onDone={(ids) => { changeHeld(ids); setAsking(false); }} />
            ) : missing.length ? (
              <p>Pick the description and amount columns on the File columns tab to see recommendations.</p>
            ) : (
              <PlanView plan={plan} held={heldCards} mode={mode} versus={versus} onRotating={() => setTab('wallet')} />
            ))}
          {tab === 'wallet' && (
            <WalletView
              all={allCards}
              held={heldCards}
              plan={showNumbers ? plan : null}
              mode={mode}
              onHeld={changeHeld}
              onCustom={(c) => { setCustom((x) => [...x, c]); changeHeld([...held, c.id]); }}
              rotating={rotating}
              onRotating={(id, cats) => setRotating((r) => ({ ...r, [id]: cats }))}
            />
          )}
          {tab === 'merchants' && <MerchantsView transactions={transactions} overrides={overrides} onOverride={(k, c) => setOverrides((o) => ({ ...o, [k]: c }))} />}
          {tab === 'columns' && (
            <ColumnsView
              file={file}
              cols={cols}
              onCols={setCols}
              negative={negative}
              onNegative={setNegative}
              months={months}
              onMonths={setMonthsOverride}
              transactions={transactions}
              held={heldCards}
              cardLabels={cardLabels}
              onCardLabel={(label, id) => setCardLabels((m) => ({ ...m, [label]: id }))}
            />
          )}
          <StackNote asOf={catalog.asOf} />
        </div>
      </main>

      <footer className="band foot">
        <div className="wrap">
          <p>
            <b>Not financial advice.</b> Card to Use gives estimates to help you compare, not recommendations to open, close or use any account. Rates,
            fees, caps, APRs and point values are approximate and can change at any time. Check the issuer’s current terms before you decide.
          </p>
          <p>Card names belong to their issuers. Card to Use is not affiliated with or endorsed by any of them.</p>
        </div>
      </footer>
    </>
  );
}
