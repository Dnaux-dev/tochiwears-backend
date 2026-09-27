

import { relations } from 'drizzle-orm';
import { categories } from './categories';
import { uuidv7 } from 'uuidv7';
import {
    bigint,
    boolean,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const productStatus = pgEnum('product_status', [
    'draft',
    'published',
    'archived',
]);

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export const products = pgTable(
    'products',
    {
        id: id(),
        slug: text('slug').notNull(),
        name: text('name').notNull(),
        description: text('description'),

        status: productStatus('status').notNull().default('draft'),
        /** Surfaces on the homepage rail. */
        featured: boolean('featured').notNull().default(false),
        /**
         * Set when the product first goes live. Drives "New In" ordering —
         * don't use createdAt, since you'll draft products weeks ahead of a drop.
         */
        publishedAt: timestamp('published_at', { withTimezone: true }),

        // --- SEO / sharing ---
        metaTitle: text('meta_title'),
        metaDescription: text('meta_description'),

        ...timestamps,
    },
    (t) => [
        uniqueIndex('products_slug_idx').on(t.slug),
        index('products_status_idx').on(t.status, t.publishedAt),
    ],
);

/* ------------------------------------------------------------------ */
/* Product to Category mapping (many-to-many)                          */
/* ------------------------------------------------------------------ */

export const productCategories = pgTable(
    'product_categories',
    {
        productId: uuid('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'cascade' }),
        categoryId: uuid('category_id').notNull(),
        // Note: categoryId references categories.id but we import categories separately to avoid circular deps
    },
    (t) => [primaryKey({ columns: [t.productId, t.categoryId] })],
);

/* ------------------------------------------------------------------ */
/* Product Images                                                      */
/* ------------------------------------------------------------------ */

export const productImages = pgTable(
    'product_images',
    {
        id: id(),
        productId: uuid('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'cascade' }),
        /** R2 object key, NOT a full URL — sign or CDN-prefix at read time. */
        storageKey: text('storage_key').notNull(),
        alt: text('alt'),
        position: integer('position').notNull().default(0),
        /**
         * Optional: pin an image to a colourway so the gallery swaps when the
         * customer picks "Black". Null = shown for all variants.
         */
        colour: text('colour'),
        createdAt: timestamps.createdAt,
    },
    (t) => [index('product_images_product_idx').on(t.productId, t.position)],
);

/* ------------------------------------------------------------------ */
/* Product Variants — the actual sellable unit                         */
/* ------------------------------------------------------------------ */

export const productVariants = pgTable(
    'product_variants',
    {
        id: id(),
        productId: uuid('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'restrict' }),

        /** Human-facing stock code. Unique across the whole shop. */
        sku: text('sku').notNull(),

        /** Both nullable — a one-size, single-colour item is legitimate. */
        size: text('size'),
        colour: text('colour'),

        /** Selling price, in kobo. Price lives here, never on the product. */
        priceKobo: bigint('price_kobo', { mode: 'number' }).notNull(),
        /** Struck-through "was" price, in kobo. Null when not discounted. */
        compareAtPriceKobo: bigint('compare_at_price_kobo', { mode: 'number' }),

        /** Used for delivery-fee bands. */
        weightGrams: integer('weight_grams'),

        /** Order within the product's variant picker. */
        position: integer('position').notNull().default(0),
        /** Retire a colourway without deleting its order history. */
        active: boolean('active').notNull().default(true),

        ...timestamps,
    },
    (t) => [
        uniqueIndex('variants_sku_idx').on(t.sku),
        uniqueIndex('variants_option_idx').on(t.productId, t.size, t.colour),
        index('variants_product_idx').on(t.productId, t.position),
    ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

// products.ts
export const productsRelations = relations(products, ({ many }) => ({
  productCategories: many(productCategories),
  variants: many(productVariants),
  images: many(productImages),
}));

export const productCategoriesRelations = relations(productCategories, ({ one }) => ({
  product: one(products, {
    fields: [productCategories.productId],
    references: [products.id],
  }),
  category: one(categories, {
    fields: [productCategories.categoryId],
    references: [categories.id],
  }),
}));

export const productVariantsRelations = relations(
    productVariants,
    ({ one, many }) => ({
        product: one(products, {
            fields: [productVariants.productId],
            references: [products.id],
        }),
        // Inventory relation added in inventory.ts to avoid circular imports
    }),
);

export const productImagesRelations = relations(productImages, ({ one }) => ({
    product: one(products, {
        fields: [productImages.productId],
        references: [products.id],
    }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductCategory = typeof productCategories.$inferSelect;