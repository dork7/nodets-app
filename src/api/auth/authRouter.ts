import { randomUUID } from 'crypto';
import express, { Request, Response, Router } from 'express';

import { logger } from '@/server';

import { authService } from './authService';

declare module 'express-session' {
 interface SessionData {
  userId?: string;
  oauthState?: string;
 }
}

export const authRouter: Router = (() => {
 const router = express.Router();

 // Kicks off the combined "sign in with Google" + Drive consent flow.
 router.get('/google', (req: Request, res: Response) => {
  const state = randomUUID();
  req.session.oauthState = state;
  res.redirect(authService.generateAuthUrl(state));
 });

 router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error) {
   logger.warn(`Google OAuth consent declined: ${error}`);
   return res.redirect('/chatAI?googleAuth=error');
  }

  if (!code || !state || state !== req.session.oauthState) {
   logger.warn('Google OAuth callback rejected: missing/mismatched state (possible CSRF attempt)');
   return res.status(400).send('Invalid or expired OAuth request. Please try signing in again.');
  }
  delete req.session.oauthState;

  try {
   const { userId } = await authService.handleOAuthCallback(code);
   req.session.userId = userId;
   res.redirect('/chatAI');
  } catch (err) {
   logger.error(`Google OAuth callback failed: ${(err as Error).message}`);
   res.redirect('/chatAI?googleAuth=error');
  }
 });

 router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
   res.clearCookie('connect.sid');
   res.json({ success: true });
  });
 });

 router.get('/status', async (req: Request, res: Response) => {
  const status = await authService.getUserStatus(req.session.userId ?? null);
  res.json(status);
 });

 router.post('/disconnect-drive', async (req: Request, res: Response) => {
  if (!req.session.userId) {
   return res.status(401).json({ success: false, message: 'Not signed in' });
  }
  await authService.disconnectDrive(req.session.userId);
  res.json({ success: true });
 });

 return router;
})();
