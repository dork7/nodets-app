/**
 * Kept apart from the image agent so the API process can build data URLs (the verifier
 * re-reads images) without loading `sharp`'s native binary.
 */
export function toDataUrl(image: Buffer): string {
 const jpeg = image[0] === 0xff && image[1] === 0xd8;
 return `data:image/${jpeg ? 'jpeg' : 'png'};base64,${image.toString('base64')}`;
}
