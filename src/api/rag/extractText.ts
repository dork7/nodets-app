import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import WordExtractor from 'word-extractor';

import { env } from '@/common/utils/envConfig';

/**
 * File extensions we can turn into clean UTF-8 text for the RAG pipeline.
 * Anything else must be handled by a dedicated extractor (PDF, DOC, DOCX) or rejected —
 * decoding a binary file as UTF-8 produces garbage chunks that poison the vector store.
 */
const TEXT_EXTENSIONS = new Set([
 'txt',
 'text',
 'md',
 'markdown',
 'csv',
 'tsv',
 'json',
 'jsonl',
 'ndjson',
 'log',
 'html',
 'htm',
 'xml',
 'xhtml',
 'svg',
 'yaml',
 'yml',
 'toml',
 'ini',
 'cfg',
 'conf',
 'properties',
 'env',
 'js',
 'jsx',
 'ts',
 'tsx',
 'mjs',
 'cjs',
 'vue',
 'py',
 'java',
 'kt',
 'scala',
 'c',
 'cc',
 'cpp',
 'h',
 'hpp',
 'cs',
 'go',
 'rb',
 'php',
 'rs',
 'swift',
 'sh',
 'bash',
 'zsh',
 'sql',
 'graphql',
 'gql',
]);

/** Raster image formats Tesseract can read; ingested via OCR when OCR_ENABLED. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'pbm']);

/** Render scale for scanned PDF pages before OCR — higher is more accurate but slower. */
const PDF_OCR_SCALE = 2;

/** Embedded PDF images at or below this width/height (px) are skipped — icons, bullets, logos. */
const PDF_IMAGE_MIN_SIZE = 100;

const SUPPORTED_HINT = `Supported types: PDF, Word (.doc, .docx), ${
 env.OCR_ENABLED ? 'images (png, jpg, webp, bmp, gif, tiff), ' : ''
}and plain text (txt, md, csv, json, jsonl, xml, yaml, config, and code files).`;

export class UnsupportedFileTypeError extends Error {
 constructor(filename: string) {
  const ext = getExtension(filename);
  super(
   `Cannot ingest "${filename}": ${ext ? `.${ext} files are` : 'files without an extension are'} not supported. ${SUPPORTED_HINT}`
  );
  this.name = 'UnsupportedFileTypeError';
 }
}

const getExtension = (filename: string): string => {
 const dot = filename.lastIndexOf('.');
 return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
};

/** A NUL byte in the first few KB is a reliable "this is not text" signal. */
const looksBinary = (buffer: Buffer): boolean => buffer.subarray(0, 8192).includes(0);

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const HTML_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeHtmlEntities = (text: string): string =>
 text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
  if (code[0] !== '#') return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
 });

/** Readable text from an HTML document: keeps the <title>, drops head/script/style, one line per block. */
const htmlToText = (html: string): string => {
 const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
 const body = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(head|script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote|pre|section|article)>/gi, '\n')
  .replace(/<\/t[dh]>/gi, ' \t ')
  .replace(/<[^>]+>/g, ' ');

 return decodeHtmlEntities([title, body].filter(Boolean).join('\n'))
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .join('\n');
};

const extractDocxText = async (buffer: Buffer): Promise<string> => {
 const { value } = await mammoth.extractRawText({ buffer });
 return value ?? '';
};

/**
 * `.doc` is ambiguous in practice: besides real Word 97-2003 binaries, tools save HTML
 * (e.g. Jira's "Export > Word"), RTF, or a renamed .docx under that extension, all of
 * which Word opens fine. Pick the extractor by content rather than by extension.
 */
const extractDocText = async (buffer: Buffer, filename: string): Promise<string> => {
 if (buffer.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC)) {
  const document = await new WordExtractor().extract(buffer);
  return [document.getBody(), document.getFootnotes(), document.getEndnotes()]
   .map((part) => part.trim())
   .filter(Boolean)
   .join('\n\n');
 }

 if (buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
  return extractDocxText(buffer);
 }

 const head = buffer
  .subarray(0, 1024)
  .toString('utf-8')
  .replace(/^\uFEFF/, '')
  .trimStart();
 if (head.startsWith('{\\rtf')) {
  throw new Error(`Cannot ingest "${filename}": it is an RTF document saved as .doc. Re-save it as .docx or PDF.`);
 }
 if (/^<(!doctype html|html|\?xml)/i.test(head) || /<html[\s>]/i.test(head)) {
  return htmlToText(buffer.toString('utf-8'));
 }
 if (!looksBinary(buffer)) {
  return buffer.toString('utf-8');
 }

 throw new Error(`Cannot ingest "${filename}": it is not a readable Word document.`);
};

