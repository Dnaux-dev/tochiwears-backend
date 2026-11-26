/**
 * Create an admin, or set the password (and admin role) of an existing user.
 * Signs that user out everywhere.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run admin:set
 *
 * Uses DATABASE_URL from .env, so it acts on whichever database that points to.
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './index';
import { sessions, users } from './schema';
import { hashPassword } from '../lib/auth';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  const passwordHash = await hashPassword(password);
  const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email));

  if (existing) {
    const role = existing.role === 'super_admin' ? 'super_admin' : 'admin';
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, role, emailVerified: true }).where(eq(users.id, existing.id));
      await tx.delete(sessions).where(eq(sessions.userId, existing.id));
    });
    console.log(`✅ Updated ${email}: role ${role}, new password set, all sessions signed out.`);
  } else {
    await db.insert(users).values({
      email,
      passwordHash,
      role: 'admin',
      emailVerified: true,
      firstName: 'Admin',
    });
    console.log(`✅ Created admin ${email}.`);
  }
}

main()
  .catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
