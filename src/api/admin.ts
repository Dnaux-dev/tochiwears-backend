/**
 * Tochiwears — Admin API
 * Full CRUD for products, variants, inventory, categories
 */

import { Hono } from 'hono';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  products,
  productVariants,
  inventory,
  categories,
  inventoryMovements,
  stockMovementReason,
  type NewProduct,
  type NewProductVariant,
} from '@/db/schema';
import { uuidv7 } from 'uuidv7';

const app = new Hono();

/* ========================================
   PRODUCTS
   ======================================== */

/**
 * POST /admin/products
 * Create a new product
 */
app.post('/products', async (c) => {
  const body = await c.req.json();

  const {
    slug,
    name,
    description,
    status = 'draft',
    featured = false,
    metaTitle,
    metaDescription,
  } = body;

  if (!slug || !name) {
    return c.json(
      { error: 'slug and name are required' },
      400
    );
  }

  try {
    const result = await db
      .insert(products)
      .values({
        slug,
        name,
        description: description || null,
        status,
        featured,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
      })
      .returning();

    return c.json({ data: result[0] }, 201);
  } catch (err: any) {
    if (err.message.includes('duplicate')) {
      return c.json({ error: 'slug must be unique' }, 400);
    }
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /admin/products
 * List all products (including drafts)
 */
app.get('/products', async (c) => {
  try {
    const allProducts = await db
      .select()
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(products.name);

    return c.json({ data: allProducts });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /admin/products/:id
 * Get product with variants
 */
app.get('/products/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const product = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), isNull(products.deletedAt)))
      .limit(1);

    if (!product.length) {
      return c.json({ error: 'Product not found' }, 404);
    }

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id));

    return c.json({
      data: {
        ...product[0],
        variants,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * PATCH /admin/products/:id
 * Update product
 */
app.patch('/products/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const { name, description, status, featured, metaTitle, metaDescription } =
    body;

  try {
    const result = await db
      .update(products)
      .set({
        name: name || undefined,
        description: description || undefined,
        status: status || undefined,
        featured: featured !== undefined ? featured : undefined,
        metaTitle: metaTitle || undefined,
        metaDescription: metaDescription || undefined,
      })
      .where(eq(products.id, id))
      .returning();

    if (!result.length) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json({ data: result[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * DELETE /admin/products/:id
 * Soft delete product
 */
app.delete('/products/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await db
      .update(products)
      .set({ deletedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (!result.length) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json({ message: 'Product deleted', data: result[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   VARIANTS
   ======================================== */

/**
 * POST /admin/products/:productId/variants
 * Create variant for a product
 */
app.post('/products/:productId/variants', async (c) => {
  const productId = c.req.param('productId');
  const body = await c.req.json();

  const { sku, size, colour, priceKobo, compareAtPriceKobo, weightGrams } =
    body;

  if (!sku || priceKobo === undefined) {
    return c.json(
      { error: 'sku and priceKobo are required' },
      400
    );
  }

  if (priceKobo < 0) {
    return c.json({ error: 'priceKobo must be >= 0' }, 400);
  }

  try {
    // Verify product exists
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product.length) {
      return c.json({ error: 'Product not found' }, 404);
    }

    const variant = await db
      .insert(productVariants)
      .values({
        productId,
        sku,
        size: size || null,
        colour: colour || null,
        priceKobo,
        compareAtPriceKobo: compareAtPriceKobo || null,
        weightGrams: weightGrams || null,
      })
      .returning();

    // Auto-create inventory record with quantity 0
    await db.insert(inventory).values({
      variantId: variant[0].id,
      quantity: 0,
    });

    return c.json({ data: variant[0] }, 201);
  } catch (err: any) {
    if (err.message.includes('duplicate')) {
      return c.json({ error: 'sku must be unique' }, 400);
    }
    return c.json({ error: err.message }, 500);
  }
});

/**
 * PATCH /admin/variants/:variantId
 * Update variant
 */
app.patch('/variants/:variantId', async (c) => {
  const variantId = c.req.param('variantId');
  const body = await c.req.json();

  const {
    sku,
    size,
    colour,
    priceKobo,
    compareAtPriceKobo,
    weightGrams,
    active,
  } = body;

  if (priceKobo !== undefined && priceKobo < 0) {
    return c.json({ error: 'priceKobo must be >= 0' }, 400);
  }

  try {
    const result = await db
      .update(productVariants)
      .set({
        sku: sku || undefined,
        size: size !== undefined ? size : undefined,
        colour: colour !== undefined ? colour : undefined,
        priceKobo: priceKobo || undefined,
        compareAtPriceKobo:
          compareAtPriceKobo !== undefined ? compareAtPriceKobo : undefined,
        weightGrams: weightGrams !== undefined ? weightGrams : undefined,
        active: active !== undefined ? active : undefined,
      })
      .where(eq(productVariants.id, variantId))
      .returning();

    if (!result.length) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    return c.json({ data: result[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * DELETE /admin/variants/:variantId
 * Soft delete variant
 */
app.delete('/variants/:variantId', async (c) => {
  const variantId = c.req.param('variantId');

  try {
    const result = await db
      .update(productVariants)
      .set({ deletedAt: new Date() })
      .where(eq(productVariants.id, variantId))
      .returning();

    if (!result.length) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    return c.json({ message: 'Variant deleted', data: result[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   INVENTORY
   ======================================== */

/**
 * PATCH /admin/inventory/:variantId
 * Update stock quantity
 */
app.patch('/inventory/:variantId', async (c) => {
  const variantId = c.req.param('variantId');
  const body = await c.req.json();

  const { quantity, reason = 'adjustment', note } = body;

  if (quantity === undefined || !Number.isInteger(quantity)) {
    return c.json({ error: 'quantity must be an integer' }, 400);
  }

  try {
    // Get current inventory
    const current = await db
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, variantId))
      .limit(1);

    if (!current.length) {
      return c.json({ error: 'Inventory not found' }, 404);
    }

    const oldQty = current[0].quantity;
    const delta = quantity - oldQty;

    // Update inventory
    const result = await db
      .update(inventory)
      .set({ quantity })
      .where(eq(inventory.variantId, variantId))
      .returning();

    // Record movement
    if (delta !== 0) {
      await db.insert(inventoryMovements).values({
        variantId,
        delta,
        reason,
        note: note || null,
        referenceId: null,
      });
    }

    return c.json({ data: result[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /admin/inventory/:variantId/movements
 * View stock movement history
 */
app.get('/inventory/:variantId/movements', async (c) => {
  const variantId = c.req.param('variantId');

  try {
    const movements = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.variantId, variantId))
      .orderBy(inventoryMovements.createdAt);

    return c.json({ data: movements });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /admin/inventory/low-stock
 * List variants below low stock threshold
 */
app.get('/inventory/low-stock', async (c) => {
  try {
    const lowStock = await db.execute(sql`
      SELECT
        pv.id,
        pv.sku,
        pv.size,
        pv.colour,
        p.name as product_name,
        i.quantity,
        i.low_stock_threshold
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE i.quantity <= i.low_stock_threshold
        AND pv.deleted_at IS NULL
        AND p.deleted_at IS NULL
      ORDER BY i.quantity ASC
    `);

    return c.json({ data: lowStock.rows });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   CATEGORIES
   ======================================== */

/**
 * POST /admin/categories
 * Create category
 */
app.post('/categories', async (c) => {
  const body = await c.req.json();

  const { slug, name, description, parentId, position } = body;

  if (!slug || !name) {
    return c.json(
      { error: 'slug and name are required' },
      400
    );
  }

  try {
    const result = await db
      .insert(categories)
      .values({
        slug,
        name,
        description: description || null,
        parentId: parentId || null,
        position: position || 0,
      })
      .returning();

    return c.json({ data: result[0] }, 201);
  } catch (err: any) {
    if (err.message.includes('duplicate')) {
      return c.json({ error: 'slug must be unique' }, 400);
    }
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /admin/categories
 * List all categories
 */
app.get('/categories', async (c) => {
  try {
    const allCategories = await db
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt))
      .orderBy(categories.position);

    return c.json({ data: allCategories });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * PATCH /admin/categories/:id
 * Update category
 */
app.patch('/categories/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const { name, description, parentId, position } = body;

  try {
    const result = await db
      .update(categories)
      .set({
        name: name || undefined,
        description: description || undefined,
        parentId: parentId !== undefined ? parentId : undefined,
        position: position !== undefined ? position : undefined,
      })
      .where(eq(categories.id, id))
      .returning();

    if (!result.length) {
      return c.json({ error: 'Category not found' }, 404);
    }

    return c.json({ data: result[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * DELETE /admin/categories/:id
 * Soft delete category
 */
app.delete('/categories/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await db
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();

    if (!result.length) {
      return c.json({ error: 'Category not found' }, 404);
    }

    return c.json({ message: 'Category deleted', data: result[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   DASHBOARD / REPORTING
   ======================================== */

/**
 * GET /admin/stats
 * Quick dashboard stats
 */
app.get('/stats', async (c) => {
  try {
    const stats = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL)::int as total_products,
        (SELECT COUNT(*) FROM product_variants WHERE deleted_at IS NULL)::int as total_variants,
        (SELECT SUM(quantity) FROM inventory)::int as total_stock,
        (SELECT COUNT(*) FROM inventory WHERE quantity <= low_stock_threshold)::int as low_stock_count
    `);

    return c.json({ data: stats.rows[0] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;