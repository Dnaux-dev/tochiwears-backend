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

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API Documentation UI on Root / and /docs
const docsHandler = (c: any) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tochiwears API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
  <style>
    body { padding: 2rem 1rem; max-width: 960px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; text-transform: uppercase; color: #fff; }
    .get { background-color: #2e7d32; }
    .post { background-color: #1565c0; }
    .patch { background-color: #f57c00; }
    .delete { background-color: #c62828; }
    .auth-badge { font-size: 0.75rem; background: #555; color: #fff; border-radius: 3px; padding: 2px 6px; margin-left: 8px; }
    pre { background: #111; color: #00ff66; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; }
    .status-banner { background: #1b5e20; color: #fff; padding: 12px 20px; border-radius: 8px; margin-bottom: 2rem; display: flex; align-items: center; gap: 10px; }
    .pulse { width: 10px; height: 10px; background: #00ff66; border-radius: 50%; box-shadow: 0 0 8px #00ff66; }
    h2 { border-bottom: 2px solid #333; padding-bottom: 8px; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="status-banner">
    <div class="pulse"></div>
    <div><strong>Tochiwears Backend API</strong> — 🟢 Online & Live</div>
  </div>

  <header>
    <h1>🛍️ Tochiwears REST API Documentation</h1>
    <p>Official backend service for Tochiwears E-Commerce storefront & admin system.</p>
  </header>

  <main>
    <section>
      <h2>System & Health</h2>
      <table>
        <tr>
          <td><span class="badge get">GET</span></td>
          <td><code>/health</code></td>
          <td>System status check</td>
          <td><a href="/health" target="_blank">Try /health</a></td>
        </tr>
      </table>
    </section>

    <section>
      <h2>Public Products API</h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th><th>Action</th></tr></thead>
        <tbody>
          <tr>
            <td><span class="badge get">GET</span></td>
            <td><code>/api/products</code></td>
            <td>Fetch all published products</td>
            <td><a href="/api/products" target="_blank">View JSON</a></td>
          </tr>
          <tr>
            <td><span class="badge get">GET</span></td>
            <td><code>/api/products/:slug</code></td>
            <td>Fetch product details, variants & inventory</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Authentication <code>/auth</code></h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><span class="badge post">POST</span></td><td><code>/auth/signup</code></td><td>Register user account</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/auth/login</code></td><td>Authenticate & get session token</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/auth/logout</code> <span class="auth-badge">Bearer Token</span></td><td>Invalidate session</td></tr>
          <tr><td><span class="badge get">GET</span></td><td><code>/auth/me</code> <span class="auth-badge">Bearer Token</span></td><td>Get current user profile</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/auth/verify-email</code></td><td>Verify email address</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/auth/request-password-reset</code></td><td>Send password reset email</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/auth/reset-password</code></td><td>Submit new password</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Cart & Orders <span class="auth-badge">Requires Authorization: Bearer &lt;token&gt;</span></h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><span class="badge get">GET</span></td><td><code>/cart</code></td><td>View active user cart</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/cart</code></td><td>Add item to cart</td></tr>
          <tr><td><span class="badge patch">PATCH</span></td><td><code>/cart/:itemId</code></td><td>Update item quantity</td></tr>
          <tr><td><span class="badge delete">DELETE</span></td><td><code>/cart/:itemId</code></td><td>Remove item from cart</td></tr>
          <tr><td><span class="badge delete">DELETE</span></td><td><code>/cart</code></td><td>Clear entire cart</td></tr>
          <tr><td><span class="badge get">GET</span></td><td><code>/orders</code></td><td>List customer order history</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/orders</code></td><td>Place order from active cart</td></tr>
          <tr><td><span class="badge get">GET</span></td><td><code>/orders/:orderId</code></td><td>Get detailed order info</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Admin API <code>/admin</code> <span class="auth-badge">Requires Admin Token</span></h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><span class="badge get">GET</span></td><td><code>/admin/stats</code></td><td>Dashboard analytics & inventory stats</td></tr>
          <tr><td><span class="badge get">GET</span></td><td><code>/admin/products</code></td><td>List all products (including drafts)</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/admin/products</code></td><td>Create product</td></tr>
          <tr><td><span class="badge patch">PATCH</span></td><td><code>/admin/products/:id</code></td><td>Update product</td></tr>
          <tr><td><span class="badge delete">DELETE</span></td><td><code>/admin/products/:id</code></td><td>Soft delete product</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/admin/products/:id/variants</code></td><td>Add variant to product</td></tr>
          <tr><td><span class="badge patch">PATCH</span></td><td><code>/admin/inventory/:variantId</code></td><td>Adjust stock levels</td></tr>
          <tr><td><span class="badge get">GET</span></td><td><code>/admin/categories</code></td><td>List category tree</td></tr>
          <tr><td><span class="badge post">POST</span></td><td><code>/admin/categories</code></td><td>Create category</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Authorization Header Usage</h2>
      <pre>Authorization: Bearer &lt;your_session_token_here&gt;</pre>
    </section>
  </main>

  <footer style="margin-top: 3rem; text-align: center; font-size: 0.85rem; color: #888;">
    &copy; ${new Date().getFullYear()} Tochiwears. All rights reserved.
  </footer>
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