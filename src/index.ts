import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import productsApi from './api/products';
import cartApi from './api/cart';
import ordersApi from './api/orders';
import adminApi from './api/admin';
import authApi from './api/auth';
import { requireAuth, requireAdmin } from './lib/middleware';

const app = new Hono();

// Enable CORS for frontend requests
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);

import { openApiSpec } from './lib/openapi';

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// OpenAPI Spec JSON Endpoint (for Postman / Insomnia import)
app.get('/openapi.json', (c) => c.json(openApiSpec));

// Interactive Swagger UI Documentation on / and /docs
const docsHandler = (c: any) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tochiwears API Documentation & Payload Reference</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; background: #fafafa; font-family: sans-serif; }
    .topbar-custom { background: #1b1b1b; color: #fff; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #00ff66; }
    .topbar-custom h1 { margin: 0; font-size: 1.25rem; font-weight: 600; }
    .btn-postman { background: #ff6c37; color: #fff; text-decoration: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; }
    .btn-postman:hover { background: #e05b26; }
  </style>
</head>
<body>
  <div class="topbar-custom">
    <div>
      <h1>🛍️ Tochiwears REST API Documentation</h1>
      <small>Interactive Payload Specifications & Live Testing Console</small>
    </div>
    <div>
      <a href="/openapi.json" target="_blank" class="btn-postman">📥 Download OpenAPI JSON (For Postman Import)</a>
    </div>
  </div>

  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
  return c.html(html);
};

app.get('/', docsHandler);
app.get('/docs', docsHandler);

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
app.use('/cart*', requireAuth);
app.route('/cart', cartApi);

// Orders (requires authentication)
app.use('/orders*', requireAuth);
app.route('/orders', ordersApi);

/* ========================================
   ADMIN API (PROTECTED + ADMIN ROLE)
   ======================================== */

// Protect all admin routes with requireAdmin middleware
app.use('/admin*', requireAdmin);
app.route('/admin', adminApi);

const port = Number(process.env.PORT) || 3000;
console.log(`🚀 Server running on port ${port}`);
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