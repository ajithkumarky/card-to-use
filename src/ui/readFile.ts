import Papa from 'papaparse';
import type { Table } from '../core/parse';

/** Reads a CSV, TSV or .xlsx file in the browser. Nothing is sent anywhere. */
export async function readFile(file: File): Promise<Table> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)) as Table;
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error('Older .xls files aren’t supported. Open the file in Excel or Numbers and save it as .xlsx or CSV.');
  }
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error: (e) => reject(new Error(`Couldn’t read this file: ${e.message}`)),
    });
  });
}
