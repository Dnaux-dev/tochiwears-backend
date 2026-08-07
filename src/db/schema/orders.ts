/**
 * Tochiwears — Cart & Orders schema
 */

import { relations } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';
import { users, productVariants } from './index';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ========================================
   CART
   ======================================== */

/**
 * Shopping cart (server-side session)
 * One per user, holds items awaiting checkout
 */
export const carts = pgTable(
  'carts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Total in kobo, cached from items
     * Recalculated at checkout to catch price changes
     */
    totalKobo: bigint('total_kobo', { mode: 'number' }).notNull().default(0),
    itemCount: integer('item_count').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('carts_user_idx').on(t.userId)],
);

/**
 * Items in a cart
 * Each row = one variant in the cart
 */
export const cartItems = pgTable(
  'cart_items',
  {
    id: id(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    /**
     * Price at time of add (in case product price changes)
     * Recalculated at checkout
     */
    priceKoboAtAdd: bigint('price_kobo_at_add', { mode: 'number' }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('cart_items_cart_idx').on(t.cartId),
    index('cart_items_variant_idx').on(t.variantId),
  ],
);

/* ========================================
   ORDERS
   ======================================== */

export const orderStatus = pgEnum('order_status', [
  'pending', // Created, awaiting payment
  'paid', // Payment confirmed
  'processing', // Being packed
  'shipped', // On the way
  'delivered', // Arrived
  'cancelled', // Customer cancelled
  'refunded', // Refund issued
]);

export const couponType = pgEnum('coupon_type', ['fixed', 'percentage']);

/**
 * Main order record
 */
export const orders = pgTable(
  'orders',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    // Order identification
    orderNumber: text('order_number').notNull().unique(), // e.g., "ORD-20260808-001"

    // Customer info (snapshot at order time)
    customerEmail: text('customer_email').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerFirstName: text('customer_first_name').notNull(),
    customerLastName: text('customer_last_name').notNull(),

    // Delivery address
    deliveryAddress: text('delivery_address').notNull(),
    deliveryCity: text('delivery_city').notNull(),
    deliveryState: text('delivery_state').notNull(), // e.g., "Lagos", "Abuja"
    deliveryPostalCode: text('delivery_postal_code'),

    // Money
    subtotalKobo: bigint('subtotal_kobo', { mode: 'number' }).notNull(), // Items total
    deliveryFeeKobo: bigint('delivery_fee_kobo', { mode: 'number' }).notNull().default(0),
    discountKobo: bigint('discount_kobo', { mode: 'number' }).notNull().default(0), // From coupon
    totalKobo: bigint('total_kobo', { mode: 'number' }).notNull(), // subtotal + delivery - discount

    // Status
    status: orderStatus('status').notNull().default('pending'),

    // OPay integration
    opayOrderId: text('opay_order_id'), // OPay's order ID
    opayReference: text('opay_reference'), // OPay's reference code
    paidAt: timestamp('paid_at', { withTimezone: true }),

    // Logistics
    trackingNumber: text('tracking_number'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),

    // Notes
    customerNotes: text('customer_notes'),
    adminNotes: text('admin_notes'),

    ...timestamps,
  },
  (t) => [
    index('orders_user_idx').on(t.userId),
    index('orders_status_idx').on(t.status),
    index('orders_order_number_idx').on(t.orderNumber),
    index('orders_opay_order_id_idx').on(t.opayOrderId),
  ],
);

/**
 * Items in an order
 * Snapshot of cart at time of order
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    // Snapshot of variant info
    sku: text('sku').notNull(),
    productName: text('product_name').notNull(),
    variantDescription: text('variant_description'), // e.g., "Black, Size M"

    quantity: integer('quantity').notNull(),
    priceKoboPerUnit: bigint('price_kobo_per_unit', { mode: 'number' }).notNull(),
    /**
     * Total for this line (quantity * pricePerUnit)
     * Useful for quick sums without recalculating
     */
    totalKobo: bigint('total_kobo', { mode: 'number' }).notNull(),

    ...timestamps,
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_variant_idx').on(t.variantId),
  ],
);

/* ========================================
   DELIVERY ZONES (for shipping fees)
   ======================================== */

/**
 * Define which states get which delivery fees
 */
export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: id(),
    name: text('name').notNull(), // e.g., "Lagos", "Rest of Nigeria"
    states: text('states').array().notNull(), // e.g., ["Lagos"]
    /** Flat fee in kobo, or 0 for free */
    feeKobo: bigint('fee_kobo', { mode: 'number' }).notNull().default(0),
    estimatedDaysMin: integer('estimated_days_min'),
    estimatedDaysMax: integer('estimated_days_max'),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
);

/* ========================================
   COUPONS / DISCOUNTS
   ======================================== */

export const coupons = pgTable(
  'coupons',
  {
    id: id(),
    code: text('code').notNull().unique(), // e.g., "WELCOME20"
    description: text('description'),

    // Discount type
    type: couponType('type').notNull(),
    value: bigint('value', { mode: 'number' }).notNull(), // In kobo if fixed, % if percentage

    // Limits
    minimumOrderKobo: bigint('minimum_order_kobo', { mode: 'number' }).default(0),
    maxUses: integer('max_uses'), // Null = unlimited
    currentUses: integer('current_uses').notNull().default(0),
    maxUsesPerCustomer: integer('max_uses_per_customer').default(1),

    // Validity
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    active: boolean('active').notNull().default(true),

    ...timestamps,
  },
  (t) => [index('coupons_code_idx').on(t.code)],
);

/* ========================================
   Relations
   ======================================== */

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

/* ========================================
   Types
   ======================================== */

export type Cart = typeof carts.$inferSelect;
export type NewCart = typeof carts.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type DeliveryZone = typeof deliveryZones.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;