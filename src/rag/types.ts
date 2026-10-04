export type Modality = 'text' | 'table' | 'image';

export interface Principal {
 id: string;
 /** e.g. ["user:u_123", "*"] - matched against a chunk's `acl` inside Qdrant. */
 acl: string[];
}

/** One ordered piece of a parsed document. */
export interface Element {
 kind: Modality;
 /** Text, a Markdown table, or (for images) the caption / alt text. */
 content: string;
 /** Page, slide or sheet number; null where the format has none. */
 page: number | null;
 sectionPath: string[];
 /** Table cells, header row first - lets large tables be split by row group. */
 rows?: string[][];
 /** Raw image bytes for `image` elements. */
 image?: Buffer;
 /** Text around an image, used to ground its description. */
 nearbyText?: string;
}

/** The raw content a vector points to; stored in `rag_parents`. */
export interface Parent {
 _id: string;
 docId: string;
 modality: Modality;
 content: string;
 blobId: string | null;
 page: number | null;
 sectionPath: string[];
 createdAt: Date;
}

/** The searchable text that gets embedded; stored in Qdrant. */
export interface Child {
 chunkId: string;
 parentId: string;
 modality: Modality;
 content: string;
 page: number | null;
 sectionPath: string[];
}

export type DocumentStatus = 'queued' | 'indexing' | 'indexed' | 'failed';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface RagDocument {
 _id: string;
 collection: string;
 filename: string;
 mimeType: string;
 sha256: string;
 sizeBytes: number;
 blobId: string;
 status: DocumentStatus;
 chunkCount: number;
 metadata: Record<string, unknown>;
 acl: string[];
 uploadedBy: string;
 createdAt: Date;
 updatedAt: Date;
}

export interface RagJob {
 _id: string;
 docId: string;
 requestId: string;
 uploadedBy: string;
 status: JobStatus;
 stage: string | null;
 counts: { text: number; table: number; image: number };
 attempts: number;
 lockedAt: Date | null;
 /** Earliest time a requeued job may be claimed again (retry backoff). */
 runAfter?: Date | null;
 workerId: string | null;
 errorId: string | null;
 createdAt: Date;
 startedAt: Date | null;
 finishedAt: Date | null;
}

/** A retrieved parent, numbered for citation. */
export interface Source {
 sourceId: string;
 parentId: string;
 docId: string;
 filename: string;
 page: number | null;
 modality: Modality;
 content: string;
 blobId: string | null;
}
