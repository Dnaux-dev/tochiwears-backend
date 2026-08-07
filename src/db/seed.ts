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
import { categories } from './schema';

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
      });

      console.log(`✅ Created category: ${cat.name}`);
    }

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