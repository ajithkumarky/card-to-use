import { useEffect, useMemo, useRef, useState } from 'react';
import { catalog, libraryCards, programs } from '../core/catalog';
import { missingColumns, monthsCovered, readTable, toTransactions, type ColumnMap, type ParsedFile } from '../core/parse';
import { buildPlan } from '../core/recommend';
import { isFeed, localQuarter, offerFor, quarterLabel, type RotatingFeed } from '../core/rotating';
import bundledRotating from '../data/rotating.json';
import type { Card, CategoryId, PointMode } from '../core/types';
import { groupLabel } from '../core/categories';
import { usd } from './format';
import { forget, recall, remember } from './memory';
import { readFile } from './readFile';
import { SAMPLE_HELD, sampleTable } from './sample';
import { CardPicker, ColumnsView, Mini, MerchantsView, PlanView, StackNote, WalletView } from './views';
import { fullName } from './format';

type Tab = 'plan' | 'wallet' | 'merchants' | 'columns';
const TABS: [Tab, string][] = [
  ['plan', 'Which card where'],
  ['wallet', 'My cards'],
  ['merchants', 'Merchants'],
  ['columns', 'File columns'],
];

const SAMPLE = readTable(sampleTable());
const EMPTY = readTable([['Date', 'Description', 'Amount']]);
const SAVED = recall();
const QUARTER = localQuarter();
/** Saved ticks are kept per quarter ("discover-it@2026-Q4") so last quarter's choices don't carry over. */
const tickKey = (id: string) => `${id}@${QUARTER}`;

type Source = 'none' | 'sample' | 'file';

