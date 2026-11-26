/**
 * Tochiwears — Admin API
 * Mounted behind requireAdmin in src/index.ts.
 */

import { Hono, type Context } from 'hono';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  categories,
  deliveryZones,
  inventory,
  inventoryMovements,
  orders,
  productCategories,
  productImages,
  products,
  productVariants,
  users,
} from '@/db/schema';
import { getAuth, type AppEnv } from '@/lib/middleware';
import { ApiError, parseBody, parseQuery } from '@/lib/http';
import { imageUrl } from '@/lib/catalog';
import { getOrderWithItems, transitionOrder } from '@/lib/orders';
import { assertStatesFree, withStateCount } from '@/lib/delivery';
import {
  cloudinaryEnabled,
  createUploadSignature,
  destroy,
  isOwnPublicId,
  isPublicId,
  ROOT_FOLDER,
} from '@/lib/cloudinary';
import {
  addProductImageSchema,
  adminOrderListSchema,
  createCategorySchema,
  createDeliveryZoneSchema,
  createProductSchema,
  createVariantSchema,
  paginationSchema,
  setProductCategoriesSchema,
  signUploadSchema,
  updateCategorySchema,
  updateDeliveryZoneSchema,
  updateInventorySchema,
  updateOrderStatusSchema,
  updateProductSchema,
  updateVariantSchema,
  uuidParam,
} from '@/lib/validation';
import { z } from 'zod';

const app = new Hono<AppEnv>();

const idParam = (c: Context, name: string) => uuidParam.parse(c.req.param(name));

/** Drop undefined keys so PATCH only touches fields the client sent. */
function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function assertNonEmpty(patch: object) {
  if (!Object.keys(patch).length) throw new ApiError(400, 'No fields to update');
}

/** Statuses that count as revenue. */
const REVENUE_STATUSES = ['paid', 'processing', 'shipped', 'delivered'] as const;

/* ========================================
   PRODUCTS
   ======================================== */

/**
 * POST /admin/products
 */
app.post('/products', async (c) => {
  const { categoryIds, ...input } = await parseBody(c, createProductSchema);

  const product = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({ ...input, publishedAt: input.status === 'published' ? new Date() : null })
      .returning();
    if (categoryIds?.length) {
      await tx
        .insert(productCategories)
        .values([...new Set(categoryIds)].map((categoryId) => ({ productId: created.id, categoryId })));
    }
    return created;
  });

  return c.json({ data: product }, 201);
});

/**
 * GET /admin/products?status=draft
 * All non-deleted products (any status) with variant count and total stock.
 */
app.get('/products', async (c) => {
  const { status } = parseQuery(
    c,
    z.object({ status: z.enum(['draft', 'published', 'archived']).optional() }),
  );

  const data = await db
    .select({
      product: products,
      variantCount: sql<number>`count(${productVariants.id})`.mapWith(Number),
      totalStock: sql<number>`coalesce(sum(${inventory.quantity}), 0)`.mapWith(Number),
    })
    .from(products)
    .leftJoin(
      productVariants,
      and(eq(productVariants.productId, products.id), isNull(productVariants.deletedAt)),
    )
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(isNull(products.deletedAt), status ? eq(products.status, status) : undefined))
    .groupBy(products.id)
    .orderBy(asc(products.name));

  return c.json({
    data: data.map((r) => ({ ...r.product, variantCount: r.variantCount, totalStock: r.totalStock })),
  });
});

/**
 * GET /admin/products/:id
 * Product with variants (+ inventory), images and categories.
 */
app.get('/products/:id', async (c) => {
  const id = idParam(c, 'id');

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .limit(1);
  if (!product) throw new ApiError(404, 'Product not found');

  const [variants, images, cats] = await Promise.all([
    db
      .select({
        variant: productVariants,
        quantity: inventory.quantity,
        lowStockThreshold: inventory.lowStockThreshold,
        allowBackorder: inventory.allowBackorder,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(productVariants.productId, id), isNull(productVariants.deletedAt)))
      .orderBy(asc(productVariants.position)),
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(asc(productImages.position)),
    db
      .select({ id: categories.id, slug: categories.slug, name: categories.name })
      .from(productCategories)
      .innerJoin(categories, eq(productCategories.categoryId, categories.id))
      .where(eq(productCategories.productId, id)),
  ]);

  return c.json({
    data: {
      ...product,
      variants: variants.map((v) => ({
        ...v.variant,
        inventory: {
          quantity: v.quantity ?? 0,
          lowStockThreshold: v.lowStockThreshold,
          allowBackorder: v.allowBackorder ?? false,
        },
      })),
      images: images.map((i) => ({ ...i, url: imageUrl(i.storageKey) })),
      categories: cats,
    },
  });
});

