import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { parseHtml } from '@/rag/ingestion/parsers/html';
import { parseMarkdown } from '@/rag/ingestion/parsers/markdown';
import { parsePptx } from '@/rag/ingestion/parsers/pptx';
import { parseCsv, parseXlsx } from '@/rag/ingestion/parsers/spreadsheet';
import { parseText } from '@/rag/ingestion/parsers/text';
import { parseMarkdownTable, rowGroups, toMarkdownTable } from '@/rag/ingestion/tables';

const PNG_DATA_URI = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')}`;

describe('parseMarkdown', () => {
 const elements = parseMarkdown(
  [
   '# Report',
   'Intro paragraph.',
   '## Revenue',
   'Revenue grew.',
   '',
   '| Year | Revenue |',
   '| --- | --- |',
   '| 2024 | 378 |',
   '| 2025 | 412 |',
   '',
   `![Chart of revenue](${PNG_DATA_URI})`,
   '![Remote](https://example.com/a.png)',
   '## Costs',
   '```',
   '# not a heading',
   '```',
  ].join('\n')
 );

 it('splits text by heading and tracks the section path', () => {
  const text = elements.filter((el) => el.kind === 'text');
  expect(text.map((el) => el.sectionPath)).toEqual([
   ['Report'],
   ['Report', 'Revenue'],
   ['Report', 'Revenue'],
   ['Report', 'Costs'],
  ]);
  expect(text[0].content).toBe('Intro paragraph.');
  expect(text[3].content).toContain('# not a heading');
 });

 it('lifts GFM tables out whole, with their cells', () => {
  const [table] = elements.filter((el) => el.kind === 'table');
  expect(table.rows).toEqual([
   ['Year', 'Revenue'],
   ['2024', '378'],
   ['2025', '412'],
  ]);
  expect(table.sectionPath).toEqual(['Report', 'Revenue']);
 });

 it('extracts data-URI images and never keeps remote ones as images', () => {
  const images = elements.filter((el) => el.kind === 'image');
  expect(images).toHaveLength(1);
  expect(images[0].content).toBe('Chart of revenue');
  expect(images[0].image?.subarray(1, 4).toString()).toBe('PNG');
  expect(elements.some((el) => el.content.includes('base64'))).toBe(false);
 });
});

describe('parseHtml', () => {
 const elements = parseHtml(
  `<html><head><title>t</title><style>p{}</style></head><body>
   <h1>Guide</h1><p>First   paragraph.</p><script>alert(1)</script>
   <h2>Prices</h2><table><tr><th>Item</th><th>Price</th></tr><tr><td>Pen</td><td>2</td></tr></table>
   <p>After table.</p><img alt="logo" src="${PNG_DATA_URI}"><img src="https://example.com/x.png">
  </body></html>`
 );

 it('groups text under headings and drops script/style', () => {
  const text = elements.filter((el) => el.kind === 'text');
  expect(text[0]).toMatchObject({ content: 'First paragraph.', sectionPath: ['Guide'] });
  expect(text[1]).toMatchObject({ content: 'After table.', sectionPath: ['Guide', 'Prices'] });
  expect(elements.some((el) => el.content.includes('alert'))).toBe(false);
 });

 it('emits tables and data-URI images as their own elements', () => {
  expect(elements.find((el) => el.kind === 'table')?.rows).toEqual([
   ['Item', 'Price'],
   ['Pen', '2'],
  ]);
  const images = elements.filter((el) => el.kind === 'image');
  expect(images).toHaveLength(1);
  expect(images[0].nearbyText).toContain('After table.');
 });
});

describe('spreadsheets', () => {
 it('parses CSV into one table', () => {
  const [table] = parseCsv('name,qty\n"Smith, J",3\n\nLee,4\n');
  expect(table.kind).toBe('table');
  expect(table.rows).toEqual([
   ['name', 'qty'],
   ['Smith, J', '3'],
   ['Lee', '4'],
  ]);
 });

 it('returns one table per XLSX sheet using formula results', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Budget');
  sheet.addRow(['Item', 'Cost']);
  sheet.addRow(['Rent', 100]);
  sheet.addRow(['Total', { formula: 'SUM(B2:B2)', result: 100 }]);
  workbook.addWorksheet('Empty');

  const elements = await parseXlsx(Buffer.from(await workbook.xlsx.writeBuffer()));
  expect(elements).toHaveLength(1);
  expect(elements[0]).toMatchObject({ kind: 'table', page: 1, sectionPath: ['Budget'] });
  expect(elements[0].rows?.[2]).toEqual(['Total', '100']);
 });
});

describe('parsePptx', () => {
 it('reads slide text, tables and referenced images in slide order', async () => {
  const slide = (body: string) =>
   `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
  const zip = new JSZip();
  zip.file(
   'ppt/slides/slide2.xml',
   slide('<p:sp><p:txBody><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:txBody></p:sp>')
  );
  zip.file(
   'ppt/slides/slide1.xml',
   slide(
    '<p:sp><p:txBody><a:p><a:r><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>' +
     '<p:graphicFrame><a:graphic><a:graphicData><a:tbl>' +
     '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Q</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Sales</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
     '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Q1</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>10</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
     '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
   )
  );
  zip.file(
   'ppt/slides/_rels/slide1.xml.rels',
   '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'
  );
  zip.file('ppt/media/image1.png', Buffer.from([1, 2, 3]));

  const elements = await parsePptx(await zip.generateAsync({ type: 'nodebuffer' }));
  expect(elements.map((el) => [el.kind, el.page])).toEqual([
   ['text', 1],
   ['table', 1],
   ['image', 1],
   ['text', 2],
  ]);
  expect(elements[0].content).toBe('Title');
  expect(elements[1].rows).toEqual([
   ['Q', 'Sales'],
   ['Q1', '10'],
  ]);
  expect(elements[2].image).toEqual(Buffer.from([1, 2, 3]));
 });
});

describe('parseText', () => {
 it('strips a BOM and returns nothing for blank input', () => {
  expect(parseText('﻿hello')[0].content).toBe('hello');
  expect(parseText('  \n ')).toEqual([]);
 });
});

describe('table helpers', () => {
 it('round-trips rows through Markdown, escaping pipes', () => {
  const rows = [
   ['a', 'b'],
   ['x|y', 'line\nbreak'],
  ];
  const markdown = toMarkdownTable(rows);
  expect(markdown.split('\n')).toHaveLength(3);
  expect(parseMarkdownTable(markdown.split('\n'))).toEqual([
   ['a', 'b'],
   ['x|y', 'line break'],
  ]);
 });

 it('splits long tables by row group and repeats the header', () => {
  const rows = [['h'], ...Array.from({ length: 5 }, (_, i) => [`r${i + 1}`])];
  const groups = rowGroups(rows, 2);
  expect(groups.map((g) => [g.from, g.to])).toEqual([
   [1, 2],
   [3, 4],
   [5, 5],
  ]);
  expect(groups.every((g) => g.rows[0][0] === 'h')).toBe(true);
  expect(rowGroups(rows, 10)).toHaveLength(1);
 });
});
