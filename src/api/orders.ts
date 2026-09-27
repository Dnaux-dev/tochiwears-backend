/**
 * Tochiwears — Orders API
 * Place orders, view order history & order details
 */

import { Hono } from 'hono';
import { db } from '@/db';
import {
  orders,
  orderItems,
  carts,
  cartItems,
  productVariants,
  coupons,
} from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, getAuth } from '@/lib/middleware';
import { createOrderSchema } from '@/lib/validation';

const app = new Hono();

/**
 * GET /orders
 * List all orders for the authenticated user
 */
app.get('/', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, auth.user.id))
      .orderBy(desc(orders.createdAt));

    return c.json(userOrders);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /orders/:orderId
 * Get details for a specific order
 */
app.get('/:orderId', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const orderId = c.req.param('orderId');

  try {
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id as any, orderId),
          eq(orders.userId, auth.user.id)
        )
      )
      .limit(1);

    if (!order) {
      return c.json({ error: 'Order not found' }, 404);
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    return c.json({
      ...order,
      items,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

/**
 * POST /orders
 * Create a new order from current cart
 */
app.post('/', requireAuth, async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json();
    const validatedData = createOrderSchema.parse(body);

    // Get user's cart
    const [cart] = await db
      .select()
      .from(carts)
      .where(eq(carts.userId, auth.user.id))
      .limit(1);

    if (!cart) {
      return c.json({ error: 'Cart is empty' }, 400);
    }

    // Get cart items with product variant details
    const items = await db
      .select({
        id: cartItems.id,
        variantId: cartItems.variantId,
        quantity: cartItems.quantity,
        priceKobo: productVariants.priceKobo,
        sku: productVariants.sku,
        size: productVariants.size,
        colour: productVariants.colour,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .where(eq(cartItems.cartId, cart.id));

    if (items.length === 0) {
      return c.json({ error: 'Cart is empty' }, 400);
    }

    // Calculate subtotal
    const subtotalKobo = items.reduce(
      (sum, item) => sum + item.quantity * item.priceKobo,
      0
    );

    // Check discount from coupon if provided
    let discountKobo = 0;
    if (validatedData.couponCode) {
      const [coupon] = await db
        .select()
        .from(coupons)
        .where(
          and(
            eq(coupons.code, validatedData.couponCode),
            eq(coupons.active, true)
          )
        )
        .limit(1);

      if (coupon) {
        if (coupon.type === 'fixed_amount') {
          discountKobo = coupon.value;
        } else if (coupon.type === 'percentage') {
          discountKobo = Math.round((subtotalKobo * coupon.value) / 100);
        }
      }
    }

    // Delivery fee
    const deliveryFeeKobo = 0;
    const totalKobo = Math.max(0, subtotalKobo + deliveryFeeKobo - discountKobo);

    // Generate unique order number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

    // Create order
    const [newOrder] = await db
      .insert(orders)
      .values({
        userId: auth.user.id,
        orderNumber,
        customerEmail: auth.user.email,
        customerPhone: auth.user.phone || '',
        customerFirstName: auth.user.firstName || '',
        customerLastName: auth.user.lastName || '',
        deliveryAddress: validatedData.deliveryAddress,
        deliveryCity: validatedData.deliveryCity,
        deliveryState: validatedData.deliveryState,
        deliveryPostalCode: validatedData.deliveryPostalCode,
        subtotalKobo,
        deliveryFeeKobo,
        discountKobo,
        totalKobo,
        status: 'pending',
        customerNotes: validatedData.customerNotes,
      })
      .returning();

    // Create order items
    const orderItemValues = items.map((item) => {
      const variantDesc = [item.colour, item.size].filter(Boolean).join(', ');
      return {
        orderId: newOrder.id,
        variantId: item.variantId,
        sku: item.sku,
        productName: 'Product',
        variantDescription: variantDesc || null,
        quantity: item.quantity,
        priceKoboPerUnit: item.priceKobo,
        totalKobo: item.quantity * item.priceKobo,
      };
    });

    await db.insert(orderItems).values(orderItemValues);

    // Clear cart items
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db
      .update(carts)
      .set({ totalKobo: 0, itemCount: 0 })
      .where(eq(carts.id, cart.id));

    return c.json(
      {
        message: 'Order created successfully',
        order: newOrder,
      },
      201
    );
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

export default app;