/**
 * PATCH /admin/products/:id
 * Setting status to "published" the first time stamps publishedAt.
 */
app.patch('/products/:id', async (c) => {
  const id = idParam(c, 'id');
  const patch = definedOnly(await parseBody(c, updateProductSchema));
  assertNonEmpty(patch);

  const [updated] = await db
    .update(products)
    .set({
      ...patch,
      ...(patch.status === 'published' && {
        publishedAt: sql`coalesce(${products.publishedAt}, now())`,
      }),
    })
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .returning();
  if (!updated) throw new ApiError(404, 'Product not found');

  return c.json({ data: updated });
});

/**
 * DELETE /admin/products/:id
 * Soft delete; order history keeps referencing it.
 */
app.delete('/products/:id', async (c) => {
  const id = idParam(c, 'id');
  const [deleted] = await db
    .update(products)
    .set({ deletedAt: new Date(), status: 'archived' })
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .returning();
  if (!deleted) throw new ApiError(404, 'Product not found');
  return c.json({ message: 'Product deleted', data: deleted });
});

/**
 * PUT /admin/products/:id/categories
 * Body: { categoryIds: [...] } — replaces the product's categories.
 */
app.put('/products/:id/categories', async (c) => {
  const id = idParam(c, 'id');
  const { categoryIds } = await parseBody(c, setProductCategoriesSchema);

  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!product) throw new ApiError(404, 'Product not found');

  await db.transaction(async (tx) => {
    await tx.delete(productCategories).where(eq(productCategories.productId, id));
    if (categoryIds.length) {
      await tx
        .insert(productCategories)
        .values([...new Set(categoryIds)].map((categoryId) => ({ productId: id, categoryId })));
    }
  });

  const data = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(productCategories)
    .innerJoin(categories, eq(productCategories.categoryId, categories.id))
    .where(eq(productCategories.productId, id));
  return c.json({ data });
});

/* ========================================
   PRODUCT IMAGES
   ======================================== */

/**
 * POST /admin/uploads/sign
 * Body: { productId? }. Returns a signed Cloudinary upload for the browser:
 * POST `uploadUrl` as multipart with `file` plus every entry of `fields`,
 * then register the returned public_id via POST /admin/products/:id/images.
 */
app.post('/uploads/sign', async (c) => {
  if (!cloudinaryEnabled) throw new ApiError(503, 'Image uploads are not configured on the server');
  const { productId } = await parseBody(c, signUploadSchema);
  const folder = productId ? `${ROOT_FOLDER}/products/${productId}` : `${ROOT_FOLDER}/products`;
  return c.json({ data: createUploadSignature(folder) });
});

/**
 * POST /admin/products/:id/images
 * Body: { publicId | storageKey | url, alt?, position?, colour? }
 * Registers an uploaded image. publicId is the Cloudinary public_id.
 */
app.post('/products/:id/images', async (c) => {
  const productId = idParam(c, 'id');
  const input = await parseBody(c, addProductImageSchema);

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)))
    .limit(1);
  if (!product) throw new ApiError(404, 'Product not found');
  if (input.publicId && !isOwnPublicId(input.publicId)) {
    throw new ApiError(400, `publicId must be an image uploaded to the "${ROOT_FOLDER}/" folder`);
  }

  const [image] = await db
    .insert(productImages)
    .values({
      productId,
      storageKey: (input.publicId ?? input.storageKey ?? input.url)!,
      alt: input.alt ?? null,
      colour: input.colour ?? null,
      position:
        input.position ??
        sql`(select coalesce(max(${productImages.position}) + 1, 0) from ${productImages} where ${productImages.productId} = ${productId})`,
    })
    .returning();

  return c.json({ data: { ...image, url: imageUrl(image.storageKey) } }, 201);
});

/**
 * DELETE /admin/images/:imageId
 */
app.delete('/images/:imageId', async (c) => {
  const imageId = idParam(c, 'imageId');
  const [deleted] = await db.delete(productImages).where(eq(productImages.id, imageId)).returning();
  if (!deleted) throw new ApiError(404, 'Image not found');

  // Remove the file from Cloudinary too, unless another product still uses it.
  let storage: string = 'kept';
  if (cloudinaryEnabled && isPublicId(deleted.storageKey) && isOwnPublicId(deleted.storageKey)) {
    const [stillUsed] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.storageKey, deleted.storageKey))
      .limit(1);
    if (!stillUsed) {
      storage = await destroy(deleted.storageKey).catch((err) => {
        console.error(`Cloudinary delete failed for ${deleted.storageKey}:`, err);
        return 'delete_failed';
      });
    }
  }
  return c.json({ message: 'Image deleted', data: { ...deleted, url: imageUrl(deleted.storageKey), storage } });
});

