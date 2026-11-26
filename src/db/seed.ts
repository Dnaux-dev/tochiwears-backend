/**
 * Tochiwears — database seed
 * Creates the base categories and, if ADMIN_EMAIL + ADMIN_PASSWORD are set,
 * an admin user. Safe to re-run: existing rows are left alone.
 *
 * Run with: npm run db:seed
 */

import { db, pool } from './index';
import { categories, users } from './schema';
import { hashPassword } from '../lib/auth';

const TOCHIWEARS_CATEGORIES = [
  { name: 'Belt', slug: 'belt', description: 'Premium belts for every occasion', position: 0 },
  { name: 'Jewelry', slug: 'jewelry', description: 'Statement pieces and everyday essentials', position: 1 },
  { name: 'Wristwatch', slug: 'wristwatch', description: 'Timepieces that make a statement', position: 2 },
  { name: 'Glasses', slug: 'glasses', description: 'Style and vision combined', position: 3 },
];

async function seed() {
  console.log('🌱 Seeding Tochiwears categories...');
  for (const cat of TOCHIWEARS_CATEGORIES) {
    const inserted = await db.insert(categories).values(cat).onConflictDoNothing().returning();
    console.log(inserted.length ? `✅ Created category: ${cat.name}` : `↩️  Exists: ${cat.name}`);
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.log('⏭️  ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin user.');
  } else if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  } else {
    const inserted = await db
      .insert(users)
      .values({
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
        emailVerified: true,
      })
      .onConflictDoNothing({ target: users.email })
      .returning();
    console.log(
      inserted.length
        ? `✅ Admin user created: ${adminEmail}`
        : `↩️  ${adminEmail} already exists (role and password left unchanged)`,
    );
  }

  console.log('✨ Seeding complete!');
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
