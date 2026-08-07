/**
 * Tochiwears — Inventory & Stock Management schema
 * On-hand stock, movements audit log, and checkout reservations
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { productVariants } from './products';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => require('uuidv7').uuidv7());

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

/**
 * Every change to on-hand stock is written to `inventoryMovements` with one
 * of these reasons. The `quantity` on `inventory` is a cached sum of them.
 */
export const stockMovementReason = pgEnum('stock_movement_reason', [
  'restock', // new delivery from supplier
  'sale', // order paid, stock leaves
  'return', // customer returned, stock comes back
  'adjustment', // manual correction / stocktake
  'damage', // written off
]);

/* ------------------------------------------------------------------ */
/* Inventory — on-hand stock per variant                               */
/* ------------------------------------------------------------------ */

/**
 * One row per variant. `quantity` is what is physically on the shelf —
 * it is NOT reduced when a customer starts checkout, only when payment
 * confirms. Anything held mid-checkout lives in `stockReservations`.
 *
 *     available = inventory.quantity - SUM(active reservations)
 */
export const inventory = pgTable(
  'inventory',
  {
    variantId: uuid('variant_id')
      .primaryKey()
      .references(() => productVariants.id, { onDelete: 'cascade' }),

    quantity: integer('quantity').notNull().default(0),

    /** Fire an alert to admin at or below this figure. */
    lowStockThreshold: integer('low_stock_threshold').notNull().default(3),

    /**
     * Let an item keep selling past zero (pre-orders / made-to-order).
     * Off by default — overselling apparel is a refund nightmare.
     */
    allowBackorder: boolean('allow_backorder').notNull().default(false),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('inventory_low_stock_idx').on(t.quantity)],
);

/* ------------------------------------------------------------------ */
/* Inventory Movements — append-only audit log                         */
/* ------------------------------------------------------------------ */

/**
 * Append-only audit log. Every mutation of `inventory.quantity` writes a row
 * here in the same transaction. When the numbers drift — and they will —
 * this is the only thing that tells you why.
 */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: id(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /** Signed: negative for sales and write-offs, positive for restocks. */
    delta: integer('delta').notNull(),
    reason: stockMovementReason('reason').notNull(),

    /** Order ID, supplier invoice ref, or admin user ID depending on reason. */
    referenceId: text('reference_id'),
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('inv_movements_variant_idx').on(t.variantId, t.createdAt),
    index('inv_movements_reference_idx').on(t.referenceId),
  ],
);

/* ------------------------------------------------------------------ */
/* Stock Reservations — soft holds from checkout                       */
/* ------------------------------------------------------------------ */

/**
 * Soft holds placed at checkout so two customers can't buy the last shirt.
 * A scheduled job deletes rows past `expiresAt`; a paid order converts the
 * reservation into an `inventoryMovements` row and drops it.
 *
 * Give this a ~15 minute TTL — long enough for a bank transfer to land,
 * short enough that abandoned carts don't hold stock hostage.
 */
export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: id(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),

    /** FK to your orders table once that exists. */
    orderId: uuid('order_id').notNull(),

    quantity: integer('quantity').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('reservations_variant_idx').on(t.variantId, t.expiresAt),
    index('reservations_order_idx').on(t.orderId),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const inventoryRelations = relations(inventory, ({ one, many }) => ({
  variant: one(productVariants, {
    fields: [inventory.variantId],
    references: [productVariants.id],
  }),
  movements: many(inventoryMovements),
  reservations: many(stockReservations),
}));

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    inventory: one(inventory, {
      fields: [inventoryMovements.variantId],
      references: [inventory.variantId],
    }),
  }),
);

export const stockReservationsRelations = relations(
  stockReservations,
  ({ one }) => ({
    inventory: one(inventory, {
      fields: [stockReservations.variantId],
      references: [inventory.variantId],
    }),
  }),
);

/* ------------------------------------------------------------------ */
/* Post-migration SQL constraints                                      */
/* ------------------------------------------------------------------ */

export const POST_MIGRATION_SQL = sql`
  -- Stock can never go negative at the database level
  ALTER TABLE inventory
    ADD CONSTRAINT inventory_quantity_non_negative
    CHECK (quantity >= 0);

  ALTER TABLE product_variants
    ADD CONSTRAINT variant_price_non_negative
    CHECK (price_kobo >= 0);

  ALTER TABLE stock_reservations
    ADD CONSTRAINT reservation_quantity_positive
    CHECK (quantity > 0);
`;

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
export type StockReservation = typeof stockReservations.$inferSelect;
export type NewStockReservation = typeof stockReservations.$inferInsert;