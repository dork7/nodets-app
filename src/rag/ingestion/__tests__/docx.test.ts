import JSZip from 'jszip';

import { parseDocx } from '@/rag/ingestion/parsers/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (text: string, style?: string) =>
 `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
const tc = (text: string) => `<w:tc>${p(text)}</w:tc>`;

async function buildDocx(): Promise<Buffer> {
 const zip = new JSZip();
 zip.file(
  '[Content_Types].xml',
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
   '<Default Extension="xml" ContentType="application/xml"/>' +
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
 );
 zip.file(
  '_rels/.rels',
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
 );
 zip.file(
  'word/_rels/document.xml.rels',
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
 );
 zip.file(
  'word/styles.xml',
  `<?xml version="1.0"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`
 );
 zip.file(
  'word/document.xml',
  `<?xml version="1.0"?><w:document ${W}><w:body>${p('Leave policy', 'Heading1')}${p('Staff get 30 days.')}` +
   `<w:tbl><w:tr>${tc('Grade')}${tc('Days')}</w:tr><w:tr>${tc('A')}${tc('30')}</w:tr></w:tbl></w:body></w:document>`
 );
 return zip.generateAsync({ type: 'nodebuffer' });
}

describe('parseDocx', () => {
 it('keeps headings as the section path and tables as their own elements', async () => {
  const elements = await parseDocx(await buildDocx());
  expect(elements).toEqual([
   { kind: 'text', content: 'Staff get 30 days.', page: null, sectionPath: ['Leave policy'] },
   expect.objectContaining({
    kind: 'table',
    sectionPath: ['Leave policy'],
    rows: [
     ['Grade', 'Days'],
     ['A', '30'],
    ],
   }),
  ]);
 });
});
