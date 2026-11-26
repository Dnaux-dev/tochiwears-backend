import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import productsApi, { categoriesApi } from './api/products';
import deliveryApi from './api/delivery';
import cartApi from './api/cart';
import ordersApi from './api/orders';
import adminApi from './api/admin';
import authApi from './api/auth';
import { requireAuth, requireAdmin } from './lib/middleware';
import { handleError } from './lib/http';
import { openApiSpec } from './lib/openapi';
import { startHousekeeping } from './jobs/reservation-expiry';

const app = new Hono();

/**
 * CORS: only origins listed in CORS_ORIGINS (comma-separated) get CORS headers.
 * Required because credentials are allowed — a wildcard would let any site
 * make authenticated requests if cookie sessions are ever used.
 */
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  }),
);
app.use('*', logger());

app.onError(handleError);
app.notFound((c) => c.json({ error: `Route not found: ${c.req.method} ${c.req.path}` }, 404));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// OpenAPI Spec JSON Endpoint (for Postman / Insomnia import)
app.get('/openapi.json', (c) => c.json(openApiSpec));

// Interactive Swagger UI Documentation on / and /docs
const docsHandler = (c: Context) => {
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

app.route('/api/products', productsApi);
app.route('/api/categories', categoriesApi);
app.route('/api/delivery-fees', deliveryApi);

/* ========================================
   AUTH ROUTES
   ======================================== */

app.route('/auth', authApi);

/* ========================================
   CUSTOMER ROUTES (PROTECTED)
   ======================================== */

app.use('/cart', requireAuth);
app.use('/cart/*', requireAuth);
app.route('/cart', cartApi);

app.use('/orders', requireAuth);
app.use('/orders/*', requireAuth);
app.route('/orders', ordersApi);

/* ========================================
   ADMIN API (PROTECTED + ADMIN ROLE)
   ======================================== */

app.use('/admin', requireAdmin);
app.use('/admin/*', requireAdmin);
app.route('/admin', adminApi);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`🚀 Server running on port ${port} — docs at /docs`);
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`);
});

startHousekeeping();