/* ========================================
   VARIANTS
   ======================================== */

/**
 * POST /admin/products/:productId/variants
 * Creates the variant and its inventory row (optionally with starting stock).
 */
app.post('/products/:productId/variants', async (c) => {
  const productId = idParam(c, 'productId');
  const { initialQuantity = 0, ...input } = await parseBody(c, createVariantSchema);
  const admin = getAuth(c).user;

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)))
    .limit(1);
  if (!product) throw new ApiError(404, 'Product not found');

  const variant = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(productVariants)
      .values({ productId, ...input })
      .returning();
    await tx.insert(inventory).values({ variantId: created.id, quantity: initialQuantity });
    if (initialQuantity > 0) {
      await tx.insert(inventoryMovements).values({
        variantId: created.id,
        delta: initialQuantity,
        reason: 'restock',
        referenceId: admin.id,
        note: 'initial stock',
      });
    }
    return created;
  });

  return c.json({ data: { ...variant, inventory: { quantity: initialQuantity } } }, 201);
});

/**
 * PATCH /admin/variants/:variantId
 */
app.patch('/variants/:variantId', async (c) => {
  const variantId = idParam(c, 'variantId');
  const patch = definedOnly(await parseBody(c, updateVariantSchema));
  assertNonEmpty(patch);

  const [updated] = await db
    .update(productVariants)
    .set(patch)
    .where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)))
    .returning();
  if (!updated) throw new ApiError(404, 'Variant not found');

  return c.json({ data: updated });
});

/**
 * DELETE /admin/variants/:variantId
 * Soft delete and deactivate; order history keeps referencing it.
 */
app.delete('/variants/:variantId', async (c) => {
  const variantId = idParam(c, 'variantId');
  const [deleted] = await db
    .update(productVariants)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(productVariants.id, variantId), isNull(productVariants.deletedAt)))
    .returning();
  if (!deleted) throw new ApiError(404, 'Variant not found');
  return c.json({ message: 'Variant deleted', data: deleted });
});

/* ========================================
   INVENTORY
   ======================================== */

/**
 * GET /admin/inventory/low-stock
 */
app.get('/inventory/low-stock', async (c) => {
  const data = await db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      size: productVariants.size,
      colour: productVariants.colour,
      productId: products.id,
      productName: products.name,
      quantity: inventory.quantity,
      lowStockThreshold: inventory.lowStockThreshold,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(inventory.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        sql`${inventory.quantity} <= ${inventory.lowStockThreshold}`,
        isNull(productVariants.deletedAt),
        isNull(products.deletedAt),
      ),
    )
    .orderBy(asc(inventory.quantity));

  return c.json({ data });
});

/**
 * PATCH /admin/inventory/:variantId
 * Body: { quantity?, reason?, note?, lowStockThreshold?, allowBackorder? }
 * `quantity` is the new absolute on-hand count; the difference is logged.
 */
app.patch('/inventory/:variantId', async (c) => {
  const variantId = idParam(c, 'variantId');
  const { quantity, reason, note, lowStockThreshold, allowBackorder } = await parseBody(
    c,
    updateInventorySchema,
  );
  const admin = getAuth(c).user;

  const data = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(inventory)
      .where(eq(inventory.variantId, variantId))
      .limit(1)
      .for('update');
    if (!current) throw new ApiError(404, 'Inventory not found for this variant');

    const [updated] = await tx
      .update(inventory)
      .set(definedOnly({ quantity, lowStockThreshold, allowBackorder }))
      .where(eq(inventory.variantId, variantId))
      .returning();

    const delta = quantity === undefined ? 0 : quantity - current.quantity;
    if (delta !== 0) {
      await tx.insert(inventoryMovements).values({
        variantId,
        delta,
        reason,
        referenceId: admin.id,
        note: note ?? null,
      });
    }
    return updated;
  });

  return c.json({ data });
});

/**
 * GET /admin/inventory/:variantId/movements
 * Newest first, last 200.
 */
