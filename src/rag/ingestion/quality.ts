import type { Child, Element } from '@/rag/types';

/** Rough ceiling for one embedding input (~8k tokens); a chunk above it would be rejected or truncated. */
const MAX_EMBED_CHARS = 30_000;
const MIN_PRINTABLE_RATIO = 0.85;

/** Share of characters that are letters, digits, punctuation or whitespace rather than control/replacement noise. */
export function printableRatio(text: string): number {
 if (!text.length) return 1;
 // eslint-disable-next-line no-control-regex
 const noise = text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g)?.length ?? 0;
 return 1 - noise / text.length;
}

/** Deterministic checks on what the parser and the modality agents produced; any problem fails the job. */
export function qualityProblems(elements: Element[], children: Child[]): string[] {
 const problems: string[] = [];
 if (!elements.length) return ['no content could be extracted from the document'];
 if (!children.length) problems.push('the document produced nothing to index');

 const text = elements
  .filter((el) => el.kind === 'text')
  .map((el) => el.content)
  .join('');
 if (text && printableRatio(text) < MIN_PRINTABLE_RATIO) problems.push('extracted text is mostly non-printable');

 const oversized = children.filter((c) => c.content.length > MAX_EMBED_CHARS).length;
 if (oversized) problems.push(`${oversized} chunk(s) exceed the embedding input limit`);

 const emptyImages = children.filter((c) => c.modality === 'image' && !c.content.trim()).length;
 if (emptyImages) problems.push(`${emptyImages} image(s) have an empty description`);

 return problems;
}
