import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { type Step, traced } from '@/rag/graphUtils';
import { chunkText } from '@/rag/ingestion/chunking';
import { describeImages } from '@/rag/ingestion/imageAgent';
import { indexDocument } from '@/rag/ingestion/indexer';
import { parseDocument } from '@/rag/ingestion/parsers';
import { qualityProblems } from '@/rag/ingestion/quality';
import { summariseTables } from '@/rag/ingestion/tableAgent';
import { readBlob } from '@/rag/stores/blobs';
import * as docstore from '@/rag/stores/docstore';
import type { Child, Element, Parent, RagDocument } from '@/rag/types';

const concat = <T>(a: T[], b: T[]) => a.concat(b);

export const IngestState = Annotation.Root({
 jobId: Annotation<string>(),
 docId: Annotation<string>(),
 requestId: Annotation<string>(),
 /** The worker holding the job; the indexer checks it still does before writing. */
 workerId: Annotation<string | null>(),
 doc: Annotation<RagDocument>(),
 elements: Annotation<Element[]>(),
 // The three modality branches write concurrently, so these need reducers.
 parents: Annotation<Parent[]>({ reducer: concat, default: () => [] }),
 children: Annotation<Child[]>({ reducer: concat, default: () => [] }),
 problems: Annotation<string[]>({ reducer: concat, default: () => [] }),
 steps: Annotation<Step[]>({ reducer: concat, default: () => [] }),
 chunkCount: Annotation<number>(),
});

type S = typeof IngestState.State;

async function parseNode(state: S) {
 await docstore.setJobStage(state.jobId, 'parse');
 const doc = await docstore.getDocument(state.docId);
 if (!doc) throw new Error(`Document ${state.docId} no longer exists`);
 await docstore.setDocumentStatus(doc._id, 'indexing');
 const elements = await parseDocument(await readBlob(doc.blobId), doc.mimeType);
 return { doc, elements };
}

const textChunkerNode = (state: S) => chunkText(state.docId, state.elements);
const tableAgentNode = (state: S) => summariseTables(state.docId, state.elements);
const imageAgentNode = (state: S) => describeImages(state.docId, state.elements);

async function qualityGateNode(state: S) {
 return { problems: qualityProblems(state.elements, state.children) };
}

async function indexNode(state: S) {
 await docstore.setJobStage(state.jobId, 'indexer');
 const stillOurs = async () => !state.workerId || docstore.ownsJob(state.jobId, state.workerId);
 return { chunkCount: await indexDocument(state.doc, state.parents, state.children, stillOurs) };
}

// Node names must differ from state keys in LangGraph, hence `indexer` / `qualityGate`.
export const ingestionGraph = new StateGraph(IngestState)
 .addNode('parse', traced('parse', parseNode))
 .addNode('textChunker', traced('textChunker', textChunkerNode))
 .addNode('tableAgent', traced('tableAgent', tableAgentNode))
 .addNode('imageAgent', traced('imageAgent', imageAgentNode))
 .addNode('qualityGate', traced('qualityGate', qualityGateNode))
 .addNode('indexer', traced('indexer', indexNode))
 .addEdge(START, 'parse')
 .addEdge('parse', 'textChunker')
 .addEdge('parse', 'tableAgent')
 .addEdge('parse', 'imageAgent')
 // Fan in: wait for all three branches before judging the result.
 .addEdge(['textChunker', 'tableAgent', 'imageAgent'], 'qualityGate')
 .addConditionalEdges('qualityGate', (s) => (s.problems.length ? 'fail' : 'ok'), { ok: 'indexer', fail: END })
 .addEdge('indexer', END)
 .compile();
