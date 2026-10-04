import { PDFDocument } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';

import { config } from '@/rag/config';
import { extractPdfBatch, isOutputTruncated, type PdfElement } from '@/rag/ingestion/pdfExtractAgent';
import { parseMarkdownTable } from '@/rag/ingestion/tables';
import type { Element } from '@/rag/types';

/** Below this share of text-layer words found in the agent's output, the text layer is trusted instead. */
const FIDELITY_THRESHOLD = 0.9;
const MIN_TEXT_LAYER_CHARS = 50;

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Share of the text layer's words that also appear in the agent's reading of the page. */
export function textOverlap(textLayer: string, agentText: string): number {
 const expected = words(textLayer);
 if (!expected.length) return 1;
 const seen = new Set(words(agentText));
 return expected.filter((w) => seen.has(w)).length / expected.length;
}

async function textLayerByPage(buffer: Buffer): Promise<Map<number, string>> {
 const parser = new PDFParse({ data: new Uint8Array(buffer) });
 try {
  const { pages } = await parser.getText();
  return new Map(pages.map((page) => [page.num, page.text.trim()]));
 } finally {
  await parser.destroy();
 }
}

const toElement = (el: PdfElement, page: number): Element => {
 if (el.kind === 'table') {
  const lines = el.content.trim().split('\n');
  return {
   kind: 'table',
   content: el.content.trim(),
   rows: parseMarkdownTable(lines),
   page,
   sectionPath: el.sectionPath,
  };
 }
 // A figure has no separate image bytes: the agent's description is the content.
 return {
  kind: el.kind === 'figure' ? 'image' : 'text',
  content: el.content.trim(),
  page,
  sectionPath: el.sectionPath,
 };
};

/** Sends pages [start, start+count) to the extraction agent, halving the batch when the output is cut off. */
async function extractRange(source: PDFDocument, start: number, count: number): Promise<Element[]> {
 const batch = await PDFDocument.create();
 const indices = Array.from({ length: count }, (_, i) => start + i);
 (await batch.copyPages(source, indices)).forEach((page) => batch.addPage(page));
 try {
  const elements = await extractPdfBatch(Buffer.from(await batch.save()));
  return elements.map((el) => toElement(el, start + Math.min(Math.max(Math.round(el.page), 1), count)));
 } catch (err) {
  if (!isOutputTruncated(err) || count === 1) throw err;
  const half = Math.ceil(count / 2);
  return [...(await extractRange(source, start, half)), ...(await extractRange(source, start + half, count - half))];
 }
}

/**
 * Where a page has a text layer and the agent's reading diverges from it, keep the
 * text layer for that page's prose and only the agent's tables and figures.
 */
export function applyFidelityCheck(elements: Element[], textLayer: Map<number, string>): Element[] {
 const byPage = new Map<number, Element[]>();
 for (const el of elements) byPage.set(el.page ?? 0, [...(byPage.get(el.page ?? 0) ?? []), el]);

 const pages = [...new Set([...byPage.keys(), ...textLayer.keys()])].sort((a, b) => a - b);
 return pages.flatMap((page) => {
  const extracted = byPage.get(page) ?? [];
  const layer = textLayer.get(page) ?? '';
  if (layer.length < MIN_TEXT_LAYER_CHARS) return extracted;
  // Headings are returned in sectionPath, not content, but they are part of the page's text layer.
  const agentText = extracted.map((el) => `${el.sectionPath.join(' ')}\n${el.content}`).join('\n');
  if (textOverlap(layer, agentText) >= FIDELITY_THRESHOLD) return extracted;
  const sectionPath = extracted[0]?.sectionPath ?? [];
  return [
   { kind: 'text' as const, content: layer, page, sectionPath },
   ...extracted.filter((el) => el.kind !== 'text'),
  ];
 });
}

export async function parsePdf(buffer: Buffer): Promise<Element[]> {
 const textLayer = await textLayerByPage(buffer);

 if (config.pdfExtractMode === 'text') {
  return [...textLayer.entries()]
   .filter(([, text]) => text)
   .map(([page, text]) => ({ kind: 'text' as const, content: text, page, sectionPath: [] }));
 }

 // pdf-lib refuses encrypted files and throws on corrupt ones, which fails the job with a clear message.
 const source = await PDFDocument.load(buffer);
 const total = source.getPageCount();
 if (total > config.maxPdfPages) {
  throw new Error(
   `PDF has ${total} pages; the limit is ${config.maxPdfPages}. Split it, or ingest it with RAG_PDF_EXTRACT_MODE=text.`
  );
 }
 const elements: Element[] = [];
 for (let start = 0; start < total; start += config.pdfPagesPerCall) {
  elements.push(...(await extractRange(source, start, Math.min(config.pdfPagesPerCall, total - start))));
 }
 return applyFidelityCheck(elements, textLayer);
}
