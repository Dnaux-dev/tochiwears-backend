/**
 * Tochiwears — Public delivery fees
 */

import { Hono } from 'hono';
import { listDeliveryFees } from '@/lib/delivery';

const app = new Hono();

/**
 * GET /api/delivery-fees
 * All 36 states + FCT with the delivery fee for each.
 */
app.get('/', async (c) => c.json({ data: await listDeliveryFees() }));

export default app;
