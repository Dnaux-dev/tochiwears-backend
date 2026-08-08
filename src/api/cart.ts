/**
 * Tochiwears — Cart API
 * Add/remove items, view cart
 */

import { Hono } from 'hono';
import { db } from '@/db';
import {
  carts,
  cartItems,
  productVariants,
  inventory,
} from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, getAuth } from '@/lib/middleware';
import { addToCartSchema, updateCartItemSchema } from '@/lib/validation';

const app = new Hono();

/**
 * Helper: Get or create cart for user
 */
async function getOrCreateCart(userId: string) {
  let cart = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (!cart.length) {
    const newCart = await db
      .insert(carts)
      .values({ userId })
      .returning();
    return newCart[0];
  }

  return cart[0];
}

/**
 * Helper: Recalculate cart totals
 */
async function recalculateCart(cartId: string) {
  const items = await db
    .select({
      quantity: cartItems.quantity,
      priceKobo: productVariants.priceKobo,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId));

  const totalKobo = items.reduce(
    (sum, item) => sum + item.quantity * item.priceKobo,
    0
  );

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  await db
    .update(carts)
    .set({ totalKobo, itemCount })
    .where(eq(carts.id, cartId));

  return { totalKobo, itemCount };
}

/* ========================================
   GET CART
   ======================================== */

/**
 * GET /cart
 * Get current user's cart
 */
app.get('/', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const cart = await getOrCreateCart(auth.user.id);

    const items = await db
      .select({
        id: cartItems.id,
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        priceKoboAtAdd: cartItems.priceKoboAtAdd,
        sku: productVariants.sku,
        productName: productVariants.id, // We'll fetch product name separately if needed
        currentPriceKobo: productVariants.priceKobo,
        size: productVariants.size,
        colour: productVariants.colour,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .where(eq(cartItems.cartId, cart.id));

    return c.json({
      data: {
        cartId: cart.id,
        totalKobo: cart.totalKobo,
        itemCount: cart.itemCount,
        items,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   ADD TO CART
   ======================================== */

/**
 * POST /cart
 * Add item to cart
 */
app.post('/', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json();

    // Validate
    const validation = addToCartSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { variantId, quantity } = validation.data;

    // Check variant exists and get price
    const variant = await db
      .select({ priceKobo: productVariants.priceKobo })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);

    if (!variant.length) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    // Check stock available (don't block the add, just warn)
    const inv = await db
      .select({ quantity: inventory.quantity })
      .from(inventory)
      .where(eq(inventory.variantId, variantId))
      .limit(1);

    const availableQty = inv.length ? inv[0].quantity : 0;
    if (quantity > availableQty) {
      return c.json(
        {
          error: 'Not enough stock',
          available: availableQty,
          requested: quantity,
        },
        400
      );
    }

    // Get or create cart
    const cart = await getOrCreateCart(auth.user.id);

    // Check if item already in cart
    const existing = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.variantId, variantId)
        )
      )
      .limit(1);

    if (existing.length) {
      // Update quantity
      const newQty = existing[0].quantity + quantity;
      if (newQty > availableQty) {
        return c.json(
          {
            error: 'Not enough stock for this quantity',
            available: availableQty,
            requested: newQty,
          },
          400
        );
      }

      await db
        .update(cartItems)
        .set({ quantity: newQty })
        .where(eq(cartItems.id, existing[0].id));
    } else {
      // Add new item
      await db.insert(cartItems).values({
        cartId: cart.id,
        variantId,
        quantity,
        priceKoboAtAdd: variant[0].priceKobo,
      });
    }

    // Recalculate totals
    await recalculateCart(cart.id);

    return c.json({ message: 'Added to cart' }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   UPDATE CART ITEM
   ======================================== */

/**
 * PATCH /cart/:itemId
 * Update quantity of item in cart
 */
app.patch('/:itemId', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const itemId = c.req.param('itemId');

  try {
    const body = await c.req.json();

    const validation = updateCartItemSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: 'Validation error',
          details: validation.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { quantity } = validation.data;

    // Get item & verify it belongs to user
    const item = await db
      .select({
        id: cartItems.id,
        cartId: cartItems.cartId,
        variantId: cartItems.variantId,
      })
      .from(cartItems)
      .innerJoin(carts, eq(cartItems.cartId, carts.id))
      .where(
        and(
          eq(cartItems.id as any, itemId),
          eq(carts.userId, auth.user.id)
        )
      )
      .limit(1);

    if (!item.length) {
      return c.json({ error: 'Cart item not found' }, 404);
    }

    if (quantity === 0) {
      // Delete item
      await db.delete(cartItems).where(eq(cartItems.id as any, itemId));
    } else {
      // Check stock
      const inv = await db
        .select({ quantity: inventory.quantity })
        .from(inventory)
        .where(eq(inventory.variantId, item[0].variantId))
        .limit(1);

      const availableQty = inv.length ? inv[0].quantity : 0;
      if (quantity > availableQty) {
        return c.json(
          {
            error: 'Not enough stock',
            available: availableQty,
            requested: quantity,
          },
          400
        );
      }

      // Update quantity
      await db
        .update(cartItems)
        .set({ quantity })
        .where(eq(cartItems.id as any, itemId));
    }

    // Recalculate totals
    await recalculateCart(item[0].cartId);

    return c.json({ message: 'Cart updated' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   REMOVE FROM CART
   ======================================== */

/**
 * DELETE /cart/:itemId
 * Remove item from cart
 */
app.delete('/:itemId', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const itemId = c.req.param('itemId');

  try {
    // Get item & verify ownership
    const item = await db
      .select({ cartId: cartItems.cartId })
      .from(cartItems)
      .innerJoin(carts, eq(cartItems.cartId, carts.id))
      .where(
        and(
          eq(cartItems.id as any, itemId),
          eq(carts.userId, auth.user.id)
        )
      )
      .limit(1);

    if (!item.length) {
      return c.json({ error: 'Cart item not found' }, 404);
    }

    // Delete
    await db.delete(cartItems).where(eq(cartItems.id as any, itemId));

    // Recalculate totals
    await recalculateCart(item[0].cartId);

    return c.json({ message: 'Removed from cart' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/* ========================================
   CLEAR CART
   ======================================== */

/**
 * DELETE /cart
 * Clear entire cart
 */
app.delete('/', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const cart = await getOrCreateCart(auth.user.id);
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db
      .update(carts)
      .set({ totalKobo: 0, itemCount: 0 })
      .where(eq(carts.id, cart.id));

    return c.json({ message: 'Cart cleared' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;