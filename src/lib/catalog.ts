/**
 * Tochiwears — Storefront catalogue helpers
 * Shared by the public product API, the cart and checkout.
 */

import { and, asc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { db, type DbExecutor } from '@/db';
import {
  categories,
  inventory,
  productCategories,
  productImages,
  products,
  productVariants,
  stockReservations,
} from '@/db/schema';
import { cloudinaryEnabled, deliveryUrl, isPublicId } from '@/lib/cloudinary';

const IMAGE_BASE_URL = (process.env.IMAGE_BASE_URL || '').replace(/\/+$/, '');

/**
 * product_images.storage_key is a Cloudinary public_id (served optimised),
 * a key under IMAGE_BASE_URL, or an absolute URL (passed through).
 */
export function imageUrl(storageKey: string): string {
  if (!isPublicId(storageKey)) return storageKey;
  if (cloudinaryEnabled) return deliveryUrl(storageKey);
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL}/${storageKey.replace(/^\/+/, '')}`;
  return storageKey;
}

export interface Availability {
  onHand: number;
  reserved: number;
  /** onHand minus active (unexpired) reservations, never below 0. */
  available: number;
  allowBackorder: boolean;
}

/** Stock availability per variant. Variants without an inventory row count as 0. */
export async function getAvailability(
  variantIds: string[],
  executor: DbExecutor = db,
): Promise<Map<string, Availability>> {
  const result = new Map<string, Availability>();
  if (!variantIds.length) return result;

  const [stockRows, reservedRows] = await Promise.all([
    executor
      .select({
        variantId: inventory.variantId,
        onHand: inventory.quantity,
        allowBackorder: inventory.allowBackorder,
      })
      .from(inventory)
      .where(inArray(inventory.variantId, variantIds)),
    executor
      .select({
        variantId: stockReservations.variantId,
        reserved: sql<number>`sum(${stockReservations.quantity})`.mapWith(Number),
      })
      .from(stockReservations)
      .where(
        and(
          inArray(stockReservations.variantId, variantIds),
          gt(stockReservations.expiresAt, sql`now()`),
        ),
      )
      .groupBy(stockReservations.variantId),
  ]);

  const reservedByVariant = new Map(reservedRows.map((r) => [r.variantId, r.reserved]));
  for (const id of variantIds) {
    result.set(id, { onHand: 0, reserved: 0, available: 0, allowBackorder: false });
  }
  for (const row of stockRows) {
    const reserved = reservedByVariant.get(row.variantId) ?? 0;
    result.set(row.variantId, {
      onHand: row.onHand,
      reserved,
      available: Math.max(0, row.onHand - reserved),
      allowBackorder: row.allowBackorder,
    });
  }
  return result;
}

/** Products a customer may see: published and not soft-deleted. */
export const isVisibleProduct = and(eq(products.status, 'published'), isNull(products.deletedAt))!;

/** Variants a customer may buy: active and not soft-deleted. */
export const isSellableVariant = and(
  eq(productVariants.active, true),
  isNull(productVariants.deletedAt),
)!;

export interface StorefrontFilters {
  slug?: string;
  categorySlug?: string;
  featured?: boolean;
}

/**
 * Published products with their sellable variants (+ availability), images
 * and categories. `priceKobo` is the cheapest in-catalogue variant's price.
 */
export async function getStorefrontProducts(filters: StorefrontFilters = {}) {
  const conditions: SQL[] = [isVisibleProduct];
  if (filters.slug) conditions.push(eq(products.slug, filters.slug));
  if (filters.featured !== undefined) conditions.push(eq(products.featured, filters.featured));
  if (filters.categorySlug) {
    conditions.push(
      inArray(
        products.id,
        db
          .select({ id: productCategories.productId })
          .from(productCategories)
          .innerJoin(categories, eq(productCategories.categoryId, categories.id))
          .where(and(eq(categories.slug, filters.categorySlug), isNull(categories.deletedAt))),
      ),
    );
  }

  const productRows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(sql`${products.publishedAt} desc nulls last`, asc(products.name));

  if (!productRows.length) return [];
  const productIds = productRows.map((p) => p.id);

  const [variantRows, imageRows, categoryRows] = await Promise.all([
    db
      .select()
      .from(productVariants)
      .where(and(inArray(productVariants.productId, productIds), isSellableVariant))
      .orderBy(asc(productVariants.position), asc(productVariants.priceKobo)),
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.position)),
    db
      .select({
        productId: productCategories.productId,
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
      })
      .from(productCategories)
      .innerJoin(categories, eq(productCategories.categoryId, categories.id))
      .where(and(inArray(productCategories.productId, productIds), isNull(categories.deletedAt)))
      .orderBy(asc(categories.position)),
  ]);

  const availability = await getAvailability(variantRows.map((v) => v.id));

  return productRows.map(({ deletedAt, ...product }) => {
    const variants = variantRows
      .filter((v) => v.productId === product.id)
      .map((v) => {
        const stock = availability.get(v.id)!;
        return {
          id: v.id,
          sku: v.sku,
          size: v.size,
          colour: v.colour,
          priceKobo: v.priceKobo,
          compareAtPriceKobo: v.compareAtPriceKobo,
          weightGrams: v.weightGrams,
          position: v.position,
          availableQty: stock.available,
          allowBackorder: stock.allowBackorder,
          inStock: stock.available > 0 || stock.allowBackorder,
        };
      });

    const cheapest = variants.reduce<(typeof variants)[number] | null>(
      (min, v) => (!min || v.priceKobo < min.priceKobo ? v : min),
      null,
    );

    return {
      ...product,
      priceKobo: cheapest?.priceKobo ?? null,
      compareAtPriceKobo: cheapest?.compareAtPriceKobo ?? null,
      totalAvailableQty: variants.reduce((sum, v) => sum + v.availableQty, 0),
      inStock: variants.some((v) => v.inStock),
      images: imageRows
        .filter((i) => i.productId === product.id)
        .map((i) => ({
          id: i.id,
          url: imageUrl(i.storageKey),
          alt: i.alt,
          position: i.position,
          colour: i.colour,
        })),
      categories: categoryRows
        .filter((cat) => cat.productId === product.id)
        .map(({ productId, ...cat }) => cat),
      variants,
    };
  });
}
