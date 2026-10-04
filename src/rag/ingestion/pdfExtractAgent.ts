import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { RAG_PDF_EXTRACT_PROMPT } from '@/config/prompt';
import { invokeStructured, ModelStopError } from '@/rag/llm';

// Kept plain (no bounds, nullable not optional) - structured output rejects richer schemas.
const PdfElements = z.object({
 elements: z.array(
  z.object({
   kind: z.enum(['text', 'table', 'figure']),
   page: z.number().describe('Page number within this batch, starting at 1'),
   sectionPath: z.array(z.string()).describe('Headings above this block, outermost first'),
   content: z.string(),
  })
 ),
});

export type PdfElement = z.infer<typeof PdfElements>['elements'][number];

/** Reads one batch of pages (a standalone PDF) and returns its ordered elements. */
export async function extractPdfBatch(pdf: Buffer): Promise<PdfElement[]> {
 const { elements } = await invokeStructured('vision', PdfElements, [
  new HumanMessage({
   content: [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
    { type: 'text', text: RAG_PDF_EXTRACT_PROMPT },
   ],
  }),
 ]);
 return elements;
}

export const isOutputTruncated = (err: unknown) => err instanceof ModelStopError && err.stopReason === 'max_tokens';
