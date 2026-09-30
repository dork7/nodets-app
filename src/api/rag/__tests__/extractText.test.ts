import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

const mocks = vi.hoisted(() => ({
 env: { OCR_ENABLED: true, OCR_LANGS: 'eng' },
 // When set, `new PDFParse(opts)` returns this fake instead of the real parser.
 pdfFactory: null as null | ((opts: unknown) => unknown),
}));

vi.mock('@/common/utils/envConfig', () => ({ env: mocks.env }));

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));

vi.mock('pdf-parse', async () => {
 const actual = await vi.importActual<typeof import('pdf-parse')>('pdf-parse');
 class PDFParse {
  constructor(opts: ConstructorParameters<typeof actual.PDFParse>[0]) {
   // Returning an object from a constructor replaces `this`.
   return (mocks.pdfFactory ? mocks.pdfFactory(opts) : new actual.PDFParse(opts)) as PDFParse;
  }
 }
 return { ...actual, PDFParse };
});

import { extractText, UnsupportedFileTypeError } from '@/api/rag/extractText';

const createWorkerMock = vi.mocked(createWorker);

type FakeWorker = {
 recognize: ReturnType<typeof vi.fn<[Buffer], Promise<{ data: { text: string } }>>>;
 terminate: ReturnType<typeof vi.fn<[], Promise<undefined>>>;
};

/** Fake Tesseract worker: each recognize() call returns the next canned text. */
const installWorker = (texts: string[] | ((image: Buffer) => string)): FakeWorker => {
 let call = 0;
 const worker: FakeWorker = {
  recognize: vi.fn(async (image: Buffer) => ({
   data: { text: typeof texts === 'function' ? texts(image) : (texts[call++] ?? '') },
  })),
  terminate: vi.fn(async () => undefined),
 };
 createWorkerMock.mockResolvedValue(worker as never);
 return worker;
};

