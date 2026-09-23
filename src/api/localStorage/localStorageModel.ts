import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export type LocalFileReference = z.infer<typeof LocalFileReferenceSchema>;

export const LocalFileReferenceSchema = z.object({
 id: z.string(),
 name: z.string(),
 folder: z.string(),
 size: z.number(),
 mimetype: z.string(),
 createdAt: z.date(),
});

/** What `listFiles` returns: the reference shape plus a download `url` and the
 * extra fields that only live in MongoDB (`LocalFileModel`). */
export type LocalFileListItem = LocalFileReference & {
 url: string;
 type?: string;
 metadata?: Record<string, unknown>;
 ingested?: boolean;
};
