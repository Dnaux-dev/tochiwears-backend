import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import productsApi from './api/products';
import adminApi from './api/admin';

const app = new Hono();

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Public API routes
app.route('/api', productsApi);

// Admin API routes
app.route('/admin', adminApi);

const port = 3000;
console.log(`🚀 Server running on http://localhost:${port}`);
console.log(`📚 Public API:  GET /api/products`);
console.log(`📚 Admin API:   POST /admin/products`);

serve({
  fetch: app.fetch,
  port,
});