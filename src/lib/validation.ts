/**
 * Tochiwears — Input Validation Schemas
 * Using Zod for type-safe, runtime validation
 */

import { z } from 'zod';

/* ========================================
   AUTH VALIDATION
   ======================================== */

export const signupSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  firstName: z.string().min(1, 'First name is required').trim().optional(),
  lastName: z.string().min(1, 'Last name is required').trim().optional(),
  phone: z
    .string()
    .regex(/^\+234\d{10}$/, 'Phone must be E.164 format: +234...')
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

/* ========================================
   PRODUCT VALIDATION
   ======================================== */

export const createProductSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only')
    .trim(),
  name: z.string().min(1, 'Product name is required').trim(),
  description: z.string().trim().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  featured: z.boolean().optional(),
  metaTitle: z.string().trim().optional(),
  metaDescription: z.string().trim().optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1, 'Name is required').trim().optional(),
  description: z.string().trim().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  featured: z.boolean().optional(),
  metaTitle: z.string().trim().optional(),
  metaDescription: z.string().trim().optional(),
});

/* ========================================
   VARIANT VALIDATION
   ======================================== */

export const createVariantSchema = z.object({
  sku: z
    .string()
    .min(1, 'SKU is required')
    .regex(/^[A-Z0-9-]+$/, 'SKU must be uppercase with hyphens only')
    .trim(),
  size: z.string().trim().optional(),
  colour: z.string().trim().optional(),
  priceKobo: z
    .number()
    .int('Price must be in whole kobo')
    .positive('Price must be positive'),
  compareAtPriceKobo: z.number().int().positive().optional(),
  weightGrams: z.number().int().positive().optional(),
});

export const updateVariantSchema = z.object({
  sku: z
    .string()
    .regex(/^[A-Z0-9-]+$/, 'SKU must be uppercase with hyphens only')
    .trim()
    .optional(),
  size: z.string().trim().optional(),
  colour: z.string().trim().optional(),
  priceKobo: z.number().int('Price must be in whole kobo').positive().optional(),
  compareAtPriceKobo: z.number().int().positive().optional(),
  weightGrams: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

/* ========================================
   INVENTORY VALIDATION
   ======================================== */

export const updateInventorySchema = z.object({
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .nonnegative('Quantity cannot be negative'),
  reason: z
    .enum(['restock', 'sale', 'return', 'adjustment', 'damage'])
    .optional(),
  note: z.string().trim().optional(),
});

/* ========================================
   CATEGORY VALIDATION
   ======================================== */

export const createCategorySchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only')
    .trim(),
  name: z.string().min(1, 'Category name is required').trim(),
  description: z.string().trim().optional(),
  parentId: z.string().uuid('Invalid parent category ID').optional(),
  position: z.number().int().nonnegative().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').trim().optional(),
  description: z.string().trim().optional(),
  parentId: z.string().uuid('Invalid parent category ID').optional(),
  position: z.number().int().nonnegative().optional(),
});

/* ========================================
   Type Inference
   ======================================== */

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/* ========================================
   CART VALIDATION
   ======================================== */

export const addToCartSchema = z.object({
  variantId: z.string().uuid('Invalid variant ID'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
});

export const updateCartItemSchema = z.object({
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .nonnegative('Quantity cannot be negative'),
});

/* ========================================
   ORDER VALIDATION
   ======================================== */

export const createOrderSchema = z.object({
  deliveryAddress: z.string().min(5, 'Address must be at least 5 characters').trim(),
  deliveryCity: z.string().min(2, 'City name required').trim(),
  deliveryState: z.enum(['Lagos', 'Abuja', 'Ibadan', 'Kano', 'Others'], {
    message: 'Select a valid state',
  }),
  deliveryPostalCode: z.string().trim().optional(),
  customerNotes: z.string().trim().optional(),
  couponCode: z.string().trim().optional(),
});

/* ========================================
   Type Inference
   ======================================== */

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;