/** OCR each image with a single short-lived Tesseract worker; returns one text per image, in order. */
const ocrImages = async (images: Array<Buffer | Uint8Array>): Promise<string[]> => {
 if (!images.length) return [];
 const worker = await createWorker(env.OCR_LANGS);
 try {
  const texts: string[] = [];
  for (const image of images) {
   const { data } = await worker.recognize(Buffer.from(image));
   texts.push(data.text.trim());
  }
  return texts;
 } finally {
  await worker.terminate();
 }
};

/**
 * Per page: pages with a text layer keep their text plus OCR of any sizeable
 * embedded images (diagrams, screenshots); pages without one (scanned) are
 * rendered whole and OCR'd. With OCR disabled, only the text layer is used.
 */
const extractPdfText = async (buffer: Buffer): Promise<string> => {
 const parser = new PDFParse({ data: new Uint8Array(buffer) });
 try {
  const { pages } = await parser.getText();
  const pageTexts = pages.map((page) => page.text.trim());
  if (!env.OCR_ENABLED) return pageTexts.filter(Boolean).join('\n\n');

  const scannedPages = pages.filter((_, i) => !pageTexts[i]).map((page) => page.num);
  const textPages = pages.filter((_, i) => pageTexts[i]).map((page) => page.num);

  const [screenshots, embedded] = await Promise.all([
   scannedPages.length
    ? parser.getScreenshot({ partial: scannedPages, scale: PDF_OCR_SCALE, imageBuffer: true, imageDataUrl: false })
    : null,
   textPages.length
    ? parser.getImage({
       partial: textPages,
       imageThreshold: PDF_IMAGE_MIN_SIZE,
       imageBuffer: true,
       imageDataUrl: false,
      })
    : null,
  ]);

  // OCR every image in one worker pass, then fold results back into their page.
  const images = [
   ...(screenshots?.pages ?? []).map((shot) => ({ pageNumber: shot.pageNumber, data: shot.data })),
   ...(embedded?.pages ?? []).flatMap((page) =>
    page.images.map((image) => ({ pageNumber: page.pageNumber, data: image.data }))
   ),
  ];
  const ocrTexts = await ocrImages(images.map((image) => image.data));
  const ocrByPage = new Map<number, string[]>();
  images.forEach((image, i) => {
   if (ocrTexts[i]) ocrByPage.set(image.pageNumber, [...(ocrByPage.get(image.pageNumber) ?? []), ocrTexts[i]]);
  });

  return pages
   .map((page, i) => [pageTexts[i], ...(ocrByPage.get(page.num) ?? [])].filter(Boolean).join('\n\n'))
   .filter(Boolean)
   .join('\n\n');
 } finally {
  await parser.destroy();
 }
};

/**
 * Extract plain text from an uploaded file buffer, chosen by file extension.
 * Throws `UnsupportedFileTypeError` for formats we cannot read, so the caller can
 * surface a clear message instead of indexing binary noise.
 */
export const extractText = async (buffer: Buffer, filename: string): Promise<string> => {
 const ext = getExtension(filename);

 if (ext === 'pdf') {
  return extractPdfText(buffer);
 }

 if (ext === 'doc') {
  return extractDocText(buffer, filename);
 }

 if (ext === 'docx') {
  return extractDocxText(buffer);
 }

 if (IMAGE_EXTENSIONS.has(ext) && env.OCR_ENABLED) {
  const [text] = await ocrImages([buffer]);
  return text;
 }

 if (TEXT_EXTENSIONS.has(ext) || (!ext && !looksBinary(buffer))) {
  if (looksBinary(buffer)) {
   throw new Error(`Cannot ingest "${filename}": the file looks binary, not text.`);
  }
  return buffer.toString('utf-8');
 }

 throw new UnsupportedFileTypeError(filename);
};
