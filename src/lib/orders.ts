/**
 * Tochiwears — Order lifecycle
 *
 * Stock model (see db/schema/inventory.ts):
 *   - Checkout places `stockReservations` holds; on-hand stock is untouched.
 *   - Marking an order paid converts its holds into `sale` movements and
 *     decrements `inventory.quantity`.
 *   - Cancelling releases holds, or restocks if the order was already paid.
 */

import crypto from 'node:crypto';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, type DbExecutor, type Tx } from '@/db';
import {
  coupons,
  cartItems,
  deliveryZones,
  inventory,
  inventoryMovements,
  orderItems,
  orders,
  stockReservations,
  type Order,
  type User,
} from '@/db/schema';
import { ApiError } from '@/lib/http';
import { getAvailability } from '@/lib/catalog';
import { loadCart } from '@/lib/cart';
import type { CreateOrderInput, OrderStatus } from '@/lib/validation';

const RESERVATION_TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES) || 15;

/** ORD-20261126-7K2QXM — 6 random chars from a 32-symbol alphabet (~1e9 per day). */
function generateOrderNumber(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(6);
  const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${date}-${suffix}`;
}

/** Lock inventory rows in a stable order so concurrent checkouts can't deadlock. */
async function lockInventory(tx: Tx, variantIds: string[]) {
  if (!variantIds.length) return [];
  return tx
    .select()
    .from(inventory)
    .where(inArray(inventory.variantId, variantIds))
    .orderBy(asc(inventory.variantId))
    .for('update');
}

async function applyCoupon(tx: Tx, code: string, userId: string, subtotalKobo: number) {
  const [coupon] = await tx
    .select()
    .from(coupons)
    .where(sql`upper(${coupons.code}) = ${code.toUpperCase()}`)
    .limit(1)
    .for('update');

  const now = new Date();
  if (!coupon || !coupon.active || coupon.validFrom > now || (coupon.validUntil && coupon.validUntil <= now)) {
    throw new ApiError(400, 'Coupon code is invalid or has expired');
  }
  if (coupon.minimumOrderKobo && subtotalKobo < coupon.minimumOrderKobo) {
    throw new ApiError(400, 'Order total is below the minimum for this coupon', {
      minimumOrderKobo: coupon.minimumOrderKobo,
    });
  }
  if (coupon.maxUses !== null && coupon.currentUses >= coupon.maxUses) {
    throw new ApiError(400, 'This coupon has reached its usage limit');
  }
  if (coupon.maxUsesPerCustomer !== null) {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.couponCode, coupon.code),
          ne(orders.status, 'cancelled'),
        ),
      );
    if (count >= coupon.maxUsesPerCustomer) {
      throw new ApiError(400, 'You have already used this coupon');
    }
  }

  const discountKobo =
    coupon.type === 'percentage'
      ? Math.round((subtotalKobo * Math.min(Math.max(coupon.value, 0), 100)) / 100)
      : Math.min(coupon.value, subtotalKobo);

  await tx
    .update(coupons)
    .set({ currentUses: sql`${coupons.currentUses} + 1` })
    .where(eq(coupons.id, coupon.id));

  return { code: coupon.code, discountKobo };
}

/** Cheapest active zone covering the state; 0 if no zone is configured. */
export async function getDeliveryFee(state: string, executor: DbExecutor = db) {
  const [zone] = await executor
    .select({ feeKobo: deliveryZones.feeKobo })
    .from(deliveryZones)
    .where(and(eq(deliveryZones.active, true), sql`${state} = any(${deliveryZones.states})`))
    .orderBy(asc(deliveryZones.feeKobo))
    .limit(1);
  return zone?.feeKobo ?? 0;
}

export async function getOrderWithItems(orderId: string, executor: DbExecutor = db) {
  const [order] = await executor.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;
  const items = await executor
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt));
  return { ...order, items };
}

/**
 * Turn the user's cart into a pending order with stock reservations.
 */
export async function placeOrder(user: User, input: CreateOrderInput) {
  return db.transaction(async (tx) => {
    const cart = await loadCart(user.id, tx);
    if (!cart.items.length) throw new ApiError(400, 'Cart is empty');

    const unavailable = cart.items.filter((i) => i.issue === 'unavailable');
    if (unavailable.length) {
      throw new ApiError(409, 'Some items in your cart are no longer available', {
        itemIds: unavailable.map((i) => i.id),
      });
    }

    // Re-check stock while holding row locks: the cart view above was unlocked.
    const variantIds = cart.items.map((i) => i.variantId);
    await lockInventory(tx, variantIds);
    const availability = await getAvailability(variantIds, tx);
    const short = cart.items.filter((i) => {
      const stock = availability.get(i.variantId)!;
      return !stock.allowBackorder && i.quantity > stock.available;
    });
    if (short.length) {
      throw new ApiError(409, 'Not enough stock for some items', {
        items: short.map((i) => ({
          itemId: i.id,
          variantId: i.variantId,
          requested: i.quantity,
          available: availability.get(i.variantId)!.available,
        })),
      });
    }

    const subtotalKobo = cart.subtotalKobo;
    const coupon = input.couponCode
      ? await applyCoupon(tx, input.couponCode, user.id, subtotalKobo)
      : null;
    const discountKobo = coupon?.discountKobo ?? 0;
    const deliveryFeeKobo = await getDeliveryFee(input.deliveryState, tx);

    const [order] = await tx
      .insert(orders)
      .values({
        userId: user.id,
        orderNumber: generateOrderNumber(),
        customerEmail: user.email,
        customerPhone: input.customerPhone ?? user.phone ?? '',
        customerFirstName: input.customerFirstName ?? user.firstName ?? '',
        customerLastName: input.customerLastName ?? user.lastName ?? '',
        deliveryAddress: input.deliveryAddress,
        deliveryCity: input.deliveryCity,
        deliveryState: input.deliveryState,
        deliveryPostalCode: input.deliveryPostalCode ?? null,
        subtotalKobo,
        deliveryFeeKobo,
        discountKobo,
        couponCode: coupon?.code ?? null,
        totalKobo: Math.max(0, subtotalKobo + deliveryFeeKobo - discountKobo),
        status: 'pending',
        customerNotes: input.customerNotes ?? null,
      })
      .returning();

    await tx.insert(orderItems).values(
      cart.items.map((i) => ({
        orderId: order.id,
        variantId: i.variantId,
        sku: i.sku,
        productName: i.productName,
        variantDescription: [i.colour, i.size].filter(Boolean).join(', ') || null,
        quantity: i.quantity,
        priceKoboPerUnit: i.unitPriceKobo,
        totalKobo: i.lineTotalKobo,
      })),
    );

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
    await tx.insert(stockReservations).values(
      cart.items.map((i) => ({
        variantId: i.variantId,
        orderId: order.id,
        quantity: i.quantity,
        expiresAt,
      })),
    );

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.cartId));
    await loadCart(user.id, tx); // refresh cached cart totals to zero

    return (await getOrderWithItems(order.id, tx))!;
  });
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['processing', 'shipped', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

const STOCK_TAKEN: OrderStatus[] = ['paid', 'processing'];

export interface TransitionOptions {
  trackingNumber?: string;
  adminNotes?: string;
  /** Recorded as inventory_movements.note context. */
  actorId?: string;
}

/**
 * Move an order to a new status, applying stock and coupon side effects.
 * Refunds don't restock automatically; log returned goods via inventory.
 */
export async function transitionOrder(orderId: string, next: OrderStatus, opts: TransitionOptions = {}) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for('update');
    if (!order) throw new ApiError(404, 'Order not found');

    const current = order.status as OrderStatus;
    if (!TRANSITIONS[current].includes(next)) {
      throw new ApiError(400, `Cannot change order from ${current} to ${next}`, {
        allowed: TRANSITIONS[current],
      });
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const note = opts.actorId ? `by ${opts.actorId}` : null;
    const patch: Partial<Order> = { status: next };

    if (next === 'paid') {
      const locked = await lockInventory(tx, items.map((i) => i.variantId));
      const byVariant = new Map(locked.map((row) => [row.variantId, row]));

      const short = items.filter((i) => {
        const row = byVariant.get(i.variantId);
        return !row?.allowBackorder && (row?.quantity ?? 0) < i.quantity;
      });
      if (short.length) {
        throw new ApiError(409, 'Not enough stock on hand to fulfil this order', {
          items: short.map((i) => ({
            sku: i.sku,
            required: i.quantity,
            onHand: byVariant.get(i.variantId)?.quantity ?? 0,
          })),
        });
      }

      for (const item of items) {
        const onHand = byVariant.get(item.variantId)?.quantity ?? 0;
        // Backordered items can't push stock below zero; log the shortfall.
        const taken = Math.min(item.quantity, onHand);
        if (taken > 0) {
          await tx
            .update(inventory)
            .set({ quantity: sql`${inventory.quantity} - ${taken}` })
            .where(eq(inventory.variantId, item.variantId));
          await tx.insert(inventoryMovements).values({
            variantId: item.variantId,
            delta: -taken,
            reason: 'sale',
            referenceId: order.id,
            note: taken < item.quantity ? `backorder: ${item.quantity - taken} short` : note,
          });
        }
      }
      await tx.delete(stockReservations).where(eq(stockReservations.orderId, order.id));
      patch.paidAt = new Date();
    }

    if (next === 'cancelled') {
      if (STOCK_TAKEN.includes(current)) {
        const sold = await tx
          .select({ variantId: inventoryMovements.variantId, delta: inventoryMovements.delta })
          .from(inventoryMovements)
          .where(and(eq(inventoryMovements.referenceId, order.id), eq(inventoryMovements.reason, 'sale')));
        for (const movement of sold) {
          await tx
            .update(inventory)
            .set({ quantity: sql`${inventory.quantity} + ${-movement.delta}` })
            .where(eq(inventory.variantId, movement.variantId));
          await tx.insert(inventoryMovements).values({
            variantId: movement.variantId,
            delta: -movement.delta,
            reason: 'return',
            referenceId: order.id,
            note: 'order cancelled',
          });
        }
      }
      await tx.delete(stockReservations).where(eq(stockReservations.orderId, order.id));
      if (order.couponCode) {
        await tx
          .update(coupons)
          .set({ currentUses: sql`greatest(${coupons.currentUses} - 1, 0)` })
          .where(eq(coupons.code, order.couponCode));
      }
    }

    if (next === 'shipped') patch.shippedAt = new Date();
    if (next === 'delivered') patch.deliveredAt = new Date();
    if (opts.trackingNumber !== undefined) patch.trackingNumber = opts.trackingNumber;
    if (opts.adminNotes !== undefined) patch.adminNotes = opts.adminNotes;

    await tx.update(orders).set(patch).where(eq(orders.id, order.id));
    return (await getOrderWithItems(order.id, tx))!;
  });
}