const makePng = (width = 120, height = 60): Buffer => {
 const canvas = createCanvas(width, height);
 const ctx = canvas.getContext('2d');
 ctx.fillStyle = '#fff';
 ctx.fillRect(0, 0, width, height);
 ctx.fillStyle = '#000';
 ctx.font = '20px sans-serif';
 ctx.fillText('Hi', 10, 35);
 return canvas.toBuffer('image/png');
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Hand-assembled PDF: one page per entry; a string becomes a Helvetica text layer,
 * `null` becomes a blank page with no text layer (what a scanned page looks like to pdf.js).
 */
const makePdf = (pages: Array<string | null>): Buffer => {
 const objects: string[] = [];
 const pageIds: number[] = [];
 // 1: catalog, 2: pages, 3: font; page/content objects follow.
 objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
 let next = 4;
 for (const text of pages) {
  const pageId = next++;
  const contentId = next++;
  const stream = text === null ? '' : `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  objects[pageId] =
   `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
   `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  pageIds.push(pageId);
 }
 objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
 objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

 let out = '%PDF-1.4\n';
 const offsets: number[] = [];
 for (let id = 1; id < objects.length; id++) {
  offsets[id] = Buffer.byteLength(out);
  out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
 }
 const xref = Buffer.byteLength(out);
 out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
 out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(out, 'latin1');
};

const makeDocx = async (paragraphs: string[]): Promise<Buffer> => {
 const zip = new JSZip();
 zip.file(
  '[Content_Types].xml',
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
   '<Default Extension="xml" ContentType="application/xml"/>' +
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
   '</Types>'
 );
 zip.file(
  '_rels/.rels',
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
   '</Relationships>'
 );
 zip.file(
  'word/document.xml',
  '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
   paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('') +
   '</w:body></w:document>'
 );
 return zip.generateAsync({ type: 'nodebuffer' });
};

type FakePage = { num: number; text: string };
type FakePdfOptions = {
 pages: FakePage[];
 screenshots?: Array<{ pageNumber: number; data: Uint8Array }>;
 images?: Array<{ pageNumber: number; images: Array<{ data: Uint8Array }> }>;
 screenshotError?: Error;
};

/** Deterministic stand-in for PDFParse so the per-page merge logic can be asserted exactly. */
const installFakePdf = (opts: FakePdfOptions) => {
 const parser = {
  getText: vi.fn(async () => ({ pages: opts.pages, text: 'IGNORED -- 1 of 1 --', total: opts.pages.length })),
  getScreenshot: vi.fn(async () => {
   if (opts.screenshotError) throw opts.screenshotError;
   return { pages: opts.screenshots ?? [], total: opts.pages.length };
  }),
  getImage: vi.fn(async () => ({ pages: opts.images ?? [], total: opts.pages.length })),
  destroy: vi.fn(async () => undefined),
 };
 mocks.pdfFactory = () => parser;
 return parser;
};

/** Tag bytes so the fake OCR worker can map an image back to canned text. */
const tagged = (label: string) => new Uint8Array(Buffer.from(label));

beforeEach(() => {
 mocks.env.OCR_ENABLED = true;
 mocks.env.OCR_LANGS = 'eng';
 mocks.pdfFactory = null;
 createWorkerMock.mockReset();
});

describe('extractText', () => {
 describe('plain text files', () => {
  it.each([
   ['notes.txt', 'hello world'],
   ['README.MD', '# Title\n\nbody'],
   ['data.csv', 'a,b\n1,2'],
   ['config.yaml', 'key: value'],
   ['script.ts', 'export const x = 1;'],
   ['unicode.json', '{"name":"مرحبا ✓"}'],
  ])('decodes %s as UTF-8', async (filename, content) => {
   await expect(extractText(Buffer.from(content, 'utf-8'), filename)).resolves.toBe(content);
  });

  it('accepts an extensionless file whose content is text', async () => {
   await expect(extractText(Buffer.from('Makefile content'), 'Makefile')).resolves.toBe('Makefile content');
  });

  it('rejects a text-extension file that contains NUL bytes', async () => {
   const buffer = Buffer.from([0x68, 0x69, 0x00, 0x21]);
   await expect(extractText(buffer, 'sneaky.txt')).rejects.toThrow('Cannot ingest "sneaky.txt": the file looks binary');
  });

  it('only inspects the first 8KB for NUL bytes', async () => {
   const buffer = Buffer.concat([Buffer.alloc(8192, 'a'), Buffer.from([0])]);
   await expect(extractText(buffer, 'big.log')).resolves.toHaveLength(8193);
  });

  it('never starts OCR for text files', async () => {
   await extractText(Buffer.from('x'), 'a.txt');
   expect(createWorkerMock).not.toHaveBeenCalled();
  });
 });

 describe('unsupported types', () => {
  it.each([
   ['archive.zip', '.zip files are'],
   ['movie.mp4', '.mp4 files are'],
   ['sheet.xlsx', '.xlsx files are'],
   ['legacy.doc', '.doc files are'],
  ])('throws UnsupportedFileTypeError for %s', async (filename, fragment) => {
   const err = await extractText(Buffer.from('whatever'), filename).catch((e) => e);
   expect(err).toBeInstanceOf(UnsupportedFileTypeError);
   expect(err.name).toBe('UnsupportedFileTypeError');
   expect(err.message).toContain(`Cannot ingest "${filename}": ${fragment} not supported.`);
   expect(err.message).toContain('Supported types: PDF, Word (.docx)');
  });

  it('throws UnsupportedFileTypeError for an extensionless binary file', async () => {
   const err = await extractText(Buffer.from([1, 2, 0, 3]), 'blob').catch((e) => e);
   expect(err).toBeInstanceOf(UnsupportedFileTypeError);
   expect(err.message).toContain('files without an extension are not supported');
  });

  it('lists images in the hint when OCR is enabled at module load', async () => {
   const err = await extractText(Buffer.from('x'), 'a.zip').catch((e) => e);
   expect(err.message).toContain('images (png, jpg, webp, bmp, gif, tiff)');
  });

  it('omits images from the hint when OCR is disabled at module load', async () => {
   mocks.env.OCR_ENABLED = false;
   vi.resetModules();
   const fresh = await import('@/api/rag/extractText');
   const err = await fresh.extractText(Buffer.from('x'), 'a.zip').catch((e) => e);
   expect(err).toBeInstanceOf(fresh.UnsupportedFileTypeError);
   expect(err.message).not.toContain('images');
   expect(err.message).toContain('Supported types: PDF, Word (.docx), and plain text');
  });
 });

 describe('images (OCR)', () => {
  it.each(['scan.png', 'photo.JPG', 'pic.jpeg', 'x.webp', 'x.bmp', 'x.gif', 'x.tif', 'x.tiff', 'x.pbm'])(
   'OCRs %s and trims the result',
   async (filename) => {
    const worker = installWorker(['  Recognized text \n\n']);
    const png = makePng();

    await expect(extractText(png, filename)).resolves.toBe('Recognized text');

    expect(createWorkerMock).toHaveBeenCalledWith('eng');
    expect(worker.recognize).toHaveBeenCalledTimes(1);
    const passed = worker.recognize.mock.calls[0][0] as Buffer;
    expect(Buffer.isBuffer(passed)).toBe(true);
    expect(passed.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
   }
  );

  it('passes OCR_LANGS through to createWorker', async () => {
   mocks.env.OCR_LANGS = 'eng+ara';
   installWorker(['نص']);
   await expect(extractText(makePng(), 'a.png')).resolves.toBe('نص');
   expect(createWorkerMock).toHaveBeenCalledWith('eng+ara');
  });

  it('returns an empty string when OCR finds nothing', async () => {
   installWorker(['   \n']);
   await expect(extractText(makePng(), 'blank.png')).resolves.toBe('');
  });

  it('terminates the worker even when recognize fails', async () => {
   const worker = installWorker([]);
   worker.recognize.mockRejectedValueOnce(new Error('tesseract exploded'));

   await expect(extractText(makePng(), 'a.png')).rejects.toThrow('tesseract exploded');
   expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('propagates a createWorker failure (e.g. language data download offline)', async () => {
   createWorkerMock.mockRejectedValue(new Error('network unavailable'));
   await expect(extractText(makePng(), 'a.png')).rejects.toThrow('network unavailable');
  });

  it('rejects images as unsupported when OCR is disabled', async () => {
   mocks.env.OCR_ENABLED = false;
   const err = await extractText(makePng(), 'a.png').catch((e) => e);
   expect(err).toBeInstanceOf(UnsupportedFileTypeError);
   expect(createWorkerMock).not.toHaveBeenCalled();
  });
 });

 describe('docx', () => {
  it('extracts raw text from a real .docx', async () => {
   const docx = await makeDocx(['First paragraph', 'Second paragraph']);
   const text = await extractText(docx, 'report.DOCX');
   expect(text).toContain('First paragraph');
   expect(text).toContain('Second paragraph');
   expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
  });

  it('returns an empty string when mammoth yields no value', async () => {
   vi.spyOn(mammoth, 'extractRawText').mockResolvedValue({ value: undefined, messages: [] } as never);
   await expect(extractText(Buffer.from('x'), 'a.docx')).resolves.toBe('');
  });

  it('propagates mammoth errors for a corrupt .docx', async () => {
   await expect(extractText(Buffer.from('not a zip'), 'broken.docx')).rejects.toThrow();
  });
 });

 describe('PDF (real pdf-parse, hand-built PDFs)', () => {
  it('returns the text layer without pdf-parse page markers when OCR is disabled', async () => {
   mocks.env.OCR_ENABLED = false;
   const pdf = makePdf(['Hello page one', 'Hello page two']);

   const text = await extractText(pdf, 'doc.pdf');

   expect(text).toBe('Hello page one\n\nHello page two');
   expect(text).not.toMatch(/--\s*\d+\s+of\s+\d+\s*--/);
   expect(createWorkerMock).not.toHaveBeenCalled();
  });

  it('drops blank pages when OCR is disabled', async () => {
   mocks.env.OCR_ENABLED = false;
   await expect(extractText(makePdf(['Only text', null]), 'doc.pdf')).resolves.toBe('Only text');
  });

  it('renders a page without a text layer to PNG and OCRs it in page order', async () => {
   const worker = installWorker(['Scanned page two']);

   const text = await extractText(makePdf(['Typed page one', null, 'Typed page three']), 'mixed.pdf');

   expect(text).toBe('Typed page one\n\nScanned page two\n\nTyped page three');
   expect(worker.recognize).toHaveBeenCalledTimes(1);
   const passed = worker.recognize.mock.calls[0][0] as Buffer;
   expect(passed.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
   expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('does not start a Tesseract worker for a text-only PDF with no embedded images', async () => {
   await expect(extractText(makePdf(['Just text']), 'doc.pdf')).resolves.toBe('Just text');
   expect(createWorkerMock).not.toHaveBeenCalled();
  });
 });

 describe('PDF (mocked PDFParse, per-page merge logic)', () => {
  it('merges text layer, embedded-image OCR and scanned-page OCR per page, in page order', async () => {
   const parser = installFakePdf({
    pages: [
     { num: 1, text: '  Intro text  ' },
     { num: 2, text: '   ' },
     { num: 3, text: 'Chart page' },
     { num: 4, text: '' },
    ],
    screenshots: [
     { pageNumber: 2, data: tagged('shot-2') },
     { pageNumber: 4, data: tagged('shot-4') },
    ],
    images: [
     { pageNumber: 1, images: [] },
     { pageNumber: 3, images: [{ data: tagged('img-3a') }, { data: tagged('img-3b') }] },
    ],
   });
   const ocr: Record<string, string> = {
    'shot-2': 'Scanned two',
    'shot-4': 'Scanned four',
    'img-3a': 'Axis labels',
    'img-3b': ' Legend ',
   };
   const worker = installWorker((image) => ocr[image.toString()]);

   const text = await extractText(Buffer.from('%PDF'), 'doc.pdf');

   expect(text).toBe(['Intro text', 'Scanned two', 'Chart page\n\nAxis labels\n\nLegend', 'Scanned four'].join('\n\n'));
   expect(parser.getScreenshot).toHaveBeenCalledWith(
    expect.objectContaining({ partial: [2, 4], scale: 2, imageBuffer: true, imageDataUrl: false })
   );
   expect(parser.getImage).toHaveBeenCalledWith(
    expect.objectContaining({ partial: [1, 3], imageThreshold: 100, imageBuffer: true, imageDataUrl: false })
   );
   // One worker for the whole document, not one per image.
   expect(createWorkerMock).toHaveBeenCalledTimes(1);
   expect(worker.recognize).toHaveBeenCalledTimes(4);
   expect(worker.terminate).toHaveBeenCalledTimes(1);
   expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses per-page text, never the joined text that carries "-- N of M --" markers', async () => {
   mocks.env.OCR_ENABLED = false;
   installFakePdf({ pages: [{ num: 1, text: 'Clean' }] });
   await expect(extractText(Buffer.from('%PDF'), 'doc.pdf')).resolves.toBe('Clean');
  });

  it('skips getScreenshot when every page has text and getImage when every page is scanned', async () => {
   const allText = installFakePdf({ pages: [{ num: 1, text: 'a' }] });
   await extractText(Buffer.from('%PDF'), 'a.pdf');
   expect(allText.getScreenshot).not.toHaveBeenCalled();
   expect(allText.getImage).toHaveBeenCalledTimes(1);

   installWorker(['ocr']);
   const allScanned = installFakePdf({
    pages: [{ num: 1, text: '' }],
    screenshots: [{ pageNumber: 1, data: tagged('s') }],
   });
   await expect(extractText(Buffer.from('%PDF'), 'b.pdf')).resolves.toBe('ocr');
   expect(allScanned.getImage).not.toHaveBeenCalled();
   expect(allScanned.getScreenshot).toHaveBeenCalledTimes(1);
  });

  it('drops empty OCR results and pages that end up empty', async () => {
   installFakePdf({
    pages: [
     { num: 1, text: 'Body' },
     { num: 2, text: '' },
    ],
    screenshots: [{ pageNumber: 2, data: tagged('blank') }],
    images: [{ pageNumber: 1, images: [{ data: tagged('logo') }] }],
   });
   installWorker(() => '  ');

   await expect(extractText(Buffer.from('%PDF'), 'doc.pdf')).resolves.toBe('Body');
  });

  it('does not touch getScreenshot/getImage/Tesseract when OCR is disabled', async () => {
   mocks.env.OCR_ENABLED = false;
   const parser = installFakePdf({
    pages: [
     { num: 1, text: '' },
     { num: 2, text: 'Two' },
    ],
   });

   await expect(extractText(Buffer.from('%PDF'), 'doc.pdf')).resolves.toBe('Two');
   expect(parser.getScreenshot).not.toHaveBeenCalled();
   expect(parser.getImage).not.toHaveBeenCalled();
   expect(createWorkerMock).not.toHaveBeenCalled();
   expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the parser and terminates the worker when OCR fails mid-document', async () => {
   const parser = installFakePdf({
    pages: [{ num: 1, text: '' }],
    screenshots: [{ pageNumber: 1, data: tagged('s') }],
   });
   const worker = installWorker([]);
   worker.recognize.mockRejectedValueOnce(new Error('ocr failed'));

   await expect(extractText(Buffer.from('%PDF'), 'doc.pdf')).rejects.toThrow('ocr failed');
   expect(worker.terminate).toHaveBeenCalledTimes(1);
   expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the parser when rendering a scanned page fails', async () => {
   const parser = installFakePdf({ pages: [{ num: 1, text: '' }], screenshotError: new Error('render failed') });

   await expect(extractText(Buffer.from('%PDF'), 'doc.pdf')).rejects.toThrow('render failed');
   expect(parser.destroy).toHaveBeenCalledTimes(1);
   expect(createWorkerMock).not.toHaveBeenCalled();
  });

  it('destroys the parser when getText fails', async () => {
   const parser = installFakePdf({ pages: [] });
   parser.getText.mockRejectedValueOnce(new Error('bad pdf'));

   await expect(extractText(Buffer.from('%PDF'), 'doc.pdf')).rejects.toThrow('bad pdf');
   expect(parser.destroy).toHaveBeenCalledTimes(1);
  });
 });
});
