import mammoth from 'mammoth';

import { parseHtml } from '@/rag/ingestion/parsers/html';
import type { Element } from '@/rag/types';

/** DOCX → HTML (embedded images inlined as data URIs) → the HTML parser, which keeps headings, tables and images. */
export async function parseDocx(buffer: Buffer): Promise<Element[]> {
 const { value } = await mammoth.convertToHtml(
  { buffer },
  {
   convertImage: mammoth.images.imgElement(async (image) => ({
    src: `data:${image.contentType};base64,${await image.read('base64')}`,
   })),
  }
 );
 return parseHtml(value);
}
