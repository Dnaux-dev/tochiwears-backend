/**
 * Tochiwears — Schema barrel export
 * Import all tables, types, and relations from this single file
 *
 * Usage:
 *   import { products, categories, inventory } from '@/db/schema';
 */

// Categories
export {
  categories,
  categoriesRelations,
  type Category,
  type NewCategory,
} from './categories';

// Products
export {
  products,
  productVariants,
  productImages,
  productCategories,
  productStatus,
  productsRelations,
  productVariantsRelations,
  productImagesRelations,
  type Product,
  type NewProduct,
  type ProductVariant,
  type NewProductVariant,
  type ProductImage,
  type ProductCategory,
} from './products';

// Inventory
export {
  inventory,
  inventoryMovements,
  stockReservations,
  stockMovementReason,
  inventoryRelations,
  inventoryMovementsRelations,
  stockReservationsRelations,
  POST_MIGRATION_SQL,
  type Inventory,
  type NewInventory,
  type InventoryMovement,
  type NewInventoryMovement,
  type StockReservation,
  type NewStockReservation,
} from './inventory';

// Auth
export {
  users,
  sessions,
  passwordResets,
  emailVerifications,
  userRole,
  usersRelations,
  sessionsRelations,
  passwordResetsRelations,
  emailVerificationsRelations,
  type User,
  type NewUser,
  type Session,
  type NewSession,
  type PasswordReset,
  type EmailVerification,
} from './auth';

// Cart & Orders
export {
  carts,
  cartItems,
  orders,
  orderItems,
  deliveryZones,
  coupons,
  orderStatus,
  cartsRelations,
  cartItemsRelations,
  ordersRelations,
  orderItemsRelations,
  type Cart,
  type NewCart,
  type CartItem,
  type NewCartItem,
  type Order,
  type NewOrder,
  type OrderItem,
  type NewOrderItem,
  type DeliveryZone,
  type Coupon,
} from './orders';