app.get('/inventory/:variantId/movements', async (c) => {
  const variantId = idParam(c, 'variantId');
  const data = await db
    .select()
    .from(inventoryMovements)
    .where(eq(inventoryMovements.variantId, variantId))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(200);
  return c.json({ data });
});

/* ========================================
   CATEGORIES
   ======================================== */

/**
 * POST /admin/categories
 */
app.post('/categories', async (c) => {
  const input = await parseBody(c, createCategorySchema);
  const [category] = await db.insert(categories).values(input).returning();
  return c.json({ data: category }, 201);
});

/**
 * GET /admin/categories
 */
app.get('/categories', async (c) => {
  const data = await db
    .select({
      category: categories,
      productCount: sql<number>`count(${productCategories.productId})`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(productCategories, eq(productCategories.categoryId, categories.id))
    .where(isNull(categories.deletedAt))
    .groupBy(categories.id)
    .orderBy(asc(categories.position), asc(categories.name));
  return c.json({ data: data.map((r) => ({ ...r.category, productCount: r.productCount })) });
});

/**
 * PATCH /admin/categories/:id
 */
app.patch('/categories/:id', async (c) => {
  const id = idParam(c, 'id');
  const patch = definedOnly(await parseBody(c, updateCategorySchema));
  assertNonEmpty(patch);
  if (patch.parentId === id) throw new ApiError(400, 'A category cannot be its own parent');

  const [updated] = await db
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .returning();
  if (!updated) throw new ApiError(404, 'Category not found');
  return c.json({ data: updated });
});

/**
 * DELETE /admin/categories/:id
 * Soft delete. Products stay, but drop out of this category's listing.
 */
app.delete('/categories/:id', async (c) => {
  const id = idParam(c, 'id');
  const [deleted] = await db
    .update(categories)
    .set({ deletedAt: new Date() })
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .returning();
  if (!deleted) throw new ApiError(404, 'Category not found');
  return c.json({ message: 'Category deleted', data: deleted });
});

/* ========================================
   ORDERS
   ======================================== */

/**
 * GET /admin/orders?status=paid&page=1&limit=20
 */
app.get('/orders', async (c) => {
  const { status, page, limit } = parseQuery(c, adminOrderListSchema);
  const where = status ? eq(orders.status, status) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(where),
  ]);

  return c.json({ data: rows, pagination: { page, limit, total } });
});

/**
 * GET /admin/orders/:id
 */
app.get('/orders/:id', async (c) => {
  const order = await getOrderWithItems(idParam(c, 'id'));
  if (!order) throw new ApiError(404, 'Order not found');
  return c.json({ data: order });
});

/**
 * PATCH /admin/orders/:id/status
 * Body: { status, trackingNumber?, adminNotes? }
 * pending→paid decrements stock; cancelling releases holds or restocks.
 */
app.patch('/orders/:id/status', async (c) => {
  const id = idParam(c, 'id');
  const { status, trackingNumber, adminNotes } = await parseBody(c, updateOrderStatusSchema);
  const admin = getAuth(c).user;
  const data = await transitionOrder(id, status, { trackingNumber, adminNotes, actorId: admin.id });
  return c.json({ data });
});

/* ========================================
   CUSTOMERS
   ======================================== */

const customerStats = {
  orderCount: sql<number>`count(${orders.id})`.mapWith(Number),
  totalSpentKobo: sql<number>`coalesce(sum(${orders.totalKobo}) filter (where ${inArray(
    orders.status,
    [...REVENUE_STATUSES],
  )}), 0)`.mapWith(Number),
  lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
};

const customerFields = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  phone: users.phone,
  role: users.role,
  emailVerified: users.emailVerified,
  createdAt: users.createdAt,
};

/**
 * GET /admin/customers?search=ada&page=1&limit=20
 */
app.get('/customers', async (c) => {
  const { page, limit, search } = parseQuery(
    c,
    paginationSchema.extend({ search: z.string().trim().min(1).optional() }),
  );
  const pattern = search ? `%${search.replace(/[%_\\]/g, '\\$&')}%` : undefined;
  const where = and(
    eq(users.role, 'customer'),
    pattern
      ? or(
          ilike(users.email, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
          ilike(users.phone, pattern),
        )
      : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ...customerFields, ...customerStats })
      .from(users)
      .leftJoin(orders, eq(orders.userId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(users).where(where),
  ]);

  return c.json({ data: rows, pagination: { page, limit, total } });
});

/**
 * GET /admin/customers/:id
 * Customer profile with their orders.
 */
