/**
 * Tochiwears — Cart API
 * Mounted behind requireAuth in src/index.ts.
 * Every endpoint responds with the full, freshly priced cart.
 */

import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { db, type DbExecutor } from '@/db';
import { carts, cartItems, products, productVariants } from '@/db/schema';
import { getAuth, type AppEnv } from '@/lib/middleware';
import { addToCartSchema, updateCartItemSchema, uuidParam } from '@/lib/validation';
import { ApiError, parseBody } from '@/lib/http';
import { getAvailability } from '@/lib/catalog';
import { getOrCreateCart, loadCart } from '@/lib/cart';

const app = new Hono<AppEnv>();

/** Lock the user's cart row so concurrent edits to it run one at a time. */
async function lockCart(userId: string, executor: DbExecutor) {
  const cart = await getOrCreateCart(userId, executor);
  await executor.select({ id: carts.id }).from(carts).where(eq(carts.id, cart.id)).for('update');
  return cart;
}

async function assertStock(variantId: string, quantity: number, executor: DbExecutor) {
  const stock = (await getAvailability([variantId], executor)).get(variantId)!;
  if (!stock.allowBackorder && quantity > stock.available) {
    throw new ApiError(400, 'Not enough stock', { available: stock.available, requested: quantity });
  }
}

/**
 * GET /cart
 */
app.get('/', async (c) => {
  const { user } = getAuth(c);
  return c.json({ data: await loadCart(user.id) });
});

/**
 * POST /cart
 * Body: { variantId, quantity? = 1 }. Adds to any quantity already in the cart.
 */
app.post('/', async (c) => {
  const { user } = getAuth(c);
  const { variantId, quantity } = await parseBody(c, addToCartSchema);

  const data = await db.transaction(async (tx) => {
    const [variant] = await tx
      .select({ priceKobo: productVariants.priceKobo })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.active, true),
          isNull(productVariants.deletedAt),
          eq(products.status, 'published'),
          isNull(products.deletedAt),
        ),
      )
      .limit(1);
    if (!variant) throw new ApiError(404, 'Product variant not found or not available');

    const cart = await lockCart(user.id, tx);
    const [existing] = await tx
      .select({ id: cartItems.id, quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)))
      .limit(1);

    const newQty = (existing?.quantity ?? 0) + quantity;
    if (newQty > 100) throw new ApiError(400, 'Maximum 100 per item');
    await assertStock(variantId, newQty, tx);

    if (existing) {
      await tx
        .update(cartItems)
        .set({ quantity: newQty, priceKoboAtAdd: variant.priceKobo })
        .where(eq(cartItems.id, existing.id));
    } else {
      await tx
        .insert(cartItems)
        .values({ cartId: cart.id, variantId, quantity, priceKoboAtAdd: variant.priceKobo });
    }

    return loadCart(user.id, tx);
  });

  return c.json({ data }, 201);
});

/**
 * PATCH /cart/:itemId
 * Body: { quantity }. A quantity of 0 removes the line.
 */
app.patch('/:itemId', async (c) => {
  const { user } = getAuth(c);
  const itemId = uuidParam.parse(c.req.param('itemId'));
  const { quantity } = await parseBody(c, updateCartItemSchema);

  const data = await db.transaction(async (tx) => {
    const cart = await lockCart(user.id, tx);
    const [item] = await tx
      .select({ id: cartItems.id, variantId: cartItems.variantId })
      .from(cartItems)
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)))
      .limit(1);
    if (!item) throw new ApiError(404, 'Cart item not found');

    if (quantity === 0) {
      await tx.delete(cartItems).where(eq(cartItems.id, item.id));
    } else {
      await assertStock(item.variantId, quantity, tx);
      await tx.update(cartItems).set({ quantity }).where(eq(cartItems.id, item.id));
    }
    return loadCart(user.id, tx);
  });

  return c.json({ data });
});

/**
 * DELETE /cart/:itemId
 */
app.delete('/:itemId', async (c) => {
  const { user } = getAuth(c);
  const itemId = uuidParam.parse(c.req.param('itemId'));

  const cart = await getOrCreateCart(user.id);
  const deleted = await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)))
    .returning({ id: cartItems.id });
  if (!deleted.length) throw new ApiError(404, 'Cart item not found');

  return c.json({ data: await loadCart(user.id) });
});

/**
 * DELETE /cart
 */
app.delete('/', async (c) => {
  const { user } = getAuth(c);
  const cart = await getOrCreateCart(user.id);
  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  return c.json({ data: await loadCart(user.id) });
});

export default app;
