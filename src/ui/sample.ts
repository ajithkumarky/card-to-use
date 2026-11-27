import type { Table } from '../core/parse';

/** Three months of made-up purchases, with a card column, so the app opens mid-use. */
export function sampleTable(): Table {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const merchants: [string, string, string, number, number][] = [
    ['Whole Foods Market #10234', 'Groceries', 'Double Cash', 85, 5],
    ["Trader Joe's #552", 'Groceries', 'Double Cash', 62, 4],
    ['Chipotle 2291', 'Food & Drink', 'Freedom Unlimited', 16, 5],
    ['Starbucks Store 08812', 'Food & Drink', 'Freedom Unlimited', 7, 10],
    ['DoorDash*Thai Basil', 'Food & Drink', 'Double Cash', 38, 3],
    ['Uber Trip', 'Travel', 'Double Cash', 24, 4],
    ['Shell Oil 5744', 'Gas', 'Double Cash', 48, 3],
    ['Amazon.com*2K4L1', 'Shopping', 'Double Cash', 46, 6],
    ['Netflix.com', 'Entertainment', 'Amex Gold', 23, 1],
    ['Spotify USA', 'Entertainment', 'Amex Gold', 12, 1],
    ['Costco Whse #0412', 'Shopping', 'Double Cash', 190, 1],
    ['CVS/Pharmacy #2201', 'Health & Wellness', 'Double Cash', 22, 2],
    ['Comcast Xfinity', 'Bills & Utilities', 'Double Cash', 89, 1],
    ['Delta Air Lines', 'Travel', 'Sapphire Preferred', 412, 0.4],
    ['Marriott Downtown', 'Travel', 'Sapphire Preferred', 268, 0.4],
    ['AMC Theatres 112', 'Entertainment', 'Freedom Unlimited', 34, 1],
    ['Target T-1402', 'Shopping', 'Double Cash', 58, 2],
    ['The Corner Bistro', 'Food & Drink', 'Amex Gold', 74, 2],
  ];
  const out: Table = [['Transaction Date', 'Description', 'Category', 'Amount', 'Card']];
  for (let m = 0; m < 3; m++) {
    for (const [desc, cat, card, avg, perMonth] of merchants) {
      const n = Math.floor(perMonth) + (rnd() < perMonth % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const day = 1 + Math.floor(rnd() * 28);
        const date = `2026-${String(9 + m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        out.push([date, desc, cat, (avg * (0.7 + rnd() * 0.6)).toFixed(2), card]);
      }
    }
  }
  out.push(['2026-11-20', 'Payment Thank You - Web', 'Payment', '-2500.00', 'Double Cash']);
  return out;
}

export const SAMPLE_HELD = ['amex-gold', 'chase-sapphire-preferred', 'chase-freedom-unlimited', 'citi-double-cash', 'chase-freedom-flex'];