app.get('/customers/:id', async (c) => {
  const id = idParam(c, 'id');
  const [customer] = await db
    .select({ ...customerFields, ...customerStats })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.id, id))
    .groupBy(users.id)
    .limit(1);
  if (!customer) throw new ApiError(404, 'Customer not found');

  const customerOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, id))
    .orderBy(desc(orders.createdAt));

  return c.json({ data: { ...customer, orders: customerOrders } });
});

/* ========================================
   DELIVERY ZONES
   ======================================== */

/**
 * GET /admin/delivery-zones
 */
app.get('/delivery-zones', async (c) => {
  const zones = await db.select().from(deliveryZones).orderBy(asc(deliveryZones.feeKobo), asc(deliveryZones.name));
  return c.json({ data: zones.map(withStateCount) });
});

/**
 * POST /admin/delivery-zones
 * Body: { name, states: [...], feeKobo, estimatedDaysMin?, estimatedDaysMax?, active? }
 */
app.post('/delivery-zones', async (c) => {
  const input = await parseBody(c, createDeliveryZoneSchema);
  const zone = await db.transaction(async (tx) => {
    if (input.active) await assertStatesFree(input.states, undefined, tx);
    const [created] = await tx.insert(deliveryZones).values(input).returning();
    return created;
  });
  return c.json({ data: withStateCount(zone) }, 201);
});

/**
 * PATCH /admin/delivery-zones/:id
 * e.g. { feeKobo: 350000 } to change a fee, or { states: [...] } to change coverage.
 */
app.patch('/delivery-zones/:id', async (c) => {
  const id = idParam(c, 'id');
  const patch = definedOnly(await parseBody(c, updateDeliveryZoneSchema));
  assertNonEmpty(patch);

  const zone = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(deliveryZones).where(eq(deliveryZones.id, id)).for('update');
    if (!current) throw new ApiError(404, 'Delivery zone not found');
    const willBeActive = patch.active ?? current.active;
    if (willBeActive) await assertStatesFree(patch.states ?? current.states, id, tx);
    const [updated] = await tx.update(deliveryZones).set(patch).where(eq(deliveryZones.id, id)).returning();
    return updated;
  });
  return c.json({ data: withStateCount(zone) });
});

/**
 * DELETE /admin/delivery-zones/:id
 * Past orders keep the fee they were charged.
 */
app.delete('/delivery-zones/:id', async (c) => {
  const id = idParam(c, 'id');
  const [deleted] = await db.delete(deliveryZones).where(eq(deliveryZones.id, id)).returning();
  if (!deleted) throw new ApiError(404, 'Delivery zone not found');
  return c.json({ message: 'Delivery zone deleted', data: deleted });
});

/* ========================================
   DASHBOARD / REPORTING
   ======================================== */

/**
 * GET /admin/stats
 */
app.get('/stats', async (c) => {
  const revenue = sql.join(
    REVENUE_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  const result = await db.execute<Record<string, number>>(sql`
    SELECT
      (SELECT count(*) FROM products WHERE deleted_at IS NULL)::int AS total_products,
      (SELECT count(*) FROM product_variants WHERE deleted_at IS NULL)::int AS total_variants,
      (SELECT coalesce(sum(i.quantity), 0) FROM inventory i
         JOIN product_variants pv ON pv.id = i.variant_id
        WHERE pv.deleted_at IS NULL)::int AS total_stock,
      (SELECT count(*) FROM inventory i
         JOIN product_variants pv ON pv.id = i.variant_id
        WHERE pv.deleted_at IS NULL AND i.quantity <= i.low_stock_threshold)::int AS low_stock_count,
      (SELECT count(*) FROM orders)::int AS total_orders,
      (SELECT count(*) FROM orders WHERE status = 'pending')::int AS pending_orders,
      (SELECT count(*) FROM orders WHERE status IN ('paid', 'processing'))::int AS orders_to_fulfil,
      (SELECT coalesce(sum(total_kobo), 0) FROM orders WHERE status IN (${revenue}))::bigint AS revenue_kobo,
      (SELECT count(*) FROM users WHERE role = 'customer')::int AS total_customers
  `);

  const row = result.rows[0];
  return c.json({
    data: {
      totalProducts: row.total_products,
      totalVariants: row.total_variants,
      totalStock: row.total_stock,
      lowStockCount: row.low_stock_count,
      totalOrders: row.total_orders,
      pendingOrders: row.pending_orders,
      ordersToFulfil: row.orders_to_fulfil,
      revenueKobo: Number(row.revenue_kobo),
      totalCustomers: row.total_customers,
    },
  });
});

export default app;
