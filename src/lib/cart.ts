/**
 * Tochiwears — Cart helpers (shared by the cart API and checkout)
 */

import { asc, eq, inArray } from 'drizzle-orm';
import { db, type DbExecutor } from '@/db';
import { carts, cartItems, productImages, products, productVariants } from '@/db/schema';
import { getAvailability, imageUrl } from '@/lib/catalog';

export async function getOrCreateCart(userId: string, executor: DbExecutor = db) {
  await executor.insert(carts).values({ userId }).onConflictDoNothing({ target: carts.userId });
  const [cart] = await executor.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  return cart;
}

export type CartItemIssue = 'unavailable' | 'insufficient_stock' | null;

/**
 * Load the user's cart priced at current variant prices, flagging lines that
 * can no longer be bought as-is. Refreshes the cached totals on `carts`.
 */
export async function loadCart(userId: string, executor: DbExecutor = db) {
  const cart = await getOrCreateCart(userId, executor);

  const rows = await executor
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      priceKoboAtAdd: cartItems.priceKoboAtAdd,
      sku: productVariants.sku,
      size: productVariants.size,
      colour: productVariants.colour,
      unitPriceKobo: productVariants.priceKobo,
      variantActive: productVariants.active,
      variantDeletedAt: productVariants.deletedAt,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      productStatus: products.status,
      productDeletedAt: products.deletedAt,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(asc(cartItems.createdAt));

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const [availability, images] = await Promise.all([
    getAvailability(rows.map((r) => r.variantId), executor),
    productIds.length
      ? executor
          .select({
            productId: productImages.productId,
            storageKey: productImages.storageKey,
            colour: productImages.colour,
          })
          .from(productImages)
          .where(inArray(productImages.productId, productIds))
          .orderBy(asc(productImages.position))
      : Promise.resolve([]),
  ]);

  const items = rows.map((r) => {
    const stock = availability.get(r.variantId)!;
    const purchasable =
      r.variantActive && !r.variantDeletedAt && r.productStatus === 'published' && !r.productDeletedAt;
    const issue: CartItemIssue = !purchasable
      ? 'unavailable'
      : !stock.allowBackorder && r.quantity > stock.available
        ? 'insufficient_stock'
        : null;
    // Prefer an image pinned to this colourway, else the product's first image.
    const image =
      images.find((i) => i.productId === r.productId && r.colour && i.colour === r.colour) ??
      images.find((i) => i.productId === r.productId);

    return {
      id: r.id,
      variantId: r.variantId,
      productId: r.productId,
      productSlug: r.productSlug,
      productName: r.productName,
      sku: r.sku,
      size: r.size,
      colour: r.colour,
      imageUrl: image ? imageUrl(image.storageKey) : null,
      quantity: r.quantity,
      unitPriceKobo: r.unitPriceKobo,
      priceKoboAtAdd: r.priceKoboAtAdd,
      lineTotalKobo: r.quantity * r.unitPriceKobo,
      availableQty: stock.available,
      issue,
    };
  });

  const subtotalKobo = items.reduce((sum, i) => sum + i.lineTotalKobo, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  if (cart.totalKobo !== subtotalKobo || cart.itemCount !== itemCount) {
    await executor
      .update(carts)
      .set({ totalKobo: subtotalKobo, itemCount })
      .where(eq(carts.id, cart.id));
  }

  return {
    cartId: cart.id,
    items,
    itemCount,
    subtotalKobo,
    /** Same as subtotalKobo; delivery and coupons are applied at checkout. */
    totalKobo: subtotalKobo,
    hasIssues: items.some((i) => i.issue !== null),
  };
}
