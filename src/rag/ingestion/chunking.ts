import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { config } from '@/rag/config';
import { newId } from '@/rag/graphUtils';
import type { Child, Element, Parent } from '@/rag/types';

const sameSection = (a: Element, b: Element) =>
 a.page === b.page &&
 a.sectionPath.length === b.sectionPath.length &&
 a.sectionPath.every((s, i) => s === b.sectionPath[i]);

/** Consecutive text elements under the same heading (and page) form one section. */
export function groupSections(elements: Element[]): Element[] {
 const sections: Element[] = [];
 for (const el of elements) {
  const last = sections[sections.length - 1];
  if (last && sameSection(last, el)) last.content += `\n\n${el.content}`;
  else sections.push({ ...el });
 }
 return sections;
}

/** Cuts an oversized section into consecutive pieces so each parent fits in one MongoDB document. */
const splitOversized = (text: string, max: number): string[] => {
 const parts: string[] = [];
 for (let i = 0; i < text.length; i += max) parts.push(text.slice(i, i + max));
 return parts;
};

/**
 * Structure-aware splitting: the section is the parent, each chunk is a child pointing
 * to it, so retrieval matches on the small chunk and returns the whole section.
 */
export async function chunkText(docId: string, elements: Element[]): Promise<{ parents: Parent[]; children: Child[] }> {
 const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: config.chunkChars,
  chunkOverlap: config.chunkOverlapChars,
 });
 const parents: Parent[] = [];
 const children: Child[] = [];

 for (const section of groupSections(elements.filter((el) => el.kind === 'text'))) {
  // The heading path is embedded with every chunk so a chunk still says what it is about.
  const heading = section.sectionPath.join(' > ');
  for (const content of splitOversized(section.content, config.maxParentChars)) {
   const parent: Parent = {
    _id: newId('par'),
    docId,
    modality: 'text',
    content,
    blobId: null,
    page: section.page,
    sectionPath: section.sectionPath,
    createdAt: new Date(),
   };
   parents.push(parent);
   for (const chunk of await splitter.splitText(content)) {
    children.push({
     chunkId: newId('chk'),
     parentId: parent._id,
     modality: 'text',
     content: heading ? `${heading}\n\n${chunk}` : chunk,
     page: section.page,
     sectionPath: section.sectionPath,
    });
   }
  }
 }
 return { parents, children };
}
