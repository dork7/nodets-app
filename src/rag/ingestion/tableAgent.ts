import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { RAG_TABLE_SUMMARY_PROMPT } from '@/config/prompt';
import { config } from '@/rag/config';
import { mapLimit, newId } from '@/rag/graphUtils';
import { rowGroups, toMarkdownTable } from '@/rag/ingestion/tables';
import { invokeStructured } from '@/rag/llm';
import type { Child, Element, Parent } from '@/rag/types';

const TableSummary = z.object({
 summary: z.string().describe('What the table is about, its columns, units, period and notable rows'),
});

/** Rows shown to the model for the summary; the full table is always stored as the parent. */
const SUMMARY_SAMPLE_ROWS = 60;

async function summarise(table: Element): Promise<string> {
 const sample =
  table.rows && table.rows.length > SUMMARY_SAMPLE_ROWS + 1
   ? toMarkdownTable(table.rows.slice(0, SUMMARY_SAMPLE_ROWS + 1))
   : table.content;
 const total = table.rows ? `\nThe table has ${table.rows.length - 1} rows in total.` : '';
 const heading = table.sectionPath.length ? `Section: ${table.sectionPath.join(' > ')}\n` : '';
 const { summary } = await invokeStructured('utility', TableSummary, [
  new SystemMessage(RAG_TABLE_SUMMARY_PROMPT),
  new HumanMessage(`${heading}<table>\n${sample}\n</table>${total}`),
 ]);
 return summary;
}

/**
 * The embedded text is a search-oriented summary; the parent is the raw table, kept
 * whole. Tables above `tableRowGroup` rows are stored by row group (header repeated),
 * each group searchable through the table-level summary.
 */
export async function summariseTables(
 docId: string,
 elements: Element[]
): Promise<{ parents: Parent[]; children: Child[] }> {
 const tables = elements.filter((el) => el.kind === 'table');
 const results = await mapLimit(tables, config.agentConcurrency, async (table) => {
  const summary = await summarise(table);
  const groups = table.rows ? rowGroups(table.rows, config.tableRowGroup) : [{ rows: null, from: 0, to: 0 }];
  const parents: Parent[] = [];
  const children: Child[] = [];
  for (const group of groups) {
   const parent: Parent = {
    _id: newId('par'),
    docId,
    modality: 'table',
    content: group.rows && groups.length > 1 ? toMarkdownTable(group.rows) : table.content,
    blobId: null,
    page: table.page,
    sectionPath: table.sectionPath,
    createdAt: new Date(),
   };
   parents.push(parent);
   children.push({
    chunkId: newId('chk'),
    parentId: parent._id,
    modality: 'table',
    content: groups.length > 1 ? `${summary}\n\nRows ${group.from}-${group.to}.` : summary,
    page: table.page,
    sectionPath: table.sectionPath,
   });
  }
  return { parents, children };
 });
 return { parents: results.flatMap((r) => r.parents), children: results.flatMap((r) => r.children) };
}
