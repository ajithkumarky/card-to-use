import { CATEGORY_LABELS } from '../core/categories';
import { issuerPage, quarterLabel } from '../core/rotating';
import type { Card } from '../core/types';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Warns that a rotating card's categories may be out of date: the crawler has nothing for this quarter
 * (the issuer's page couldn't be read since the quarter changed) and the person hasn't ticked them yet.
 * Renders nothing when the categories are current.
 */
export function StaleNotice({ card, onSet, here }: { card: Card; onSet?: () => void; here?: boolean }) {
  const s = card.rotating?.stale;
  if (!s) return null;
  const page = issuerPage(card.id) ?? s.lastOffer?.source;
  const ticked = card.rotating!.categories;
  return (
    <p className="stale" role="status">
      <b>⚠ {card.name}’s {quarterLabel(s.quarter)} categories may be out of date.</b> The app couldn’t get them from {card.issuer}’s site
      {s.lastOffer ? ` (the newest it has is ${quarterLabel(s.lastOffer.quarter)}: ${s.lastOffer.title})` : ''}; last checked {day(s.checkedAt)}.{' '}
      {ticked.length
        ? `It’s using ${ticked.map((c) => CATEGORY_LABELS[c]).join(', ')}, which you ticked before. `
        : 'No 5% categories are counted until you tick them. '}
      Check{' '}
      {page ? (
        <a href={page} target="_blank" rel="noopener noreferrer">{card.issuer}’s site</a>
      ) : (
        `${card.issuer}’s site`
      )}{' '}
      for this quarter’s list
      {onSet ? (
        <>
          , then{' '}
          <button className="btn ghost" style={{ minHeight: 32, padding: '2px 10px' }} onClick={onSet}>
            tick them on My cards
          </button>
        </>
      ) : (
        here ? ' and tick them below.' : ' and tick them on My cards.'
      )}
    </p>
  );
}
