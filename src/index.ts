import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import productsApi from './api/products';
import adminApi from './api/admin';
import authApi from './api/auth';
import { requireAdmin, optionalAuth } from './lib/middleware';

const app = new Hono();

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

/* ========================================
   PUBLIC API
   ======================================== */

// Products (public, no auth needed)
app.route('/api', productsApi);

/* ========================================
   AUTH ROUTES
   ======================================== */

// Authentication (signup, login, password reset, etc.)
app.route('/auth', authApi);

/* ========================================
   ADMIN API (PROTECTED)
   ======================================== */

// Protect all admin routes with requireAdmin middleware
app.use('/admin/*', requireAdmin);
app.route('/admin', adminApi);

const port = 3000;
console.log(`🚀 Server running on http://localhost:${port}`);
console.log(`📚 Routes:`);
console.log(`   Public API:`);
console.log(`     GET    /api/products`);
console.log(`     GET    /api/products/:slug`);
console.log(`   Auth:`);
console.log(`     POST   /auth/signup`);
console.log(`     POST   /auth/login`);
console.log(`     POST   /auth/logout`);
console.log(`     GET    /auth/me`);
console.log(`   Admin (protected):`);
console.log(`     POST   /admin/products`);
console.log(`     GET    /admin/products`);
console.log(`     PATCH  /admin/products/:id`);

serve({
  fetch: app.fetch,
  port,
});