/**
 * Tochiwears — Auth API Endpoints
 * Signup, login, password reset, email verification
 */

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '@/db';
import { users, sessions, passwordResets, emailVerifications } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
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
  normalizeEmail,
  normalizePhoneNumber,
} from '@/lib/auth';
import { requireAuth, getAuth } from '@/lib/middleware';

const app = new Hono();

/* ========================================
   SIGNUP
   ======================================== */

/**
 * POST /auth/signup
 * Register a new user account
 */
app.post('/signup', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validation = signupSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { email, password, firstName, lastName, phone } = validation.data;

    // Check if email already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    // Normalize phone
    let normalizedPhone = null;
    if (phone) {
      normalizedPhone = normalizePhoneNumber(phone);
      if (!normalizedPhone) {
        return c.json({ error: 'Invalid Nigerian phone number' }, 400);
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const newUser = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        phone: normalizedPhone,
      })
      .returning({ id: users.id, email: users.email, role: users.role });

    // Generate session
    const { token, expiresAt } = generateSessionToken();
    await db.insert(sessions).values({
      userId: newUser[0].id,
      token,
      expiresAt,
      provider: 'password',
    });

    // Generate email verification token
    const { token: verifyToken } = generateEmailVerificationToken();
    await db.insert(emailVerifications).values({
      userId: newUser[0].id,
      token: verifyToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return c.json(
      {
        data: {
          userId: newUser[0].id,
          email: newUser[0].email,
          role: newUser[0].role,
          message: 'Signup successful. Check your email to verify.',
        },
        token, // Session token to use in Authorization header
      },
      201
    );
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   LOGIN
   ======================================== */

/**
 * POST /auth/login
 * Authenticate with email and password
 */
app.post('/login', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { email, password } = validation.data;

    // Find user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user.length || !user[0].passwordHash) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user[0].passwordHash);
    if (!isValid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Create session
    const { token, expiresAt } = generateSessionToken();
    await db.insert(sessions).values({
      userId: user[0].id,
      token,
      expiresAt,
      provider: 'password',
    });

    return c.json({
      data: {
        userId: user[0].id,
        email: user[0].email,
        role: user[0].role,
      },
      token,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   LOGOUT
   ======================================== */

/**
 * POST /auth/logout
 * Invalidate current session
 */
app.post('/logout', requireAuth, async (c) => {
  try {
    const token =
      c.req.header('Authorization')?.slice(7) || getCookie(c, 'session');

    if (token) {
      // Delete session
      await db.delete(sessions).where(eq(sessions.token, token));
    }

    return c.json({ message: 'Logged out successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   GET CURRENT USER
   ======================================== */

/**
 * GET /auth/me
 * Get current authenticated user
 */
app.get('/me', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user.length) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ data: user[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   REQUEST PASSWORD RESET
   ======================================== */

/**
 * POST /auth/request-password-reset
 * Send password reset email
 */
app.post('/request-password-reset', async (c) => {
  try {
    const body = await c.req.json();

    const validation = passwordResetRequestSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Invalid email' }, 400);
    }

    const { email } = validation.data;

    // Find user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always return success (don't leak whether email exists)
    if (!user.length) {
      return c.json({
        message: 'If email exists, a reset link has been sent',
      });
    }

    // Generate reset token
    const { token, expiresAt } = generatePasswordResetToken();
    await db.insert(passwordResets).values({
      userId: user[0].id,
      token,
      expiresAt,
    });

    // TODO: Send email with reset link
    // const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    // await sendEmail(email, 'Reset your password', `Click here: ${resetLink}`);

    return c.json({
      message: 'If email exists, a reset link has been sent',
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   RESET PASSWORD
   ======================================== */

/**
 * POST /auth/reset-password
 * Set new password using reset token
 */
app.post('/reset-password', async (c) => {
  try {
    const body = await c.req.json();

    const validation = passwordResetSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { token, newPassword } = validation.data;

    // Find reset token
    const reset = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.token, token),
          eq(passwordResets.used, false)
        )
      )
      .limit(1);

    if (!reset.length) {
      return c.json({ error: 'Invalid or expired reset token' }, 400);
    }

    if (reset[0].expiresAt < new Date()) {
      return c.json({ error: 'Reset token has expired' }, 400);
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, reset[0].userId));

    // Mark reset as used
    await db
      .update(passwordResets)
      .set({ used: true })
      .where(eq(passwordResets.id, reset[0].id));

    // Invalidate all sessions
    await db.delete(sessions).where(eq(sessions.userId, reset[0].userId));

    return c.json({ message: 'Password reset successful. Please login again.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   VERIFY EMAIL
   ======================================== */

/**
 * POST /auth/verify-email
 * Verify email address
 */
app.post('/verify-email', async (c) => {
  try {
    const body = await c.req.json();

    const validation = emailVerificationSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Invalid token' }, 400);
    }

    const { token } = validation.data;

    // Find verification token
    const verification = await db
      .select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.token, token),
          eq(emailVerifications.verified, false)
        )
      )
      .limit(1);

    if (!verification.length) {
      return c.json({ error: 'Invalid or expired verification token' }, 400);
    }

    if (verification[0].expiresAt < new Date()) {
      return c.json({ error: 'Verification token has expired' }, 400);
    }

    // Mark email as verified
    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, verification[0].userId));

    await db
      .update(emailVerifications)
      .set({ verified: true })
      .where(eq(emailVerifications.id, verification[0].id));

    return c.json({ message: 'Email verified successfully' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;