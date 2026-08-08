import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import productsApi from './api/products';
import cartApi from './api/cart';
import ordersApi from './api/orders';
import adminApi from './api/admin';
import authApi from './api/auth';
import { requireAuth, requireAdmin } from './lib/middleware';

const app = new Hono();

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

/* ========================================
   PUBLIC API
   ======================================== */

// Products (public, no auth needed)
app.route('/api/products', productsApi);

/* ========================================
   AUTH ROUTES
   ======================================== */

// Authentication (signup, login, password reset, etc.)
app.route('/auth', authApi);

/* ========================================
   CUSTOMER ROUTES (PROTECTED)
   ======================================== */

// Cart (requires authentication)
app.use('/cart/*', requireAuth);
app.route('/cart', cartApi);

// Orders (requires authentication)
app.use('/orders/*', requireAuth);
app.route('/orders', ordersApi);

/* ========================================
   ADMIN API (PROTECTED + ADMIN ROLE)
   ======================================== */

// Protect all admin routes with requireAdmin middleware
app.use('/admin/*', requireAdmin);
app.route('/admin', adminApi);

const port = 3000;
console.log(`🚀 Server running on http://localhost:${port}`);
console.log(`
📚 Routes:

PUBLIC API (no auth):
  GET    /api/products
  GET    /api/products/:slug

AUTH (public):
  POST   /auth/signup
  POST   /auth/login
  POST   /auth/logout
  POST   /auth/verify-email
  POST   /auth/request-password-reset
  POST   /auth/reset-password
  GET    /auth/me (requires token)

CUSTOMER (requires token):
  GET    /cart
  POST   /cart
  PATCH  /cart/:itemId
  DELETE /cart/:itemId
  DELETE /cart

  GET    /orders
  POST   /orders
  GET    /orders/:orderId

ADMIN (requires token + admin role):
  POST   /admin/products
  GET    /admin/products
  PATCH  /admin/products/:id
  DELETE /admin/products/:id
  POST   /admin/products/:productId/variants
  PATCH  /admin/variants/:variantId
  DELETE /admin/variants/:variantId
  PATCH  /admin/inventory/:variantId
  GET    /admin/inventory/:variantId/movements
  GET    /admin/inventory/low-stock
  POST   /admin/categories
  GET    /admin/categories
  PATCH  /admin/categories/:id
  DELETE /admin/categories/:id
  GET    /admin/stats
`);

serve({
  fetch: app.fetch,
  port,
});