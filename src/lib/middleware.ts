import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '@/db';
import { sessions, users, type User, type Session } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';

export interface AuthContext {
  user: User;
  session: Session;
}

/** Hono env for routers that sit behind requireAuth / requireAdmin. */
export type AppEnv = { Variables: AuthContext };

function readToken(c: Context): string | undefined {
  const header = c.req.header('Authorization');
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || getCookie(c, 'session') || undefined;
}

async function loadSession(c: Context): Promise<AuthContext | null> {
  const token = readToken(c);
  if (!token) return null;

  const [result] = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return result ?? null;
}

export async function requireAuth(c: Context, next: Next) {
  const auth = await loadSession(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized: missing, invalid or expired session token' }, 401);
  }
  c.set('user', auth.user);
  c.set('session', auth.session);
  await next();
}

export async function optionalAuth(c: Context, next: Next) {
  const auth = await loadSession(c);
  if (auth) {
    c.set('user', auth.user);
    c.set('session', auth.session);
  }
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const auth = await loadSession(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized: missing, invalid or expired session token' }, 401);
  }
  if (auth.user.role !== 'admin' && auth.user.role !== 'super_admin') {
    return c.json({ error: 'Forbidden: Admin access required' }, 403);
  }
  c.set('user', auth.user);
  c.set('session', auth.session);
  await next();
}

/** Only valid inside routes mounted behind requireAuth / requireAdmin. */
export function getAuth(c: Context): AuthContext {
  return { user: c.get('user') as User, session: c.get('session') as Session };
}
