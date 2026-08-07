/**
 * Tochiwears — Categories schema
 * Product collections and grouping
 */

import { relations } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { productCategories } from './products';

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

export const categories = pgTable(
  'categories',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Self-referencing for sub-collections, e.g. Men > Shirts. */
    parentId: uuid('parent_id'),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('categories_slug_idx').on(t.slug)],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_parent',
  }),
  children: many(categories, { relationName: 'category_parent' }),
  products: many(productCategories),
}));

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;