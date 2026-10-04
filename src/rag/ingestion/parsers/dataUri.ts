const DATA_IMAGE = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i;

/**
 * Images referenced by Markdown or HTML are only read from data URIs. Remote URLs are
 * never fetched: that would let an uploaded document make the server call arbitrary addresses.
 */
export function imageFromDataUri(src: string | undefined): Buffer | null {
 const match = src?.trim().match(DATA_IMAGE);
 return match ? Buffer.from(match[1], 'base64') : null;
}
