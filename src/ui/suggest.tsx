import { useMemo, useState } from 'react';
import { advise, type Suggestion } from '../core/advisor';
import { programs } from '../core/catalog';
import type { Card, PointMode } from '../core/types';
import { fullName, usd } from './format';
import { Mini } from './views';

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`;
const monthName = (asOf: string) => new Date(`${asOf}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function offerText(c: Card): string {
  const b = c.bonus!;
  const amount = b.unit === 'match' ? 'Cash back matched at the end of the first year' : b.unit === 'dollars' ? usd(b.amount) : `${b.amount.toLocaleString('en-US')} ${c.program === 'cash' ? 'points' : 'points or miles'}`;
  const extra = b.extraDollars ? ` plus a ${usd(b.extraDollars)} credit` : '';
  const spend = b.spend ? ` after ${usd(b.spend)} in ${b.months} months` : '';
  return `${amount}${extra}${spend}`;
}

function AddRow({ s, rank }: { s: Suggestion; rank: number }) {
  const c = s.cards[0];
  const w = s.welcome;
  return (
    <li className="sug">
      <Mini card={c} />
      <div>
        <p className="sug-head">
          <b>
            {rank}. {fullName(c)}
          </b>
          <span className={`sug-v ${s.ongoing >= 0 ? 'pos' : 'neg'}`}>{signed(s.ongoing)} a year</span>
        </p>
        <p className="sug-why">
          Earns {usd(s.extraRewards)} more a year than your current cards would on the same spending
          {s.extraFees ? `, less its ${usd(s.extraFees)} annual fee` : ', with no annual fee'}.
        </p>
        {c.bonus && w ? (
          <p className="sug-why">
            <b>First year {signed(s.firstYear)}.</b> Welcome offer: {offerText(c)}, worth about {usd(w.value)}
            {c.bonus.firstYearFee === 0 ? ', and no fee the first year' : ''}.{' '}
            {w.reachable === false
              ? `Your usual spending in ${c.bonus.months} months is about ${usd(w.windowSpend)}, short of the minimum, so it isn’t counted.`
              : w.reachable
                ? `Your usual spending in ${c.bonus.months} months, about ${usd(w.windowSpend)}, covers the minimum if it goes on this card.`
                : ''}{' '}
            <a href={c.bonus.source} target="_blank" rel="noopener noreferrer">
              Offer as listed {monthName(c.bonus.asOf)}
            </a>
            .
          </p>
        ) : (
          <p className="sug-why">No public welcome offer on file for this card.</p>
        )}
      </div>
    </li>
  );
}

export function SuggestionsView({ spend, held, library, mode }: { spend: Map<string, number>; held: Card[]; library: Card[]; mode: PointMode }) {
  const [business, setBusiness] = useState(false);
  const [order, setOrder] = useState<'ongoing' | 'firstYear'>('ongoing');
  const advice = useMemo(() => advise({ spend, held, library, programs, mode, includeBusiness: business }), [spend, held, library, mode, business]);
  const adds = [...advice.adds].sort((a, b) => b[order] - a[order]).slice(0, 5);
  const yearly = [...spend.values()].reduce((a, v) => a + v, 0);
  const worthIt = adds.filter((s) => s[order] > 0);

  return (
    <section className="suggest">
      <h2>Cards to consider</h2>
      <p className="sub">
        Worked out in your browser from about {usd(yearly)} a year of spending and the {library.length} cards in the catalog. “A year” is what a card is worth
        every year: the extra rewards over your current cards, less its annual fee. The first year adds a welcome offer when your usual spending reaches its
        minimum in time.
      </p>
      <div className="modebar">
        <label htmlFor="sug-order">Rank by</label>
        <select id="sug-order" value={order} onChange={(e) => setOrder(e.target.value as 'ongoing' | 'firstYear')}>
          <option value="ongoing">Value every year</option>
          <option value="firstYear">First-year value, with welcome offers</option>
        </select>
        <label className="ck">
          <input type="checkbox" checked={business} onChange={(e) => setBusiness(e.target.checked)} />
          Include business cards
        </label>
      </div>

      <h3>Best card to add</h3>
      {worthIt.length ? (
        <ol className="suglist">
          {adds.map((s, i) => <AddRow key={s.cards[0].id} s={s} rank={i + 1} />)}
        </ol>
      ) : (
        <p className="note">At your spending, no listed card adds more than its annual fee to the cards you hold.</p>
      )}

      <h3>Best wallet for your spending</h3>
      <p className="note">Starting from scratch, which two or three cards would earn the most after fees. Your current cards net {usd(advice.current.net)} a year.</p>
      <div className="wallets">
        {advice.wallets.map((w) => (
          <div className="wallet" key={w.cards.map((c) => c.id).join()}>
            <p className="eyebrow">{w.cards.length} cards</p>
            <ul>
              {w.cards.map((c) => (
                <li key={c.id}>
                  <Mini card={c} /> {fullName(c)}
                  {held.some((h) => h.id === c.id) && <small> (you have it)</small>}
                </li>
              ))}
            </ul>
            <p>
              <b>{usd(w.ongoing)} a year</b> after {usd(w.extraFees)} in fees ({signed(w.ongoing - advice.current.net)} versus now)
              {w.firstYear > w.ongoing ? `. About ${usd(w.firstYear)} in the first year with the welcome offers you’d reach.` : '.'}
            </p>
          </div>
        ))}
      </div>

      {advice.keep.length > 0 && (
        <>
          <h3>Is each annual fee worth it?</h3>
          <p className="note">
            What each card with a fee adds over your other cards on the same spending. Credits, lounge access, free nights and insurance aren’t counted, so
            a card can be worth keeping for those.
          </p>
          <ul className="suglist plain">
            {advice.keep.map((k) => (
              <li className="sug" key={k.card.id}>
                <Mini card={k.card} />
                <div>
                  <p className="sug-head">
                    <b>{fullName(k.card)}</b>
                    <span className={`sug-v ${k.adds >= k.fee ? 'pos' : 'neg'}`}>{k.adds >= k.fee ? 'Pays for itself' : `Short by ${usd(k.fee - k.adds)}`}</span>
                  </p>
                  <p className="sug-why">
                    Adds {usd(k.adds)} a year in rewards; the fee is {usd(k.fee)}.
                    {k.adds < k.fee && ' Unless you use its benefits, a no-fee version from the same bank may serve you better.'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="note">
        Not financial advice. Welcome offers change often and depend on your history with the bank; check the issuer’s page before applying. Opening
        cards affects your credit.
      </p>
    </section>
  );
}
