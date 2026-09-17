import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { env } from '@/common/utils/envConfig';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV length for GCM

const getKey = (): Buffer => {
 const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64');
 if (key.length !== 32) {
  throw new Error(
   `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  );
 }
 return key;
};

export interface EncryptedPayload {
 ciphertext: string;
 iv: string;
 authTag: string;
}

/** Encrypts a secret (e.g. an OAuth token) for storage at rest. */
export const encrypt = (plaintext: string): EncryptedPayload => {
 const iv = randomBytes(IV_LENGTH);
 const cipher = createCipheriv(ALGORITHM, getKey(), iv);
 const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
 return {
  ciphertext: ciphertext.toString('base64'),
  iv: iv.toString('base64'),
  authTag: cipher.getAuthTag().toString('base64'),
 };
};

/** Reverses `encrypt`. Throws if the payload was tampered with or the key doesn't match. */
export const decrypt = (payload: EncryptedPayload): string => {
 const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(payload.iv, 'base64'));
 decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
 const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]);
 return plaintext.toString('utf8');
};
