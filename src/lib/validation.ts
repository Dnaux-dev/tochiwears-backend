/**
 * Tochiwears — Input Validation Schemas
 * Using Zod for type-safe, runtime validation
 */

import { z } from 'zod';

/* ========================================
   SHARED
   ======================================== */

const email = z.string().trim().toLowerCase().email('Invalid email address');

const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

/** Accepts 08012345678, 2348012345678, +234 801 234 5678 → +2348012345678 */
export const nigerianPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^(\+?234|0)[789][01]\d{8}$/, 'Enter a valid Nigerian phone number')
      .transform((v) => '+234' + v.replace(/^(\+?234|0)/, '')),
  );

const slug = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers and hyphens');

const sku = z
  .string()
  .trim()
  .min(1, 'SKU is required')
  .regex(/^[A-Z0-9-]+$/, 'SKU must be uppercase with hyphens only');

const kobo = z.number().int('Amount must be in whole kobo').nonnegative('Amount cannot be negative');
const optionalText = z.string().trim().optional();
/** For PATCH bodies: omit to leave unchanged, null to clear. */
const nullableText = z.string().trim().nullable().optional();

export const uuidParam = z.string().uuid('Invalid ID');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* ========================================
   AUTH VALIDATION
   ======================================== */

export const signupSchema = z
  .object({
    email,
    password: strongPassword,
    firstName: optionalText,
    lastName: optionalText,
    /** Convenience for forms with a single name field; split on first space. */
    name: optionalText,
    phone: nigerianPhone.optional(),
  })
  .transform(({ name, ...rest }) => {
    if (name && !rest.firstName && !rest.lastName) {
      const [first, ...others] = name.split(/\s+/);
      return { ...rest, firstName: first, lastName: others.join(' ') || undefined };
    }
    return rest;
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetRequestSchema = z.object({ email });

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: strongPassword,
});

export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

/* ========================================
   PRODUCT VALIDATION
   ======================================== */

export const createProductSchema = z.object({
  slug,
  name: z.string().trim().min(1, 'Product name is required'),
  description: optionalText,
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  featured: z.boolean().default(false),
  metaTitle: optionalText,
  metaDescription: optionalText,
  categoryIds: z.array(uuidParam).optional(),
});

export const updateProductSchema = z.object({
  slug: slug.optional(),
  name: z.string().trim().min(1, 'Name is required').optional(),
  description: nullableText,
  status: z.enum(['draft', 'published', 'archived']).optional(),
  featured: z.boolean().optional(),
  metaTitle: nullableText,
  metaDescription: nullableText,
});

export const setProductCategoriesSchema = z.object({
  categoryIds: z.array(uuidParam),
});

export const addProductImageSchema = z
  .object({
    /** R2 object key, or a full https URL. */
    storageKey: z.string().trim().min(1).optional(),
    url: z.string().trim().url().optional(),
    alt: optionalText,
    position: z.number().int().nonnegative().optional(),
    colour: optionalText,
  })
  .refine((v) => v.storageKey || v.url, { message: 'storageKey or url is required' });

/* ========================================
   VARIANT VALIDATION
   ======================================== */

export const createVariantSchema = z.object({
  sku,
  size: optionalText,
  colour: optionalText,
  priceKobo: kobo,
  compareAtPriceKobo: kobo.optional(),
  weightGrams: z.number().int().positive().optional(),
  position: z.number().int().nonnegative().optional(),
  /** Starting stock; recorded as a restock movement. */
  initialQuantity: z.number().int().nonnegative().optional(),
});

export const updateVariantSchema = z.object({
  sku: sku.optional(),
  size: nullableText,
  colour: nullableText,
  priceKobo: kobo.optional(),
  compareAtPriceKobo: kobo.nullable().optional(),
  weightGrams: z.number().int().positive().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

/* ========================================
   INVENTORY VALIDATION
   ======================================== */

export const updateInventorySchema = z
  .object({
    /** New absolute on-hand quantity. The delta is logged as a movement. */
    quantity: z
      .number()
      .int('Quantity must be a whole number')
      .nonnegative('Quantity cannot be negative')
      .optional(),
    reason: z.enum(['restock', 'sale', 'return', 'adjustment', 'damage']).default('adjustment'),
    note: optionalText,
    lowStockThreshold: z.number().int().nonnegative().optional(),
    allowBackorder: z.boolean().optional(),
  })
  .refine(
    (v) => v.quantity !== undefined || v.lowStockThreshold !== undefined || v.allowBackorder !== undefined,
    { message: 'Provide quantity, lowStockThreshold or allowBackorder' },
  );

/* ========================================
   CATEGORY VALIDATION
   ======================================== */

export const createCategorySchema = z.object({
  slug,
  name: z.string().trim().min(1, 'Category name is required'),
  description: optionalText,
  parentId: uuidParam.optional(),
  position: z.number().int().nonnegative().optional(),
});

export const updateCategorySchema = z.object({
  slug: slug.optional(),
  name: z.string().trim().min(1, 'Name is required').optional(),
  description: nullableText,
  parentId: uuidParam.nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

/* ========================================
   CART VALIDATION
   ======================================== */

const cartQuantity = z.number().int('Quantity must be a whole number').max(100, 'Maximum 100 per item');

export const addToCartSchema = z.object({
  variantId: uuidParam,
  quantity: cartQuantity.positive('Quantity must be at least 1').default(1),
});

export const updateCartItemSchema = z.object({
  /** 0 removes the item. */
  quantity: cartQuantity.nonnegative('Quantity cannot be negative'),
});

/* ========================================
   ORDER VALIDATION
   ======================================== */

export const DELIVERY_STATES = ['Lagos', 'Abuja', 'Ibadan', 'Kano', 'Others'] as const;

export const createOrderSchema = z.object({
  deliveryAddress: z.string().trim().min(5, 'Address must be at least 5 characters'),
  deliveryCity: z.string().trim().min(2, 'City name required'),
  deliveryState: z.enum(DELIVERY_STATES, { message: 'Select a valid state' }),
  deliveryPostalCode: optionalText,
  customerNotes: optionalText,
  couponCode: z.string().trim().toUpperCase().optional(),
  /** Override the profile's details for this order (e.g. a gift recipient). */
  customerPhone: nigerianPhone.optional(),
  customerFirstName: optionalText,
  customerLastName: optionalText,
});

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  trackingNumber: optionalText,
  adminNotes: optionalText,
});

export const adminOrderListSchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});

/* ========================================
   Type Inference
   ======================================== */

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
