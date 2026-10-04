import JSZip from 'jszip';

import { config } from '@/rag/config';
import { QualityGateError } from '@/rag/graphUtils';
import { parseDocx } from '@/rag/ingestion/parsers/docx';
import { parseHtml } from '@/rag/ingestion/parsers/html';
import { parseMarkdown } from '@/rag/ingestion/parsers/markdown';
import { parsePdf } from '@/rag/ingestion/parsers/pdf';
import { parsePptx } from '@/rag/ingestion/parsers/pptx';
import { parseCsv, parseXlsx } from '@/rag/ingestion/parsers/spreadsheet';
import { parseText } from '@/rag/ingestion/parsers/text';
import type { Element } from '@/rag/types';

export const MIME = {
 pdf: 'application/pdf',
 docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 csv: 'text/csv',
 html: 'text/html',
 markdown: 'text/markdown',
 text: 'text/plain',
} as const;

const ZIP_TYPES = new Set<string>([MIME.docx, MIME.pptx, MIME.xlsx]);

/**
 * DOCX, PPTX and XLSX are ZIP containers that the parsers inflate in memory. The central
 * directory states each entry's uncompressed size, so a decompression bomb is refused
 * before anything is inflated.
 */
export async function assertZipBudget(buffer: Buffer) {
 const zip = await JSZip.loadAsync(buffer);
 const entries = Object.values(zip.files);
 const total = entries.reduce((sum, entry) => sum + Number((entry as any)._data?.uncompressedSize ?? 0), 0);
 if (entries.length > config.maxZipEntries || total > config.maxZipBytes) {
  throw new QualityGateError([
   `the file expands to ${entries.length} entries / ${Math.round(total / 1024 / 1024)} MB, over the limit`,
  ]);
 }
}

/** Each image and each table costs a model call; a document made of thousands of them is refused, not processed. */
export function assertElementBudget(elements: Element[]) {
 const images = elements.filter((el) => el.kind === 'image').length;
 const tables = elements.filter((el) => el.kind === 'table').length;
 if (images > config.maxImagesPerDoc || tables > config.maxTablesPerDoc) {
  throw new QualityGateError([
   `the document has ${images} images and ${tables} tables; the limits are ${config.maxImagesPerDoc} and ${config.maxTablesPerDoc}`,
  ]);
 }
}

/** Converts a stored upload into ordered elements, chosen by the type detected at intake. */
export async function parseDocument(buffer: Buffer, mimeType: string): Promise<Element[]> {
 if (ZIP_TYPES.has(mimeType)) await assertZipBudget(buffer);
 const elements = await parseByType(buffer, mimeType);
 assertElementBudget(elements);
 return elements;
}

async function parseByType(buffer: Buffer, mimeType: string): Promise<Element[]> {
 if (mimeType.startsWith('image/')) return [{ kind: 'image', content: '', image: buffer, page: null, sectionPath: [] }];
 switch (mimeType) {
  case MIME.pdf:
   return parsePdf(buffer);
  case MIME.docx:
   return parseDocx(buffer);
  case MIME.pptx:
   return parsePptx(buffer);
  case MIME.xlsx:
   return parseXlsx(buffer);
  case MIME.csv:
   return parseCsv(buffer.toString('utf-8'));
  case MIME.html:
   return parseHtml(buffer.toString('utf-8'));
  case MIME.markdown:
   return parseMarkdown(buffer.toString('utf-8'));
  case MIME.text:
   return parseText(buffer.toString('utf-8'));
  default:
   throw new Error(`No parser for ${mimeType}`);
 }
}
