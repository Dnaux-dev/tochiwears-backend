/**
 * Tochiwears — Orders API (customer)
 * Mounted behind requireAuth in src/index.ts.
 */

import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { getAuth, type AppEnv } from '@/lib/middleware';
import { createOrderSchema, paginationSchema, uuidParam } from '@/lib/validation';
import { ApiError, parseBody, parseQuery } from '@/lib/http';
import { getOrderWithItems, placeOrder, transitionOrder } from '@/lib/orders';

const app = new Hono<AppEnv>();

/** Fields customers may see (adminNotes stays internal). */
function forCustomer<T extends { adminNotes: string | null }>({ adminNotes, ...order }: T) {
  return order;
}

async function getOwnOrder(userId: string, rawId: string) {
  const order = await getOrderWithItems(uuidParam.parse(rawId));
  if (!order || order.userId !== userId) throw new ApiError(404, 'Order not found');
  return order;
}

/**
 * GET /orders?page=1&limit=20
 */
app.get('/', async (c) => {
  const { user } = getAuth(c);
  const { page, limit } = parseQuery(c, paginationSchema);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(eq(orders.userId, user.id)),
  ]);

  return c.json({ data: rows.map(forCustomer), pagination: { page, limit, total } });
});

/**
 * GET /orders/:orderId
 */
app.get('/:orderId', async (c) => {
  const { user } = getAuth(c);
  return c.json({ data: forCustomer(await getOwnOrder(user.id, c.req.param('orderId'))) });
});

/**
 * POST /orders
 * Creates a pending order from the server-side cart and reserves its stock.
 */
app.post('/', async (c) => {
  const { user } = getAuth(c);
  const input = await parseBody(c, createOrderSchema);
  const order = await placeOrder(user, input);
  return c.json({ data: forCustomer(order) }, 201);
});

/**
 * POST /orders/:orderId/cancel
 * Customers may cancel only while the order is still pending payment.
 */
app.post('/:orderId/cancel', async (c) => {
  const { user } = getAuth(c);
  const order = await getOwnOrder(user.id, c.req.param('orderId'));
  if (order.status !== 'pending') {
    throw new ApiError(400, 'Only orders awaiting payment can be cancelled. Contact support.');
  }
  return c.json({ data: forCustomer(await transitionOrder(order.id, 'cancelled')) });
});

export default app;
