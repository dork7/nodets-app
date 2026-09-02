export function chunkText(text: string, size = 500, overlap = 50): string[] {
 const normalized = text.replace(/\r\n/g, '\n').trim();
 if (!normalized) return [];

 const chunks: string[] = [];
 let start = 0;

 while (start < normalized.length) {
  let end = Math.min(start + size, normalized.length);

  if (end < normalized.length) {
   const boundary = normalized.lastIndexOf('\n', end);
   const boundarySentence = normalized.lastIndexOf('. ', end);
   const bestBoundary = Math.max(boundary, boundarySentence, boundarySentence + 1);
   if (bestBoundary > start + size * 0.5) {
    end = bestBoundary + 1;
   }
  }

  const chunk = normalized.slice(start, end).trim();
  if (chunk) {
   chunks.push(chunk);
  }

  if (end >= normalized.length) break;

  start = Math.max(end - overlap, start + 1);
 }

 return chunks;
}

export interface Chunk {
 id: string;
 text: string;
 source: string;
 meta: Record<string, unknown>;
}

export function chunkDocument(text: string, idPrefix: string, source: string, meta: Record<string, unknown>): Chunk[] {
 const parts = chunkText(text);
 return parts.map((text, index) => ({
  id: `${idPrefix}#${index}`,
  text,
  source,
  meta: { ...meta, docId: idPrefix, index },
 }));
}
