import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

import { env } from '@/common/utils/envConfig';
import { decrypt, encrypt } from '@/common/utils/tokenCrypto';
import { UserModel } from '@/models/user.model';
import { logger } from '@/server';

// Full drive scope is requested here by design (read/write across the whole Drive).
// If requirements ever narrow, drive.file (access limited to files this app created
// or the user explicitly opened with it) is the least-privilege alternative.
const SCOPES = env.GOOGLE_DRIVE_SCOPES.split(' ').filter(Boolean);
const REFRESH_BUFFER_MS = 60_000;

const buildOAuth2Client = (): OAuth2Client =>
 new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

const generateAuthUrl = (state: string): string =>
 buildOAuth2Client().generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
  state,
 });

interface GoogleTokenResponse {
 access_token?: string | null;
 refresh_token?: string | null;
 expiry_date?: number | null;
 scope?: string;
}

/** Single write path for tokens - callback exchange and later refreshes both go through this. */
const persistTokens = async (userId: string, tokens: GoogleTokenResponse): Promise<void> => {
 const update: Record<string, unknown> = {
  'googleTokens.expiryDate': tokens.expiry_date ?? null,
 };
 if (tokens.access_token) {
  update['googleTokens.accessToken'] = encrypt(tokens.access_token);
 }
 // Google only returns this on first consent (access_type=offline, prompt=consent) - never clear it here.
 if (tokens.refresh_token) {
  update['googleTokens.refreshToken'] = encrypt(tokens.refresh_token);
 }
 if (tokens.scope) {
  update['googleTokens.scopes'] = tokens.scope.split(' ').filter(Boolean);
 }
 await UserModel.updateOne({ _id: userId }, { $set: update });
};

const handleOAuthCallback = async (code: string): Promise<{ userId: string; email: string }> => {
 const client = buildOAuth2Client();
 const { tokens } = await client.getToken(code);
 client.setCredentials(tokens);

 const oauth2 = google.oauth2({ version: 'v2', auth: client });
 const { data: profile } = await oauth2.userinfo.get();

 if (!profile.id || !profile.email) {
  throw new Error('Google did not return a user id/email for this account');
 }

 let user = await UserModel.findOne({ googleId: profile.id });
 if (user) {
  user.email = profile.email;
  user.name = profile.name ?? user.name;
  user.avatarUrl = profile.picture ?? user.avatarUrl;
  await user.save();
 } else {
  user = await UserModel.create({
   googleId: profile.id,
   email: profile.email,
   name: profile.name,
   avatarUrl: profile.picture,
  });
 }

 const userId = user._id.toString();
 await persistTokens(userId, tokens);

 return { userId, email: profile.email };
};

/**
 * The single choke point for talking to Drive as a given user: loads + decrypts
 * stored tokens, refreshes if near expiry, and persists any refreshed token back
 * (via the 'tokens' event) so callers never duplicate refresh logic.
 */
const getValidOAuth2Client = async (userId: string): Promise<OAuth2Client | null> => {
 const user = await UserModel.findById(userId);
 if (!user?.googleTokens.accessToken) {
  return null;
 }

 const client = buildOAuth2Client();
 const refreshToken = user.googleTokens.refreshToken ? decrypt(user.googleTokens.refreshToken) : undefined;

 client.setCredentials({
  access_token: decrypt(user.googleTokens.accessToken),
  refresh_token: refreshToken,
  expiry_date: user.googleTokens.expiryDate ?? undefined,
 });

 client.on('tokens', (tokens) => {
  persistTokens(userId, tokens).catch((err) =>
   logger.error(`Failed to persist refreshed Google tokens for user ${userId}: ${(err as Error).message}`)
  );
 });

 const expiryDate = user.googleTokens.expiryDate ?? 0;
 if (Date.now() <= expiryDate - REFRESH_BUFFER_MS) {
  return client;
 }

 if (!refreshToken) {
  logger.warn(`Google access token expired for user ${userId} and no refresh token is stored.`);
  return null;
 }

 try {
  // Triggers a refresh (emits 'tokens', handled above) when the current token is stale.
  await client.getAccessToken();
  return client;
 } catch (err) {
  logger.warn(
   `Google refresh_token appears revoked for user ${userId}, clearing stored tokens: ${(err as Error).message}`
  );
  await UserModel.updateOne(
   { _id: userId },
   {
    $set: {
     'googleTokens.accessToken': null,
     'googleTokens.refreshToken': null,
     'googleTokens.expiryDate': null,
    },
   }
  );
  return null;
 }
};

const getUserStatus = async (
 userId: string | null
): Promise<{ authenticated: boolean; email?: string; name?: string; driveConnected?: boolean }> => {
 if (!userId) {
  return { authenticated: false };
 }
 const user = await UserModel.findById(userId).lean();
 if (!user) {
  return { authenticated: false };
 }
 return {
  authenticated: true,
  email: user.email,
  name: user.name,
  driveConnected: Boolean(user.googleTokens.refreshToken || user.googleTokens.accessToken),
 };
};

const disconnectDrive = async (userId: string): Promise<void> => {
 const user = await UserModel.findById(userId);
 if (!user) return;

 const revocable = user.googleTokens.refreshToken ?? user.googleTokens.accessToken;
 if (revocable) {
  try {
   await buildOAuth2Client().revokeToken(decrypt(revocable));
  } catch (err) {
   logger.warn(
    `Google token revocation call failed for user ${userId} (continuing to clear local tokens): ${(err as Error).message}`
   );
  }
 }

 await UserModel.updateOne(
  { _id: userId },
  {
   $set: {
    'googleTokens.accessToken': null,
    'googleTokens.refreshToken': null,
    'googleTokens.expiryDate': null,
    'googleTokens.scopes': [],
   },
  }
 );
};

export const authService = {
 generateAuthUrl,
 handleOAuthCallback,
 getValidOAuth2Client,
 getUserStatus,
 disconnectDrive,
};
