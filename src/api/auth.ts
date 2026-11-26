/**
 * Tochiwears — Auth API Endpoints
 * Signup, login, password reset, email verification
 */

import { Hono } from 'hono';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { users, sessions, passwordResets, emailVerifications, type User } from '@/db/schema';
import {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  emailVerificationSchema,
} from '@/lib/validation';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  generatePasswordResetToken,
  generateEmailVerificationToken,
} from '@/lib/auth';
import { requireAuth, getAuth, type AppEnv } from '@/lib/middleware';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email';
import { ApiError, parseBody } from '@/lib/http';

const app = new Hono<AppEnv>();

function publicUser(user: User) {
  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

async function createSession(userId: string) {
  const { token, expiresAt } = generateSessionToken();
  await db.insert(sessions).values({ userId, token, expiresAt, provider: 'password' });
  return { token, expiresAt };
}

/** Email failures are logged, not surfaced: the account action already succeeded. */
async function sendSafely(send: () => Promise<unknown>) {
  try {
    await send();
    return true;
  } catch (err) {
    console.error('Email delivery failed:', err);
    return false;
  }
}

/**
 * POST /auth/signup
 * Body: { email, password, firstName?, lastName?, name?, phone? }
 */
app.post('/signup', async (c) => {
  const { email, password, firstName, lastName, phone } = await parseBody(c, signupSchema);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new ApiError(409, 'Email already registered');

  const passwordHash = await hashPassword(password);
  const verification = generateEmailVerificationToken();

  // The unique index on email still guards against a concurrent signup (→ 409).
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email, passwordHash, firstName: firstName ?? null, lastName: lastName ?? null, phone: phone ?? null })
      .returning();
    await tx.insert(emailVerifications).values({
      userId: created.id,
      token: verification.token,
      expiresAt: verification.expiresAt,
    });
    return created;
  });

  const session = await createSession(user.id);
  const emailSent = await sendSafely(() => sendVerificationEmail(email, verification.token));

  return c.json(
    {
      data: {
        ...publicUser(user),
        message: emailSent
          ? 'Signup successful. Check your email to verify.'
          : 'Signup successful. We could not send the verification email right now.',
      },
      token: session.token,
      expiresAt: session.expiresAt,
    },
    201,
  );
});

/**
 * POST /auth/login
 * Body: { email, password }
 */
app.post('/login', async (c) => {
  const { email, password } = await parseBody(c, loginSchema);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) throw new ApiError(401, 'Invalid email or password');

  const session = await createSession(user.id);
  return c.json({ data: publicUser(user), token: session.token, expiresAt: session.expiresAt });
});

/**
 * POST /auth/logout
 * Deletes the session used for this request.
 */
app.post('/logout', requireAuth, async (c) => {
  const { session } = getAuth(c);
  await db.delete(sessions).where(eq(sessions.id, session.id));
  return c.json({ message: 'Logged out successfully' });
});

/**
 * GET /auth/me
 */
app.get('/me', requireAuth, (c) => {
  const { user } = getAuth(c);
  return c.json({ data: { ...publicUser(user), id: user.id, createdAt: user.createdAt } });
});

/**
 * POST /auth/request-password-reset
 * Always answers the same way so the response doesn't reveal which emails exist.
 */
app.post('/request-password-reset', async (c) => {
  const { email } = await parseBody(c, passwordResetRequestSchema);
  const response = { message: 'If that email is registered, a reset link has been sent' };

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return c.json(response);

  const { token, expiresAt } = generatePasswordResetToken();
  await db.insert(passwordResets).values({ userId: user.id, token, expiresAt });
  await sendSafely(() => sendPasswordResetEmail(email, token));

  return c.json(response);
});

/**
 * POST /auth/reset-password
 * Body: { token, newPassword }. Signs the user out everywhere.
 */
app.post('/reset-password', async (c) => {
  const { token, newPassword } = await parseBody(c, passwordResetSchema);

  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.token, token),
        eq(passwordResets.used, false),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!reset) throw new ApiError(400, 'Invalid or expired reset token');

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
    // Burn this token and any other outstanding ones for the user.
    await tx.update(passwordResets).set({ used: true }).where(eq(passwordResets.userId, reset.userId));
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
  });

  return c.json({ message: 'Password reset successful. Please login again.' });
});

/**
 * POST /auth/verify-email
 * Body: { token }
 */
app.post('/verify-email', async (c) => {
  const { token } = await parseBody(c, emailVerificationSchema);

  const [verification] = await db
    .select()
    .from(emailVerifications)
    .where(
      and(
        eq(emailVerifications.token, token),
        eq(emailVerifications.verified, false),
        gt(emailVerifications.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!verification) throw new ApiError(400, 'Invalid or expired verification token');

  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerified: true }).where(eq(users.id, verification.userId));
    await tx
      .update(emailVerifications)
      .set({ verified: true })
      .where(eq(emailVerifications.id, verification.id));
  });

  return c.json({ message: 'Email verified successfully' });
});

export default app;
