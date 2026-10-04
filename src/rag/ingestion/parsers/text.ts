import type { Element } from '@/rag/types';

export function parseText(text: string): Element[] {
 const content = text.replace(/^\uFEFF/, '').trim();
 return content ? [{ kind: 'text', content, page: null, sectionPath: [] }] : [];
}
