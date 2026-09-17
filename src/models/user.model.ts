import { model, Schema } from 'mongoose';

import { EncryptedPayload } from '@/common/utils/tokenCrypto';

interface EncryptedTokenField extends EncryptedPayload {}

export interface GoogleTokens {
 accessToken: EncryptedTokenField | null;
 refreshToken: EncryptedTokenField | null;
 expiryDate: number | null; // epoch ms
 scopes: string[];
}

export interface UserDoc {
 googleId: string;
 email: string;
 name?: string;
 avatarUrl?: string;
 googleTokens: GoogleTokens;
 createdAt: Date;
 updatedAt: Date;
}

const encryptedFieldSchema = new Schema<EncryptedTokenField>(
 {
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
 },
 { _id: false }
);

const googleTokensSchema = new Schema<GoogleTokens>(
 {
  accessToken: { type: encryptedFieldSchema, default: null },
  refreshToken: { type: encryptedFieldSchema, default: null },
  expiryDate: { type: Number, default: null },
  scopes: { type: [String], default: [] },
 },
 { _id: false }
);

const userSchema = new Schema<UserDoc>(
 {
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String },
  avatarUrl: { type: String },
  googleTokens: {
   type: googleTokensSchema,
   default: () => ({ accessToken: null, refreshToken: null, expiryDate: null, scopes: [] }),
  },
 },
 { timestamps: true }
);

export const UserModel = model<UserDoc>('User', userSchema);
