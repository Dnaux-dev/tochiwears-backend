import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '@/db';
import { sessions, users, User, Session } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';

export interface AuthContext {
  user: User;
  session: Session;
}

export async function requireAuth(c: Context, next: Next) {
  const token =
    c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') ||
    getCookie(c, 'session');

  if (!token) {
    return c.json({ error: 'Unauthorized: Missing session token' }, 401);
  }

  const [result] = await db
    .select({
      user: users,
      session: sessions,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.token, token),
        gte(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!result) {
    return c.json({ error: 'Unauthorized: Invalid or expired session' }, 401);
  }

  c.set('user', result.user);
  c.set('session', result.session);

  await next();
}

export async function optionalAuth(c: Context, next: Next) {
  const token =
    c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') ||
    getCookie(c, 'session');

  if (token) {
    const [result] = await db
      .select({
        user: users,
        session: sessions,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.token, token),
          gte(sessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (result) {
      c.set('user', result.user);
      c.set('session', result.session);
    }
  }

  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const token =
    c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') ||
    getCookie(c, 'session');

  if (!token) {
    return c.json({ error: 'Unauthorized: Missing session token' }, 401);
  }

  const [result] = await db
    .select({
      user: users,
      session: sessions,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.token, token),
        gte(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!result) {
    return c.json({ error: 'Unauthorized: Invalid or expired session' }, 401);
  }

  if (result.user.role !== 'admin' && result.user.role !== 'super_admin') {
    return c.json({ error: 'Forbidden: Admin access required' }, 403);
  }

  c.set('user', result.user);
  c.set('session', result.session);

  await next();
}

export function getAuth(c: Context): AuthContext {
  const user = c.get('user') as User;
  const session = c.get('session') as Session;
  return { user, session };
}