export function App() {
  // Transactions live in memory only and are never sent anywhere. Card choices, merchant fixes and settings
  // are remembered in this browser (see memory.ts) once the person makes one, and "Forget me" clears them.
  const [source, setSource] = useState<Source>('none');
  const [file, setFile] = useState<ParsedFile>(EMPTY);
  const [fileName, setFileName] = useState<string | null>(null);
  const [cols, setCols] = useState<ColumnMap>(EMPTY.columns);
  const [negative, setNegative] = useState(EMPTY.purchasesNegative);
  const [monthsOverride, setMonthsOverride] = useState<number | null>(null);
  const [held, setHeld] = useState<string[]>(SAVED?.held ?? []);
  const [touched, setTouched] = useState(!!SAVED?.held.length);
  const [asking, setAsking] = useState(false);
  const [editingCards, setEditingCards] = useState(false);
  const [custom, setCustom] = useState<Card[]>(SAVED?.custom ?? []);
  const [rotating, setRotating] = useState<Record<string, CategoryId[]>>(SAVED?.rotating ?? {});
  const [overrides, setOverrides] = useState<Record<string, CategoryId>>(SAVED?.overrides ?? {});
  const [cardLabels, setCardLabels] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<PointMode>(SAVED?.mode ?? 'best');
  const [remembered, setRemembered] = useState(!!SAVED);
  const [tab, setTab] = useState<Tab>('plan');
  const [readError, setReadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [feed, setFeed] = useState<RotatingFeed>(bundledRotating as RotatingFeed);

  // This quarter's rotating categories, crawled from the issuers' sites by the Worker's daily job.
  // Nothing is sent; if the request fails (or in `npm run dev`) the copy bundled with the app is used.
  useEffect(() => {
    let live = true;
    fetch('/api/rotating', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((f: unknown) => { if (live && isFeed(f)) setFeed(f); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const allCards = useMemo(
    () =>
      [...libraryCards, ...custom].map((c) => {
        if (!c.rotating) return c;
        const offer = offerFor(feed, c.id, QUARTER);
        // Your own ticks for this quarter win, then the issuer's list, then older ticks saved before quarters were tracked.
        const categories = rotating[tickKey(c.id)] ?? offer?.categories ?? rotating[c.id] ?? c.rotating.categories;
        return { ...c, rotating: { ...c.rotating, categories, offer, quarter: offer ? quarterLabel(offer.quarter) : c.rotating.quarter } };
      }),
    [custom, rotating, feed],
  );
  const heldCards = useMemo(() => held.map((id) => allCards.find((c) => c.id === id)).filter((c): c is Card => !!c), [held, allCards]);
  const missing = missingColumns(cols);
  const transactions = useMemo(() => toTransactions(file, cols, negative), [file, cols, negative]);
  const months = monthsOverride ?? monthsCovered(transactions);
  const plan = useMemo(
    () => buildPlan({ transactions, months, held: heldCards, programs, mode, overrides, cardLabels }),
    [transactions, months, heldCards, mode, overrides, cardLabels],
  );

  // Remember choices once the person has made one. The sample's cards are never saved.
  useEffect(() => {
    const used = touched || custom.length > 0 || Object.keys(overrides).length > 0 || Object.keys(rotating).length > 0;
    if (!used) return;
    remember({ held: touched ? held : [], custom, rotating, overrides, mode });
    setRemembered(true);
  }, [touched, held, custom, rotating, overrides, mode]);

  function forgetMe() {
    forget();
    setRemembered(false);
    setTouched(false);
    setHeld(source === 'sample' ? SAMPLE_HELD : []);
    setCustom([]);
    setRotating({});
    setOverrides({});
    setCardLabels({});
    setMode('best');
  }

  async function load(f: File | undefined) {
    if (!f) return;
    setReadError('');
    try {
      const parsed = readTable(await readFile(f));
      setSource('file');
      setFile(parsed);
      setFileName(f.name);
      setCols(parsed.columns);
      setNegative(parsed.purchasesNegative);
      setMonthsOverride(null);
      setCardLabels({});
      if (!touched) setHeld([]);
      // Saved cards skip the picker; they can be changed on My cards.
      setAsking(!touched);
      setEditingCards(false);
      setTab(missingColumns(parsed.columns).length ? 'columns' : 'plan');
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Couldn’t read this file.');
    }
  }

  function loadSample() {
    setSource('sample');
    setFile(SAMPLE);
    setFileName(null);
    setCols(SAMPLE.columns);
    setNegative(SAMPLE.purchasesNegative);
    setMonthsOverride(null);
    setCardLabels({});
    setEditingCards(false);
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
  const loaded = source !== 'none';
  const showNumbers = loaded && !missing.length && !asking && heldCards.length > 0;

  let headline = 'Add the cards you hold to see where each one fits';
  if (!loaded) headline = 'Find the best card for every purchase';
  else if (missing.length) headline = 'Pick the right columns to continue';
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
            {source === 'sample' && <span className="badge">Sample data, not yours</span>}
            <h1>{headline}</h1>
            {showNumbers && (
              <>
                <p className="lede">
                  Compared with {versus}
                  {plan.baselineKind === 'actual' && plan.matchedShare < 1 &&
                    ` (${Math.round(plan.matchedShare * 100)}% of purchases matched to one of your cards; match the rest on File columns)`}
                  .{top && ` Your biggest earner is ${groupLabel(top.category, top.brand).toLowerCase()} on ${top.segments[0].card.name}.`} Figures are a
                  year’s estimate from your file, with points at {mode === 'best' ? 'their best realistic value' : 'cash-out value'}.
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
            {!loaded && heldCards.length > 0 && (
              <p className="lede">Welcome back. Add a new transaction export to see where to use each of your cards.</p>
            )}
            {!loaded && !heldCards.length && (
              <p className="lede">
                Add a transaction export from your bank and tick the cards you hold. Card to Use works out which card earns the most for each kind of
                spending, right here in your browser.
              </p>
            )}
            {loaded && asking && !missing.length && <p className="lede">Your file is loaded. Tick your cards below and the app will work out which one to use for each category.</p>}
            {loaded && <div className="modebar">
              <label htmlFor="mode">Value points at</label>
              <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as PointMode)}>
                <option value="best">Best value (transfer partners)</option>
                <option value="cash">Cash-out value</option>
              </select>
            </div>}
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
                {source === 'file'
                  ? `${fileName}: ${transactions.length} purchases over about ${months} month${months === 1 ? '' : 's'}.`
                  : source === 'sample'
                    ? `Showing ${transactions.length} sample purchases over 3 months. Drop a CSV or Excel export here to use your own.`
                    : 'Drop a CSV or Excel export from your bank or card here, or choose a file.'}
              </p>
            )}
            <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="row-btns">
              <button className="btn" onClick={() => input.current?.click()}>Choose a file</button>
              <button className="btn ghost" onClick={loadSample}>{source === 'sample' ? 'Reload sample data' : 'Try sample data'}</button>
            </div>
            <p className="privacy">
              Your file is read inside this tab only. Nothing is uploaded, and your purchases are never saved.
              {remembered ? (
                <>
                  {' '}Your cards, merchant fixes and settings are remembered in this browser.{' '}
                  <button className="linkish" onClick={forgetMe}>Forget me</button>.
                </>
              ) : (
                ' Once you pick cards, they’re remembered in this browser only, and you can clear them any time.'
              )}{' '}
              Estimates only, not financial advice.
            </p>
          </div>
        </div>
      </header>

      {loaded && <nav className="tabs" aria-label="Sections">
        <div className="wrap" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      </nav>}

      <main className="band">
        <div className="wrap">
          {!loaded && (
            <Start
              cards={allCards}
              held={heldCards}
              editing={editingCards}
              onEdit={() => setEditingCards(true)}
              onSample={loadSample}
              onFile={() => input.current?.click()}
              onDone={(ids) => { changeHeld(ids); setEditingCards(false); }}
            />
          )}
          {loaded && tab === 'plan' &&
            (asking && !missing.length ? (
              <CardPicker cards={allCards} held={held} onDone={(ids) => { changeHeld(ids); setAsking(false); }} />
            ) : missing.length ? (
              <p>Pick the description and amount columns on the File columns tab to see recommendations.</p>
            ) : (
              <PlanView plan={plan} held={heldCards} mode={mode} versus={versus} onRotating={() => setTab('wallet')} />
            ))}
          {loaded && tab === 'wallet' && (
            <WalletView
              all={allCards}
              held={heldCards}
              plan={showNumbers ? plan : null}
              mode={mode}
              onHeld={changeHeld}
              onCustom={(c) => { setCustom((x) => [...x, c]); changeHeld([...held, c.id]); }}
              rotating={rotating}
              onRotating={(id, cats) => setRotating((r) => ({ ...r, [tickKey(id)]: cats }))}
            />
          )}
          {loaded && tab === 'merchants' && <MerchantsView transactions={transactions} held={heldCards} mode={mode} overrides={overrides} onOverride={(k, c) => setOverrides((o) => ({ ...o, [k]: c }))} />}
          {loaded && tab === 'columns' && (
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

/**
 * The first screen. A first visit gets the how-it-works steps; a return visit shows the cards remembered in
 * this browser, so the person only needs to add a file.
 */
function Start(props: {
  cards: Card[];
  held: Card[];
  editing: boolean;
  onEdit: () => void;
  onDone: (ids: string[]) => void;
  onSample: () => void;
  onFile: () => void;
}) {
  const { cards, held, editing, onEdit, onDone, onSample, onFile } = props;
  if (editing)
    return (
      <CardPicker
        cards={cards}
        held={held.map((c) => c.id)}
        doneLabel="Save my cards"
        intro="Tick every card you have. They’re remembered in this browser, so next time you only need to add a file."
        onDone={onDone}
      />
    );
  if (!held.length)
    return (
      <section className="howto">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <b>Tick the cards you hold.</b>
            <span>About 80 cards from Chase, Amex, Citi, Capital One, U.S. Bank, Wells Fargo, Bank of America, Discover, Barclays, Bilt and airline and hotel brands. You can add one that isn’t listed.</span>
          </li>
          <li>
            <b>Download your transactions.</b>
            <span>On your bank or card website, export a few months of activity as CSV or Excel. Several cards in one file works, and a card column lets the app compare against what you actually used.</span>
          </li>
          <li>
            <b>Add the file here.</b>
            <span>See which card to use for each category and merchant, where caps run out, and how much more you’d earn a year.</span>
          </li>
        </ol>
        <p className="note">
          Everything runs in this browser tab. There’s no server and no account: your file is never uploaded or saved. Your card choices are remembered in
          this browser only, so next time you can skip straight to adding a file.
        </p>
        <div className="row-btns">
          <button className="btn" onClick={onEdit}>Pick my cards</button>
          <button className="btn ghost" onClick={onFile}>Add a file first</button>
          <button className="btn ghost" onClick={onSample}>Try sample data</button>
        </div>
      </section>
    );
  return (
    <section className="form">
      <h3>Your cards</h3>
      <ul className="heldlist">
        {held.map((c) => (
          <li key={c.id}>
            <Mini card={c} />
            {fullName(c)}
          </li>
        ))}
      </ul>
      <p className="note">Add a new transaction file to see which of these to use for each kind of spending.</p>
      <div className="row-btns">
        <button className="btn" onClick={onFile}>Choose a file</button>
        <button className="btn ghost" onClick={onEdit}>Change my cards</button>
      </div>
    </section>
  );
}
