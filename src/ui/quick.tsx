import { useState, type ReactNode } from 'react';
import { BRANDS, CATEGORY_LABELS, brandOf, categorize } from '../core/categories';
import { programs } from '../core/catalog';
import { rankForPurchase, type PurchasePick } from '../core/recommend';
import { findMerchant, MERCHANTS } from '../core/merchants';
import { CATEGORY_IDS, type BrandId, type Card, type CategoryId, type Network, type PointMode } from '../core/types';
import { rateText, usd } from './format';
import { CardArt, Mini } from './views';
import { StaleNotice } from './rotatingNotice';

/** Places to pay, offered as suggestions: the merchant directory plus the brands whose cards pay a bonus. */
const SUGGESTIONS = [...new Set([...MERCHANTS.map((m) => m.name), ...Object.values(BRANDS).map((b) => b.name.split(',')[0])])].sort((a, b) =>
  a.localeCompare(b),
);

const NETWORK_NAMES: Record<Network, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover' };

const where = (cat: CategoryId, brand?: BrandId) => (brand ? `${BRANDS[brand].name} (${CATEGORY_LABELS[cat].toLowerCase()})` : CATEGORY_LABELS[cat].toLowerCase());

function why(p: PurchasePick, cat: CategoryId, brand?: BrandId): string {
  const cap = (p.cap && (p.source === 'rotating' ? ` on the first ${usd(p.cap)} this quarter` : ` up to ${usd(p.cap)} a year`)) || '';
  switch (p.source) {
    case 'brand':
      return `Bonus at ${BRANDS[brand!].name}${cap}.`;
    case 'rotating':
      return `This quarter’s ${p.rate}% category${cap}. Activate it on ${p.card.issuer}’s site first.`;
    case 'category':
      if (p.card.choice && p.card.picked?.includes(p.via!))
        return p.card.choice.auto
          ? `Its ${p.rate}% top-category bonus${cap}, if ${CATEGORY_LABELS[p.via!].toLowerCase()} is your biggest category this cycle.`
          : `The ${p.rate}% category you picked${cap}.`;
      return p.via === cat ? `Its ${CATEGORY_LABELS[cat].toLowerCase()} rate${cap}.` : `Counts as ${CATEGORY_LABELS[p.via!].toLowerCase()}${cap}.`;
    default:
      return 'Its everyday rate; no bonus here.';
  }
}

interface QuickProps {
  held: Card[];
  mode: PointMode;
  onMode: (m: PointMode) => void;
  overrides: Record<string, CategoryId>;
  picker: ReactNode;
}

/** "Which card here?": type where you're about to pay and see which of your cards earns most there. No file needed. */
export function QuickPick({ held, mode, onMode, overrides, picker }: QuickProps) {
  const [merchant, setMerchant] = useState('');
  const [chosen, setChosen] = useState<CategoryId | null>(null);
  const typed = merchant.trim();
  const guessed = typed ? categorize(typed, '', overrides) : null;
  const cat = chosen ?? guessed;
  const brand = typed && cat ? brandOf(typed, cat) : undefined;
  const known = typed ? findMerchant(typed) : undefined;
  const ranked = cat && held.length ? rankForPurchase(held, cat, brand, programs, mode, known?.accepts) : [];
  const [best, ...rest] = ranked;
  const unsure = !!typed && !chosen && guessed === 'other' && !known;

  if (!held.length)
    return (
      <section>
        <p className="sub">Pick your cards once. They’re remembered in this browser, so next time this page opens straight to the answer.</p>
        {picker}
      </section>
    );

  return (
    <section className="quick">
      <label className="find big">
        Where are you paying?
        <input
          type="search"
          list="merchant-ideas"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Like Costco, Delta or Starbucks"
          value={merchant}
          onChange={(e) => {
            setMerchant(e.target.value);
            setChosen(null);
          }}
        />
      </label>
      <datalist id="merchant-ideas">
        {SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>

      <p className="note">
        {unsure
          ? 'Not sure what kind of place that is. Pick one below.'
          : cat
            ? known && !chosen
              ? `${known.name} counts as ${where(cat, brand)}.`
              : `Treating this as ${where(cat, brand)}.`
            : 'Type a store, or pick what you’re buying:'}
      </p>
      {known && !chosen && known.note && <p className="note merchant-note">ⓘ {known.note}</p>}
      {cat && !unsure ? (
        <details className="change">
          <summary>Wrong kind of purchase? Change it</summary>
          <div className="chips" role="group" aria-label="Kind of purchase">
            {CATEGORY_IDS.map((k) => (
              <button key={k} className="pill" aria-pressed={cat === k} onClick={() => setChosen(k)}>
                {CATEGORY_LABELS[k]}
              </button>
            ))}
          </div>
        </details>
      ) : (
        <div className="chips" role="group" aria-label="Kind of purchase">
          {CATEGORY_IDS.map((k) => (
            <button key={k} className="pill" aria-pressed={cat === k} onClick={() => setChosen(k)}>
              {CATEGORY_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      {best && held.filter((c) => c.rotating?.stale).map((c) => <StaleNotice key={c.id} card={c} />)}
      {best && (
        <div className="answer" aria-live="polite">
          <div className="answer-card">
            <CardArt card={best.card} />
            <div>
              <p className="eyebrow">Use</p>
              <h2>{best.card.name}</h2>
              <p className="answer-rate">{rateText(best.card, best.rate, programs, mode)}</p>
              <p className="note">{best.accepted === false ? `${known!.name} doesn’t take any of your cards’ networks.` : why(best, cat!, brand)}</p>
              {rest[0] && rest[0].cents === best.cents && rest[0].accepted !== false && <p className="note">{rest[0].card.name} earns the same here.</p>}
            </div>
          </div>
          {rest.length > 0 && (
            <ol className="also" start={2}>
              {rest.map((p) => (
                <li key={p.card.id}>
                  <Mini card={p.card} />
                  <span>
                    <b>{p.card.name}</b> {rateText(p.card, p.rate, programs, mode)}
                    <small>{p.accepted === false ? `${known!.name} doesn’t take ${NETWORK_NAMES[p.card.network!]}.` : why(p, cat!, brand)}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="modebar">
            <label htmlFor="qmode">Value points at</label>
            <select id="qmode" value={mode} onChange={(e) => onMode(e.target.value as PointMode)}>
              <option value="best">Best value (transfer partners)</option>
              <option value="cash">Cash-out value</option>
            </select>
          </div>
          <p className="note">
            Rates are per dollar, before caps you may already have used this year. Some places take only certain networks (Costco stores take only Visa),
            so have a second card ready.
          </p>
        </div>
      )}
    </section>
  );
}
