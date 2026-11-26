/**
 * Tochiwears — Public catalogue API
 * Only published, non-deleted products and active variants are exposed.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { getStorefrontProducts } from '@/lib/catalog';
import { ApiError, parseQuery } from '@/lib/http';

const app = new Hono();

const listQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  featured: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

/**
 * GET /api/products?category=<slug>&featured=true
 * Published products with variants, prices, stock, images and categories.
 */
app.get('/', async (c) => {
  const query = parseQuery(c, listQuerySchema);
  const data = await getStorefrontProducts({
    categorySlug: query.category,
    featured: query.featured,
  });
  return c.json({ data });
});

/**
 * GET /api/products/:slug
 */
app.get('/:slug', async (c) => {
  const [product] = await getStorefrontProducts({ slug: c.req.param('slug') });
  if (!product) throw new ApiError(404, 'Product not found');
  return c.json({ data: product });
});

export default app;

/**
 * GET /api/categories
 * Public category list for storefront navigation.
 */
export const categoriesApi = new Hono().get('/', async (c) => {
  const data = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      parentId: categories.parentId,
      position: categories.position,
    })
    .from(categories)
    .where(and(isNull(categories.deletedAt)))
    .orderBy(asc(categories.position), asc(categories.name));
  return c.json({ data });
});
