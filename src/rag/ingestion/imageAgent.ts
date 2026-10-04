import { createHash } from 'node:crypto';

import { HumanMessage } from '@langchain/core/messages';
import sharp from 'sharp';
import { z } from 'zod';

import { buildRagImagePrompt } from '@/config/prompt';
import { config } from '@/rag/config';
import { toDataUrl } from '@/rag/dataUrl';
import { mapLimit, newId } from '@/rag/graphUtils';
import { invokeStructured } from '@/rag/llm';
import { ragLogger } from '@/rag/logger';
import { saveBlob } from '@/rag/stores/blobs';
import type { Child, Element, Parent } from '@/rag/types';

const ImageDescription = z.object({
 imageType: z.enum(['photo', 'chart', 'diagram', 'screenshot', 'scan', 'other']),
 description: z.string().describe('What the image shows, written for search'),
 visibleText: z.string().describe('Verbatim transcription of any text in the image'),
 dataPoints: z.array(z.string()).describe('Key values if the image is a chart or table'),
});

/** Refuse to decode anything larger; a tiny file can declare an enormous canvas. */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Auto-rotates and bounds the size. Opaque images become JPEG - a photo re-encoded as PNG
 * at this size can exceed the model's per-image limit - and images with transparency stay PNG.
 */
export async function normaliseImage(bytes: Buffer): Promise<Buffer> {
 const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true })
  .rotate()
  .resize({ width: config.imageMaxEdge, height: config.imageMaxEdge, fit: 'inside', withoutEnlargement: true });
 const { hasAlpha } = await image.metadata();
 return hasAlpha ? image.png().toBuffer() : image.jpeg({ quality: 85 }).toBuffer();
}

export async function describeImage(image: Buffer, nearbyText = '') {
 return invokeStructured('vision', ImageDescription, [
  new HumanMessage({
   content: [
    { type: 'image_url', image_url: { url: toDataUrl(image) } },
    { type: 'text', text: buildRagImagePrompt(nearbyText) },
   ],
  }),
 ]);
}

interface Described {
 content: string;
 blobId: string | null;
}

/**
 * Embeds description + transcribed text. The parent keeps the description and the
 * GridFS id of the normalised image, so the verifier can re-read the original later.
 * Figures from the PDF agent arrive already described and have no bytes of their own.
 */
export async function describeImages(
 docId: string,
 elements: Element[]
): Promise<{ parents: Parent[]; children: Child[] }> {
 const images = elements.filter((el) => el.kind === 'image');
 // The same picture (a logo on every slide) is described and stored once per document.
 const byHash = new Map<string, Promise<Described | null>>();

 const describe = async (el: Element): Promise<Described | null> => {
  if (!el.image) return { content: el.content, blobId: null };
  let normalised: Buffer;
  try {
   normalised = await normaliseImage(el.image);
  } catch (err) {
   // Office files often embed formats sharp cannot read (EMF, WMF). One such image must not fail the document.
   ragLogger.warn(`rag ${docId}: skipping an image that could not be decoded (${(err as Error).message})`);
   return null;
  }
  const d = await describeImage(normalised, [el.content, el.nearbyText].filter(Boolean).join('\n'));
  const content = [
   d.description,
   d.visibleText && `Visible text: ${d.visibleText}`,
   d.dataPoints.length && `Data: ${d.dataPoints.join('; ')}`,
  ]
   .filter(Boolean)
   .join('\n\n');
  return { content, blobId: await saveBlob({ buffer: normalised }, `${docId}-image`, { docId, kind: 'image' }) };
 };

 const results = await mapLimit(images, config.agentConcurrency, async (el) => {
  const key = el.image ? createHash('sha256').update(el.image).digest('hex') : null;
  const pending = key ? (byHash.get(key) ?? describe(el)) : describe(el);
  if (key) byHash.set(key, pending);
  const described = await pending;
  if (!described) return null;

  const parent: Parent = {
   _id: newId('par'),
   docId,
   modality: 'image',
   content: described.content,
   blobId: described.blobId,
   page: el.page,
   sectionPath: el.sectionPath,
   createdAt: new Date(),
  };
  const child: Child = {
   chunkId: newId('chk'),
   parentId: parent._id,
   modality: 'image',
   content: described.content,
   page: el.page,
   sectionPath: el.sectionPath,
  };
  return { parent, child };
 });
 const kept = results.filter((r): r is NonNullable<typeof r> => r !== null);
 return { parents: kept.map((r) => r.parent), children: kept.map((r) => r.child) };
}
