/**
 * Tochiwears OpenAPI 3.0 specification (served at /openapi.json, rendered at /docs)
 * Keep in sync with src/api/* and src/lib/validation.ts.
 */

type Schema = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Schema) => ({ content: { 'application/json': { schema } } });
const body = (name: string) => ({ required: true, ...json(ref(name)) });
const ok = (description: string, schema?: Schema) => ({
  description,
  ...(schema && json(schema)),
});
const data = (schema: Schema) => ({ type: 'object', properties: { data: schema } });
const list = (name: string, paginated = false) => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: ref(name) },
    ...(paginated && { pagination: ref('Pagination') }),
  },
});
const path = (name: string, description = 'UUID') => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description,
});
const query = (name: string, schema: Schema, description?: string) => ({
  name,
  in: 'query',
  required: false,
  schema,
  ...(description && { description }),
});
const pageParams = [
  query('page', { type: 'integer', minimum: 1, default: 1 }),
  query('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
];

const auth = [{ BearerAuth: [] }];
const errors = {
  '400': { description: 'Validation error', ...json(ref('Error')) },
  '401': { description: 'Missing or invalid token', ...json(ref('Error')) },
};
const adminErrors = { ...errors, '403': { description: 'Not an admin', ...json(ref('Error')) } };

const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const nullableString = { type: 'string', nullable: true };
const kobo = { type: 'integer', description: 'Amount in kobo (100 kobo = ₦1)' };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Tochiwears E-Commerce API',
    version: '1.1.0',
    contact: { name: 'Tochiwears Engineering', email: 'dnauxdev@gmail.com' },
    description: [
      'REST API for the Tochiwears store.',
      '',
      '**Conventions**',
      '- Authenticate with `Authorization: Bearer <token>` (token from `/auth/login` or `/auth/signup`).',
      '- Successful responses are wrapped as `{ "data": ... }`; lists may add `pagination`.',
      '- Errors are `{ "error": string, "details"?: object }`. 409 means a conflict (duplicate, stock ran out).',
      '- All money is integer **kobo** (`priceKobo: 250000` = ₦2,500).',
      '- Stock is held for 15 minutes when an order is placed; payment confirmation turns the hold into a sale.',
    ].join('\n'),
  },
  servers: [
    { url: 'https://tochiwears-backend.onrender.com', description: 'Production (Render)' },
    { url: 'http://localhost:3000', description: 'Local development' },
  ],
  tags: [
    { name: 'Catalogue' },
    { name: 'Auth' },
    { name: 'Cart' },
    { name: 'Orders' },
    { name: 'Admin: Catalogue' },
    { name: 'Admin: Inventory' },
    { name: 'Admin: Orders & Customers' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', description: 'Session token from /auth/login or /auth/signup' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' }, details: { type: 'object' } },
        example: { error: 'Validation error', details: { email: ['Invalid email address'] } },
      },
      Pagination: {
        type: 'object',
        properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' } },
      },

      /* ---------- Catalogue ---------- */
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          slug: { type: 'string', example: 'belt' },
          name: { type: 'string', example: 'Belt' },
          description: nullableString,
          parentId: { ...nullableString, format: 'uuid' },
          position: { type: 'integer' },
        },
      },
      ProductImage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', example: 'https://cdn.tochiwears.com/products/belt-1.jpg' },
          alt: nullableString,
          position: { type: 'integer' },
          colour: { ...nullableString, description: 'Shown only for this colourway when set' },
        },
      },
      Variant: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Use as variantId for the cart' },
          sku: { type: 'string', example: 'BELT-BLK-M' },
          size: { ...nullableString, example: 'M' },
          colour: { ...nullableString, example: 'Black' },
          priceKobo: { ...kobo, example: 1500000 },
          compareAtPriceKobo: { ...kobo, nullable: true, description: 'Struck-through "was" price' },
          weightGrams: { type: 'integer', nullable: true },
          position: { type: 'integer' },
          availableQty: { type: 'integer', description: 'On hand minus active reservations' },
          allowBackorder: { type: 'boolean' },
          inStock: { type: 'boolean' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          slug: { type: 'string', example: 'black-leather-belt' },
          name: { type: 'string', example: 'Black Leather Belt' },
          description: nullableString,
          status: { type: 'string', enum: ['published'] },
          featured: { type: 'boolean' },
          publishedAt: { type: 'string', format: 'date-time', nullable: true },
          metaTitle: nullableString,
          metaDescription: nullableString,
          priceKobo: { ...kobo, nullable: true, description: 'Cheapest variant price ("from ₦…")' },
          compareAtPriceKobo: { ...kobo, nullable: true },
          totalAvailableQty: { type: 'integer' },
          inStock: { type: 'boolean' },
          images: { type: 'array', items: ref('ProductImage') },
          categories: {
            type: 'array',
            items: { type: 'object', properties: { id: { type: 'string' }, slug: { type: 'string' }, name: { type: 'string' } } },
          },
          variants: { type: 'array', items: ref('Variant') },
        },
      },

      /* ---------- Auth ---------- */
      SignupRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ada@example.com' },
          password: { type: 'string', minLength: 8, description: 'Needs an uppercase letter and a number', example: 'Password123' },
          firstName: { type: 'string', example: 'Ada' },
          lastName: { type: 'string', example: 'Obi' },
          name: { type: 'string', description: 'Alternative to firstName/lastName; split on the first space', example: 'Ada Obi' },
          phone: { type: 'string', description: 'Nigerian mobile; 080…, 234… or +234… accepted, stored as +234…', example: '08031234567' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ada@example.com' },
          password: { type: 'string', example: 'Password123' },
        },
      },
      AuthUser: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          email: { type: 'string' },
          firstName: nullableString,
          lastName: nullableString,
          phone: nullableString,
          role: { type: 'string', enum: ['customer', 'admin', 'super_admin'] },
          emailVerified: { type: 'boolean' },
          emailSent: { type: 'boolean', description: 'Signup only: whether the verification email was accepted for delivery' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          data: ref('AuthUser'),
          token: { type: 'string', description: 'Send as Authorization: Bearer <token>' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      EmailRequest: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
      TokenRequest: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
      ResetPasswordRequest: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: { token: { type: 'string' }, newPassword: { type: 'string', example: 'NewPassword123' } },
      },
      Message: { type: 'object', properties: { message: { type: 'string' } } },

      /* ---------- Cart ---------- */
      AddToCartRequest: {
        type: 'object',
        required: ['variantId'],
        properties: {
          variantId: { type: 'string', format: 'uuid' },
          quantity: { type: 'integer', minimum: 1, maximum: 100, default: 1, description: 'Added to any quantity already in the cart' },
        },
      },
      UpdateCartItemRequest: {
        type: 'object',
        required: ['quantity'],
        properties: { quantity: { type: 'integer', minimum: 0, maximum: 100, description: '0 removes the item' } },
      },
      CartItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Cart item ID for PATCH/DELETE /cart/{itemId}' },
          variantId: { type: 'string', format: 'uuid' },
          productId: { type: 'string', format: 'uuid' },
          productSlug: { type: 'string' },
          productName: { type: 'string' },
          sku: { type: 'string' },
          size: nullableString,
          colour: nullableString,
          imageUrl: nullableString,
          quantity: { type: 'integer' },
          unitPriceKobo: { ...kobo, description: 'Current price' },
          priceKoboAtAdd: kobo,
          lineTotalKobo: kobo,
          availableQty: { type: 'integer' },
          issue: { type: 'string', nullable: true, enum: ['unavailable', 'insufficient_stock', null] },
        },
      },
      Cart: {
        type: 'object',
        properties: {
          cartId: { type: 'string', format: 'uuid' },
          items: { type: 'array', items: ref('CartItem') },
          itemCount: { type: 'integer' },
          subtotalKobo: kobo,
          totalKobo: { ...kobo, description: 'Same as subtotal; delivery and coupons apply at checkout' },
          hasIssues: { type: 'boolean', description: 'True if any item must be fixed before checkout' },
        },
      },

      /* ---------- Orders ---------- */
      CreateOrderRequest: {
        type: 'object',
        required: ['deliveryAddress', 'deliveryCity', 'deliveryState'],
        properties: {
          deliveryAddress: { type: 'string', example: '12 Marina Street, Victoria Island' },
          deliveryCity: { type: 'string', example: 'Lagos' },
          deliveryState: { type: 'string', enum: ['Lagos', 'Abuja', 'Ibadan', 'Kano', 'Others'] },
          deliveryPostalCode: { type: 'string' },
          customerNotes: { type: 'string', example: 'Call before delivery' },
          couponCode: { type: 'string', example: 'WELCOME10' },
          customerPhone: { type: 'string', description: 'Overrides the profile phone for this order' },
          customerFirstName: { type: 'string' },
          customerLastName: { type: 'string' },
        },
      },
      OrderItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          variantId: { type: 'string', format: 'uuid' },
          sku: { type: 'string' },
          productName: { type: 'string' },
          variantDescription: { ...nullableString, example: 'Black, M' },
          quantity: { type: 'integer' },
          priceKoboPerUnit: kobo,
          totalKobo: kobo,
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          orderNumber: { type: 'string', example: 'ORD-20261126-7K2QXM' },
          status: { type: 'string', enum: ORDER_STATUSES },
          customerEmail: { type: 'string' },
          customerPhone: { type: 'string' },
          customerFirstName: { type: 'string' },
          customerLastName: { type: 'string' },
          deliveryAddress: { type: 'string' },
          deliveryCity: { type: 'string' },
          deliveryState: { type: 'string' },
          deliveryPostalCode: nullableString,
          subtotalKobo: kobo,
          deliveryFeeKobo: kobo,
          discountKobo: kobo,
          couponCode: nullableString,
          totalKobo: kobo,
          paidAt: { type: 'string', format: 'date-time', nullable: true },
          trackingNumber: nullableString,
          shippedAt: { type: 'string', format: 'date-time', nullable: true },
          deliveredAt: { type: 'string', format: 'date-time', nullable: true },
          customerNotes: nullableString,
          createdAt: { type: 'string', format: 'date-time' },
          items: { type: 'array', items: ref('OrderItem'), description: 'Included on single-order responses' },
        },
      },

      /* ---------- Admin ---------- */
      CreateProductRequest: {
        type: 'object',
        required: ['slug', 'name'],
        properties: {
          slug: { type: 'string', example: 'black-leather-belt' },
          name: { type: 'string', example: 'Black Leather Belt' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'], default: 'draft' },
          featured: { type: 'boolean', default: false },
          metaTitle: { type: 'string' },
          metaDescription: { type: 'string' },
          categoryIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        },
      },
      UpdateProductRequest: {
        type: 'object',
        description: 'Send only fields to change; null clears nullable fields',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          description: nullableString,
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          featured: { type: 'boolean' },
          metaTitle: nullableString,
          metaDescription: nullableString,
        },
      },
      SetCategoriesRequest: {
        type: 'object',
        required: ['categoryIds'],
        properties: { categoryIds: { type: 'array', items: { type: 'string', format: 'uuid' } } },
      },
      AddImageRequest: {
        type: 'object',
        description: 'Provide storageKey (R2 key, prefixed with IMAGE_BASE_URL) or a full url',
        properties: {
          storageKey: { type: 'string', example: 'products/belt-1.jpg' },
          url: { type: 'string', example: 'https://cdn.example.com/belt-1.jpg' },
          alt: { type: 'string' },
          position: { type: 'integer', description: 'Defaults to the end of the gallery' },
          colour: { type: 'string' },
        },
      },
      CreateVariantRequest: {
        type: 'object',
        required: ['sku', 'priceKobo'],
        properties: {
          sku: { type: 'string', example: 'BELT-BLK-M' },
          size: { type: 'string', example: 'M' },
          colour: { type: 'string', example: 'Black' },
          priceKobo: { ...kobo, example: 1500000 },
          compareAtPriceKobo: kobo,
          weightGrams: { type: 'integer' },
          position: { type: 'integer' },
          initialQuantity: { type: 'integer', minimum: 0, description: 'Starting stock (logged as a restock)' },
        },
      },
      UpdateVariantRequest: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          size: nullableString,
          colour: nullableString,
          priceKobo: kobo,
          compareAtPriceKobo: { ...kobo, nullable: true },
          weightGrams: { type: 'integer', nullable: true },
          position: { type: 'integer' },
          active: { type: 'boolean' },
        },
      },
      UpdateInventoryRequest: {
        type: 'object',
        properties: {
          quantity: { type: 'integer', minimum: 0, description: 'New absolute on-hand count; the change is logged' },
          reason: { type: 'string', enum: ['restock', 'sale', 'return', 'adjustment', 'damage'], default: 'adjustment' },
          note: { type: 'string', example: 'Supplier batch #204' },
          lowStockThreshold: { type: 'integer', minimum: 0 },
          allowBackorder: { type: 'boolean' },
        },
      },
      CategoryRequest: {
        type: 'object',
        properties: {
          slug: { type: 'string', example: 'belt' },
          name: { type: 'string', example: 'Belt' },
          description: { type: 'string' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          position: { type: 'integer' },
        },
      },
      UpdateOrderStatusRequest: {
        type: 'object',
        required: ['status'],
        description: [
          'Allowed: pending→paid|cancelled; paid→processing|shipped|cancelled|refunded;',
          'processing→shipped|cancelled|refunded; shipped→delivered|refunded; delivered→refunded.',
          '→paid deducts stock; →cancelled releases holds, or restocks if already paid.',
        ].join(' '),
        properties: {
          status: { type: 'string', enum: ORDER_STATUSES },
          trackingNumber: { type: 'string' },
          adminNotes: { type: 'string' },
        },
      },
      Customer: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string' },
          firstName: nullableString,
          lastName: nullableString,
          phone: nullableString,
          emailVerified: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          orderCount: { type: 'integer' },
          totalSpentKobo: { ...kobo, description: 'Sum of paid, processing, shipped and delivered orders' },
          lastOrderAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Stats: {
        type: 'object',
        properties: {
          totalProducts: { type: 'integer' },
          totalVariants: { type: 'integer' },
          totalStock: { type: 'integer' },
          lowStockCount: { type: 'integer' },
          totalOrders: { type: 'integer' },
          pendingOrders: { type: 'integer' },
          ordersToFulfil: { type: 'integer', description: 'paid + processing' },
          revenueKobo: kobo,
          totalCustomers: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { summary: 'Health check', responses: { '200': ok('Service is up') } },
    },

    /* ---------- Catalogue ---------- */
    '/api/products': {
      get: {
        tags: ['Catalogue'],
        summary: 'List published products',
        description: 'Includes variants (with stock), images, categories and the lowest price.',
        parameters: [
          query('category', { type: 'string' }, 'Category slug, e.g. belt'),
          query('featured', { type: 'string', enum: ['true', 'false'] }),
        ],
        responses: { '200': ok('Products', list('Product')) },
      },
    },
    '/api/products/{slug}': {
      get: {
        tags: ['Catalogue'],
        summary: 'Get a published product by slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' }, example: 'black-leather-belt' }],
        responses: { '200': ok('Product', data(ref('Product'))), '404': ok('Not found or not published') },
      },
    },
    '/api/categories': {
      get: { tags: ['Catalogue'], summary: 'List categories', responses: { '200': ok('Categories', list('Category')) } },
    },

    /* ---------- Auth ---------- */
    '/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Register and sign in',
        description:
          'Sends a verification email. Its link opens GET /auth/verify-email on this API, which verifies and redirects to the frontend login page with ?verified=success|already|expired|invalid.',
        requestBody: body('SignupRequest'),
        responses: { '201': ok('Created', ref('AuthResponse')), '400': errors['400'], '409': ok('Email already registered') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in',
        requestBody: body('LoginRequest'),
        responses: { '200': ok('Signed in', ref('AuthResponse')), '401': ok('Invalid email or password') },
      },
    },
    '/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user', security: auth, responses: { '200': ok('User', data(ref('AuthUser'))), '401': errors['401'] } },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Invalidate the current token', security: auth, responses: { '200': ok('Logged out', ref('Message')) } },
    },
    '/auth/request-password-reset': {
      post: {
        tags: ['Auth'],
        summary: 'Email a reset link',
        description: 'Always returns 200. The emailed link goes to CLIENT_URL/auth/reset-password?token=…',
        requestBody: body('EmailRequest'),
        responses: { '200': ok('Accepted', ref('Message')) },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password with a reset token',
        description: 'Signs the user out of all sessions.',
        requestBody: body('ResetPasswordRequest'),
        responses: { '200': ok('Password changed', ref('Message')), '400': errors['400'] },
      },
    },
    '/auth/verify-email': {
      get: {
        tags: ['Auth'],
        summary: 'Verification link target (opened from the email)',
        parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '302': ok('Redirects to the frontend with ?verified=success|already|expired|invalid') },
      },
      post: {
        tags: ['Auth'],
        summary: 'Confirm an email address (if the frontend handles the token itself)',
        requestBody: body('TokenRequest'),
        responses: { '200': ok('Verified', ref('Message')), '400': errors['400'] },
      },
    },
    '/auth/resend-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Email a new verification link',
        description: 'Invalidates earlier links. At most once a minute.',
        security: auth,
        responses: {
          '200': ok('Sent', ref('Message')),
          '400': ok('Already verified'),
          '429': ok('Requested too recently'),
          '502': ok('Email provider rejected the message'),
        },
      },
    },

    /* ---------- Cart ---------- */
    '/cart': {
      get: { tags: ['Cart'], summary: 'Get cart', security: auth, responses: { '200': ok('Cart', data(ref('Cart'))), ...errors } },
      post: {
        tags: ['Cart'],
        summary: 'Add an item',
        security: auth,
        requestBody: body('AddToCartRequest'),
        responses: { '201': ok('Updated cart', data(ref('Cart'))), ...errors, '404': ok('Variant not available') },
      },
      delete: { tags: ['Cart'], summary: 'Empty the cart', security: auth, responses: { '200': ok('Empty cart', data(ref('Cart'))) } },
    },
    '/cart/{itemId}': {
      patch: {
        tags: ['Cart'],
        summary: 'Change quantity (0 removes)',
        security: auth,
        parameters: [path('itemId', 'Cart item ID (items[].id)')],
        requestBody: body('UpdateCartItemRequest'),
        responses: { '200': ok('Updated cart', data(ref('Cart'))), ...errors, '404': ok('Not in your cart') },
      },
      delete: {
        tags: ['Cart'],
        summary: 'Remove an item',
        security: auth,
        parameters: [path('itemId', 'Cart item ID (items[].id)')],
        responses: { '200': ok('Updated cart', data(ref('Cart'))), '404': ok('Not in your cart') },
      },
    },

    /* ---------- Orders ---------- */
    '/orders': {
      get: {
        tags: ['Orders'],
        summary: 'My orders',
        security: auth,
        parameters: pageParams,
        responses: { '200': ok('Orders, newest first', list('Order', true)) },
      },
      post: {
        tags: ['Orders'],
        summary: 'Check out the cart',
        description:
          'Creates a pending order from the server-side cart, applies the coupon and delivery-zone fee, reserves stock and empties the cart.',
        security: auth,
        requestBody: body('CreateOrderRequest'),
        responses: {
          '201': ok('Order placed', data(ref('Order'))),
          ...errors,
          '409': ok('An item became unavailable or went out of stock (details lists them)'),
        },
      },
    },
    '/orders/{orderId}': {
      get: {
        tags: ['Orders'],
        summary: 'Order with items',
        security: auth,
        parameters: [path('orderId')],
        responses: { '200': ok('Order', data(ref('Order'))), '404': ok('Not found') },
      },
    },
    '/orders/{orderId}/cancel': {
      post: {
        tags: ['Orders'],
        summary: 'Cancel an unpaid order',
        security: auth,
        parameters: [path('orderId')],
        responses: { '200': ok('Cancelled', data(ref('Order'))), '400': ok('Order is past pending') },
      },
    },

    /* ---------- Admin: catalogue ---------- */
    '/admin/products': {
      get: {
        tags: ['Admin: Catalogue'],
        summary: 'All products (any status)',
        security: auth,
        parameters: [query('status', { type: 'string', enum: ['draft', 'published', 'archived'] })],
        responses: { '200': ok('Products with variantCount and totalStock'), ...adminErrors },
      },
      post: {
        tags: ['Admin: Catalogue'],
        summary: 'Create product',
        security: auth,
        requestBody: body('CreateProductRequest'),
        responses: { '201': ok('Created'), ...adminErrors, '409': ok('Slug taken') },
      },
    },
    '/admin/products/{id}': {
      get: {
        tags: ['Admin: Catalogue'],
        summary: 'Product with variants, inventory, images and categories',
        security: auth,
        parameters: [path('id')],
        responses: { '200': ok('Product'), '404': ok('Not found') },
      },
      patch: {
        tags: ['Admin: Catalogue'],
        summary: 'Update product',
        security: auth,
        parameters: [path('id')],
        requestBody: body('UpdateProductRequest'),
        responses: { '200': ok('Updated'), ...adminErrors, '404': ok('Not found') },
      },
      delete: {
        tags: ['Admin: Catalogue'],
        summary: 'Soft-delete product',
        security: auth,
        parameters: [path('id')],
        responses: { '200': ok('Deleted'), '404': ok('Not found') },
      },
    },
    '/admin/products/{id}/categories': {
      put: {
        tags: ['Admin: Catalogue'],
        summary: "Replace a product's categories",
        security: auth,
        parameters: [path('id')],
        requestBody: body('SetCategoriesRequest'),
        responses: { '200': ok('Categories now assigned'), ...adminErrors },
      },
    },
    '/admin/products/{id}/images': {
      post: {
        tags: ['Admin: Catalogue'],
        summary: 'Attach an image (already uploaded to storage)',
        security: auth,
        parameters: [path('id')],
        requestBody: body('AddImageRequest'),
        responses: { '201': ok('Image added'), ...adminErrors },
      },
    },
    '/admin/images/{imageId}': {
      delete: {
        tags: ['Admin: Catalogue'],
        summary: 'Remove an image',
        security: auth,
        parameters: [path('imageId')],
        responses: { '200': ok('Deleted'), '404': ok('Not found') },
      },
    },
    '/admin/products/{productId}/variants': {
      post: {
        tags: ['Admin: Catalogue'],
        summary: 'Create variant (and its inventory row)',
        security: auth,
        parameters: [path('productId')],
        requestBody: body('CreateVariantRequest'),
        responses: { '201': ok('Created'), ...adminErrors, '409': ok('SKU or size/colour combination taken') },
      },
    },
    '/admin/variants/{variantId}': {
      patch: {
        tags: ['Admin: Catalogue'],
        summary: 'Update variant',
        security: auth,
        parameters: [path('variantId')],
        requestBody: body('UpdateVariantRequest'),
        responses: { '200': ok('Updated'), ...adminErrors, '404': ok('Not found') },
      },
      delete: {
        tags: ['Admin: Catalogue'],
        summary: 'Soft-delete variant',
        security: auth,
        parameters: [path('variantId')],
        responses: { '200': ok('Deleted'), '404': ok('Not found') },
      },
    },
    '/admin/categories': {
      get: { tags: ['Admin: Catalogue'], summary: 'Categories with product counts', security: auth, responses: { '200': ok('Categories') } },
      post: {
        tags: ['Admin: Catalogue'],
        summary: 'Create category',
        security: auth,
        requestBody: body('CategoryRequest'),
        responses: { '201': ok('Created'), ...adminErrors, '409': ok('Slug taken') },
      },
    },
    '/admin/categories/{id}': {
      patch: {
        tags: ['Admin: Catalogue'],
        summary: 'Update category',
        security: auth,
        parameters: [path('id')],
        requestBody: body('CategoryRequest'),
        responses: { '200': ok('Updated'), '404': ok('Not found') },
      },
      delete: {
        tags: ['Admin: Catalogue'],
        summary: 'Soft-delete category',
        security: auth,
        parameters: [path('id')],
        responses: { '200': ok('Deleted'), '404': ok('Not found') },
      },
    },

    /* ---------- Admin: inventory ---------- */
    '/admin/inventory/low-stock': {
      get: { tags: ['Admin: Inventory'], summary: 'Variants at or below their threshold', security: auth, responses: { '200': ok('Variants') } },
    },
    '/admin/inventory/{variantId}': {
      patch: {
        tags: ['Admin: Inventory'],
        summary: 'Set stock level / threshold / backorder',
        security: auth,
        parameters: [path('variantId')],
        requestBody: body('UpdateInventoryRequest'),
        responses: { '200': ok('Inventory row'), ...adminErrors, '404': ok('Not found') },
      },
    },
    '/admin/inventory/{variantId}/movements': {
      get: {
        tags: ['Admin: Inventory'],
        summary: 'Stock movement history (latest 200)',
        security: auth,
        parameters: [path('variantId')],
        responses: { '200': ok('Movements') },
      },
    },

    /* ---------- Admin: orders & customers ---------- */
    '/admin/orders': {
      get: {
        tags: ['Admin: Orders & Customers'],
        summary: 'All orders',
        security: auth,
        parameters: [query('status', { type: 'string', enum: ORDER_STATUSES }), ...pageParams],
        responses: { '200': ok('Orders', list('Order', true)) },
      },
    },
    '/admin/orders/{id}': {
      get: {
        tags: ['Admin: Orders & Customers'],
        summary: 'Order with items',
        security: auth,
        parameters: [path('id')],
        responses: { '200': ok('Order', data(ref('Order'))), '404': ok('Not found') },
      },
    },
    '/admin/orders/{id}/status': {
      patch: {
        tags: ['Admin: Orders & Customers'],
        summary: 'Change order status',
        security: auth,
        parameters: [path('id')],
        requestBody: body('UpdateOrderStatusRequest'),
        responses: {
          '200': ok('Updated order', data(ref('Order'))),
          '400': ok('Transition not allowed'),
          '409': ok('Not enough stock on hand to mark paid'),
        },
      },
    },
    '/admin/customers': {
      get: {
        tags: ['Admin: Orders & Customers'],
        summary: 'Customers with order totals',
        security: auth,
        parameters: [query('search', { type: 'string' }, 'Matches email, name or phone'), ...pageParams],
        responses: { '200': ok('Customers', list('Customer', true)) },
      },
    },
    '/admin/customers/{id}': {
      get: {
        tags: ['Admin: Orders & Customers'],
        summary: 'Customer with their orders',
        security: auth,
        parameters: [path('id')],
        responses: { '200': ok('Customer'), '404': ok('Not found') },
      },
    },
    '/admin/stats': {
      get: {
        tags: ['Admin: Orders & Customers'],
        summary: 'Dashboard numbers',
        security: auth,
        responses: { '200': ok('Stats', data(ref('Stats'))), ...adminErrors },
      },
    },
  },
};
