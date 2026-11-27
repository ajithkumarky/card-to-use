import type { Card, PointMode } from '../core/types';
import { centsPerPoint, type Programs } from '../core/recommend';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const usd = (n: number) => fmt.format(Math.round(n));

export function rateText(card: Card, rate: number, programs: Programs, mode: PointMode): string {
  if (card.program === 'cash') return `${rate}%`;
  return `${rate}x · ${(rate * centsPerPoint(card, programs, mode)).toFixed(1)}¢ per $`;
}

export const fullName = (c: Card) => (c.name.startsWith(c.issuer) ? c.name : `${c.issuer} ${c.name}`);
