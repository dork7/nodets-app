import type { Source } from '@/rag/types';

/** Attribute values come from uploads (filenames), so anything that could close the attribute or the tag is removed. */
// eslint-disable-next-line no-control-regex
const attr = (value: string) => value.replace(/[\u0000-\u001f"<>&]/g, ' ').slice(0, 200);

/** Stops source text from closing its own block or forging another one. */
const body = (value: string) => value.replace(/<(\/?)source\b/gi, '<$1\u200bsource');

/** Retrieved content is wrapped in tags so prompts can state that it is data, not instructions. */
export const renderSource = (s: Source): string =>
 `<source id="${s.sourceId}" file="${attr(s.filename)}" page="${s.page ?? ''}" modality="${s.modality}">\n${body(s.content)}\n</source>`;

export const renderSources = (sources: Source[]): string => sources.map(renderSource).join('\n\n');

/**
 * Source ids cited in an answer, in order of first use. Parsed in code rather than trusted
 * from the model. Accepts grouped citations such as [S1, S2] as well as [S1][S2].
 */
export const parseCitedIds = (answer: string): string[] => [
 ...new Set([...answer.matchAll(/\[([^\]\n]{1,200})\]/g)].flatMap((group) => group[1].match(/\bS\d+\b/g) ?? [])),
];
