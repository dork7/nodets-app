import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

/**
 * File extensions we can turn into clean UTF-8 text for the RAG pipeline.
 * Anything else must be handled by a dedicated extractor (PDF, DOCX) or rejected —
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
 'log',
 'html',
 'htm',
 'xml',
 'yaml',
 'yml',
 'ini',
 'js',
 'jsx',
 'ts',
 'tsx',
 'mjs',
 'cjs',
 'py',
 'java',
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
 'sh',
 'sql',
]);

const SUPPORTED_HINT = 'Supported types: PDF, Word (.docx), and plain text (txt, md, csv, json, code files).';

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

/**
 * Extract plain text from an uploaded file buffer, chosen by file extension.
 * Throws `UnsupportedFileTypeError` for formats we cannot read, so the caller can
 * surface a clear message instead of indexing binary noise.
 */
export const extractText = async (buffer: Buffer, filename: string): Promise<string> => {
 const ext = getExtension(filename);

 if (ext === 'pdf') {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
   const result = await parser.getText();
   return result.text ?? '';
  } finally {
   await parser.destroy();
  }
 }

 if (ext === 'docx') {
  const { value } = await mammoth.extractRawText({ buffer });
  return value ?? '';
 }

 if (TEXT_EXTENSIONS.has(ext) || (!ext && !looksBinary(buffer))) {
  if (looksBinary(buffer)) {
   throw new Error(`Cannot ingest "${filename}": the file looks binary, not text.`);
  }
  return buffer.toString('utf-8');
 }

 throw new UnsupportedFileTypeError(filename);
};
