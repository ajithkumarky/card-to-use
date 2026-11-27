import { useState } from 'react';
import type { ColumnMap, ParsedFile } from '../core/parse';

const cellText = (c: unknown): string => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? '')).trim();

/** Up to `n` different non-empty values from one column, for showing what a column holds. */
export function sampleValues(file: ParsedFile, col: number, n = 3): string[] {
  if (col < 0) return [];
  const out: string[] = [];
  for (const r of file.rows) {
    const v = cellText(r[col]);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

/** What each column is for, in plain words. */
export const COLUMN_HELP: Record<keyof ColumnMap, { label: string; ask: string; why: string; required?: boolean }> = {
  description: {
    label: 'Merchant or description',
    ask: 'Which column has the store or merchant name?',
    why: 'Used to work out the kind of purchase (dining, groceries, Delta and so on).',
    required: true,
  },
  amount: { label: 'Amount', ask: 'Which column has the amount of each purchase?', why: 'Used to add up what you spend in each category.', required: true },
  date: { label: 'Date', ask: 'Which column has the date?', why: 'Used to tell how many months the file covers, so yearly figures are right.' },
  debit: { label: 'Debit (if separate)', ask: '', why: 'Some banks put purchases and refunds in separate columns. Purchases go here.' },
  credit: { label: 'Credit (if separate)', ask: '', why: 'Refunds and payments, when the bank splits them out.' },
  category: { label: 'Bank’s category', ask: '', why: 'A hint for purchases the app doesn’t recognize. Optional.' },
  card: {
    label: 'Card used',
    ask: 'Which column says which card was used?',
    why: 'Lets the app compare with what each purchase actually earned. Optional.',
  },
};

type Step = keyof ColumnMap | 'sign';

interface GuideProps {
  file: ParsedFile;
  cols: ColumnMap;
  onCols: (c: ColumnMap) => void;
  onNegative: (v: boolean) => void;
  onDone: () => void;
}

/**
 * Asks one question at a time when the header row didn't say which column is which:
 * the merchant, the amount, whether purchases are negative, then the optional date and card columns.
 */
export function ColumnGuide({ file, cols, onCols, onNegative, onDone }: GuideProps) {
  const [steps] = useState<Step[]>(() => {
    const s: Step[] = [];
    if (cols.description < 0) s.push('description');
    if (cols.amount < 0 && cols.debit < 0) s.push('amount', 'sign');
    if (cols.date < 0) s.push('date');
    if (cols.card < 0 && s.length) s.push('card');
    return s;
  });
  const [at, setAt] = useState(0);
  const step = steps[at];
  const next = () => (at + 1 >= steps.length ? onDone() : setAt(at + 1));
  if (!step) return null;

  const taken = new Set(Object.values(cols).filter((i) => i >= 0));
  const header = (i: number) => file.headers[i] || `Column ${i + 1}`;

  if (step === 'sign') {
    const desc = cols.description;
    const rows = file.rows.filter((r) => cellText(r[cols.amount])).slice(0, 4);
    return (
      <section className="form guide">
        <p className="eyebrow">Step {at + 1} of {steps.length}</p>
        <h3>In your file, are purchases positive or negative numbers?</h3>
        <p className="note">Look at a purchase you recognize below. Refunds and payments usually have the opposite sign.</p>
        <table className="guide-rows">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{desc >= 0 ? cellText(r[desc]) : ''}</td>
                <td className="num">{cellText(r[cols.amount])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row-btns">
          <button className="btn" onClick={() => { onNegative(false); next(); }}>Purchases are positive (45.20)</button>
          <button className="btn" onClick={() => { onNegative(true); next(); }}>Purchases are negative (−45.20)</button>
        </div>
      </section>
    );
  }

  const help = COLUMN_HELP[step];
  const required = help.required;
  return (
    <section className="form guide">
      <p className="eyebrow">Step {at + 1} of {steps.length}</p>
      <h3>{help.ask}</h3>
      <p className="note">{help.why} Tap the column that matches.</p>
      <div className="guide-cols">
        {file.headers.map((_, i) => {
          const samples = sampleValues(file, i);
          if (!samples.length) return null;
          return (
            <button
              key={i}
              className="guide-col"
              disabled={taken.has(i) && cols[step] !== i}
              onClick={() => {
                onCols({ ...cols, [step]: i });
                next();
              }}
            >
              <b>{header(i)}</b>
              {samples.map((s) => <span key={s}>{s}</span>)}
            </button>
          );
        })}
      </div>
      {!required && (
        <button className="btn ghost" onClick={next}>
          My file doesn’t have one
        </button>
      )}
    </section>
  );
}
