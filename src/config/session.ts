import MongoStore from 'connect-mongo';
import cookie from 'cookie';
import cookieParser from 'cookie-parser';
import session from 'express-session';

import { env } from '@/common/utils/envConfig';

export const SESSION_COOKIE_NAME = 'connect.sid';

// Its own connection to the same Mongo URI - decoupled from the app's conditional
// mongoose.connect() timing (see server.ts), and it's what /ws/chatAI reads directly
// (see getUserIdFromCookieHeader) since WS upgrade requests never pass through Express
// middleware, so req.session is not available there.
export const sessionStore = MongoStore.create({
 mongoUrl: env.MONGO_URI,
 collectionName: 'sessions',
});

export const sessionMiddleware = session({
 name: SESSION_COOKIE_NAME,
 secret: env.SESSION_SECRET,
 store: sessionStore,
 resave: false,
 saveUninitialized: false,
 cookie: {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
 },
});

/** Resolves the signed-in user id (or null) from a raw `Cookie` request header. */
export const getUserIdFromCookieHeader = (cookieHeader: string | undefined): Promise<string | null> =>
 new Promise((resolve) => {
  if (!cookieHeader) return resolve(null);

  const raw = cookie.parse(cookieHeader)[SESSION_COOKIE_NAME];
  if (!raw) return resolve(null);

  const sid = cookieParser.signedCookie(raw, env.SESSION_SECRET);
  if (!sid) return resolve(null);

  sessionStore.get(sid, (err, sessionData) => {
   if (err || !sessionData) return resolve(null);
   resolve((sessionData as { userId?: string }).userId ?? null);
  });
 });
