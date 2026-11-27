import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { readTable, toTransactions } from '../src/core/parse';

export function loadFixture(name: string) {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  const table = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
  const file = readTable(table);
  return { file, txns: toTransactions(file) };
}
