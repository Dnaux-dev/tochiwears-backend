
import { Hono } from 'hono';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/db';
import { products, productVariants, inventory, stockReservations } from '@/db/schema';

const app = new Hono();

/**
 * GET /api/products
 * List all published products
 */
app.get('/', async (c) => {
  try {
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.status, 'published'))
      .orderBy(products.name);

    return c.json({ data: allProducts });
  } catch (err) {
    console.error('[GET /products]', err);
    return c.json({ error: 'Failed to fetch products', detail: String(err) }, 500);
  }
});

/**
 * GET /api/products/:slug
 * Get product + variants + inventory
 */
app.get('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');

    const product = await db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (!product.length) {
      return c.json({ error: 'Product not found' }, 404);
    }

    const variants = await db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        size: productVariants.size,
        colour: productVariants.colour,
        priceKobo: productVariants.priceKobo,
        compareAtPriceKobo: productVariants.compareAtPriceKobo,
        active: productVariants.active,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, product[0].id));

    // Enrich variants with available inventory
    const variantsWithInventory = await Promise.all(
      variants.map(async (v) => {
        const result = await db.execute(sql`
          SELECT
            i.quantity - COALESCE(SUM(sr.quantity), 0) as available
          FROM inventory i
          LEFT JOIN stock_reservations sr ON i.variant_id = sr.variant_id
            AND sr.expires_at > NOW()
          WHERE i.variant_id = ${v.id}
          GROUP BY i.quantity
        `);

        const availableQty = result.rows[0]?.available || 0;

        return {
          ...v,
          availableQty,
        };
      })
    );

    return c.json({
      data: {
        ...product[0],
        variants: variantsWithInventory,
      },
    });
  } catch (err) {
    console.error('[GET /products/:slug]', err);
    return c.json({ error: 'Failed to fetch product', detail: String(err) }, 500);
  }
});

export default app;