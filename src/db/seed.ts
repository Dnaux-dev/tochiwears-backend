/**
 * Tochiwears — database seed
 * Populates initial product categories
 *
 * Run with: npm run db:seed
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { uuidv7 } from 'uuidv7';
import { categories, users } from './schema';
import { hashPassword } from '../lib/auth';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

const TOCHIWEARS_CATEGORIES = [
  {
    name: 'Belt',
    slug: 'belt',
    description: 'Premium belts for every occasion',
    position: 0,
  },
  {
    name: 'Jewelry',
    slug: 'jewelry',
    description: 'Statement pieces and everyday essentials',
    position: 1,
  },
  {
    name: 'Wristwatch',
    slug: 'wristwatch',
    description: 'Timepieces that make a statement',
    position: 2,
  },
  {
    name: 'Glasses',
    slug: 'glasses',
    description: 'Style and vision combined',
    position: 3,
  },
];

async function seed() {
  try {
    console.log('🌱 Seeding Tochiwears categories...');

    for (const cat of TOCHIWEARS_CATEGORIES) {
      await db.insert(categories).values({
        id: uuidv7(),
        ...cat,
      }).onConflictDoNothing();

      console.log(`✅ Created category: ${cat.name}`);
    }

    console.log('🌱 Seeding Admin User...');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@tochiwears.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminHash = await hashPassword(adminPassword);
    
    await db.insert(users).values({
      id: uuidv7(),
      email: adminEmail,
      passwordHash: adminHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      emailVerified: true,
    }).onConflictDoNothing({ target: users.email });
    
    console.log(`✅ Admin user ensured: ${adminEmail}`);

    console.log('✨ Seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();