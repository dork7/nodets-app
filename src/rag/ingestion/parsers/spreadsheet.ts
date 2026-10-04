import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

import { toMarkdownTable } from '@/rag/ingestion/tables';
import type { Element } from '@/rag/types';

const table = (rows: string[][], page: number | null, sectionPath: string[]): Element[] => {
 const filled = rows.filter((r) => r.some((c) => c !== ''));
 return filled.length ? [{ kind: 'table', content: toMarkdownTable(filled), rows: filled, page, sectionPath }] : [];
};

/** A cell's displayed value: formula results rather than formulas, rich text flattened. */
const cellText = (value: ExcelJS.CellValue): string => {
 if (value == null) return '';
 if (value instanceof Date) return value.toISOString().slice(0, 10);
 if (typeof value === 'object') {
  if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return String(value.text);
  if ('error' in value) return String(value.error);
  return '';
 }
 return String(value);
};

/** One table per sheet. */
export async function parseXlsx(buffer: Buffer): Promise<Element[]> {
 const workbook = new ExcelJS.Workbook();
 await workbook.xlsx.load(buffer as never);
 return workbook.worksheets.flatMap((sheet, index) => {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
   const cells: string[] = [];
   row.eachCell({ includeEmpty: true }, (cell, col) => {
    cells[col - 1] = cellText(cell.value);
   });
   rows.push(Array.from(cells, (c) => c ?? ''));
  });
  return table(rows, index + 1, [sheet.name]);
 });
}

export function parseCsv(text: string): Element[] {
 const rows = parse(text.replace(/^\uFEFF/, ''), {
  relax_column_count: true,
  skip_empty_lines: true,
  // One pathological record must not be padded across every row of the table.
  max_record_size: 1_000_000,
 }) as string[][];
 return table(rows, null, []);
}
