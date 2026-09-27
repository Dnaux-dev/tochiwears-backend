/**
 * Tochiwears OpenAPI 3.0 Specification Generator
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Tochiwears E-Commerce API',
    description: 'Official REST API documentation and payload specs for Tochiwears backend service.',
    version: '1.0.0',
    contact: {
      name: 'Tochiwears Engineering',
      email: 'dnauxdev@gmail.com',
    },
  },
  servers: [
    {
      url: 'https://tochiwears-backend.onrender.com',
      description: 'Production Server (Render)',
    },
    {
      url: 'http://localhost:3000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token',
        description: 'Provide session token received from /auth/login or /auth/signup',
      },
    },
    schemas: {
      SignupRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'customer@example.com' },
          password: { type: 'string', minLength: 8, example: 'SecurePassword123' },
          firstName: { type: 'string', example: 'John' },
          lastName: { type: 'string', example: 'Doe' },
          phone: { type: 'string', example: '+2348012345678' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'customer@example.com' },
          password: { type: 'string', example: 'SecurePassword123' },
        },
      },
      PasswordResetRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', example: 'customer@example.com' },
        },
      },
      PasswordResetConfirmRequest: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string', example: 'reset_token_hex_string' },
          newPassword: { type: 'string', minLength: 8, example: 'NewSecurePassword123' },
        },
      },
      VerifyEmailRequest: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', example: 'verification_token_hex_string' },
        },
      },
      AddToCartRequest: {
        type: 'object',
        required: ['variantId', 'quantity'],
        properties: {
          variantId: { type: 'string', format: 'uuid', example: '018f23a4-b5c6-7d8e-9f0a-1b2c3d4e5f6a' },
          quantity: { type: 'integer', minimum: 1, example: 2 },
        },
      },
      UpdateCartItemRequest: {
        type: 'object',
        required: ['quantity'],
        properties: {
          quantity: { type: 'integer', minimum: 0, example: 3 },
        },
      },
      CreateOrderRequest: {
        type: 'object',
        required: ['deliveryAddress', 'deliveryCity', 'deliveryState'],
        properties: {
          deliveryAddress: { type: 'string', example: '12 Marina Street, Victoria Island' },
          deliveryCity: { type: 'string', example: 'Lagos' },
          deliveryState: { type: 'string', enum: ['Lagos', 'Abuja', 'Ibadan', 'Kano', 'Others'], example: 'Lagos' },
          deliveryPostalCode: { type: 'string', example: '100001' },
          customerNotes: { type: 'string', example: 'Call before delivery' },
          couponCode: { type: 'string', example: 'WELCOME10' },
        },
      },
      CreateProductRequest: {
        type: 'object',
        required: ['slug', 'name'],
        properties: {
          slug: { type: 'string', example: 'black-oversized-hoodie' },
          name: { type: 'string', example: 'Black Oversized Hoodie' },
          description: { type: 'string', example: 'Premium heavyweight cotton hoodie' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'], example: 'published' },
          featured: { type: 'boolean', example: true },
          metaTitle: { type: 'string', example: 'Buy Black Oversized Hoodie' },
          metaDescription: { type: 'string', example: 'Shop premium streetwear at Tochiwears' },
        },
      },
      UpdateProductRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Black Oversized Hoodie v2' },
          description: { type: 'string', example: 'Updated product description' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'], example: 'published' },
          featured: { type: 'boolean', example: true },
        },
      },
      CreateVariantRequest: {
        type: 'object',
        required: ['sku', 'priceKobo'],
        properties: {
          sku: { type: 'string', example: 'HD-BLK-L' },
          size: { type: 'string', example: 'L' },
          colour: { type: 'string', example: 'Black' },
          priceKobo: { type: 'integer', description: 'Price in Kobo (e.g. 2500000 = ₦25,000)', example: 2500000 },
          compareAtPriceKobo: { type: 'integer', example: 3000000 },
          weightGrams: { type: 'integer', example: 750 },
        },
      },
      UpdateInventoryRequest: {
        type: 'object',
        required: ['quantity'],
        properties: {
          quantity: { type: 'integer', example: 50 },
          reason: { type: 'string', enum: ['restock', 'sale', 'return', 'adjustment', 'damage'], example: 'restock' },
          note: { type: 'string', example: 'Supplier batch #204' },
        },
      },
      CreateCategoryRequest: {
        type: 'object',
        required: ['slug', 'name'],
        properties: {
          slug: { type: 'string', example: 'hoodies' },
          name: { type: 'string', example: 'Hoodies & Sweatshirts' },
          description: { type: 'string', example: 'Outerwear category' },
          parentId: { type: 'string', format: 'uuid', example: null },
          position: { type: 'integer', example: 1 },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health Check',
        description: 'Verify system status & connection.',
        responses: {
          '200': { description: 'System healthy', content: { 'application/json': { example: { status: 'ok', timestamp: '2026-09-27T18:00:00.000Z' } } } },
        },
      },
    },
    '/api/products': {
      get: {
        summary: 'List Published Products',
        tags: ['Products (Public)'],
        responses: {
          '200': {
            description: 'List of published products',
            content: {
              'application/json': {
                example: {
                  data: [
                    {
                      id: '019fd7b0-2cdc-75ef-a181-684f689dde25',
                      slug: 'black-hoodie',
                      name: 'Black Hoodie',
                      status: 'published',
                      featured: true,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/products/{slug}': {
      get: {
        summary: 'Get Product Details',
        tags: ['Products (Public)'],
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' }, example: 'black-hoodie' }],
        responses: {
          '200': { description: 'Product object with variants & available inventory' },
          '404': { description: 'Product not found' },
        },
      },
    },
    '/auth/signup': {
      post: {
        summary: 'Register User',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SignupRequest' } } },
        },
        responses: {
          '201': {
            description: 'User registered successfully',
            content: {
              'application/json': {
                example: {
                  data: { userId: 'uuid', email: 'customer@example.com', role: 'customer' },
                  token: 'session_token_string',
                },
              },
            },
          },
          '400': { description: 'Validation error or email already exists' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'User Login',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                example: {
                  data: { userId: 'uuid', email: 'customer@example.com', role: 'customer' },
                  token: 'session_token_string',
                },
              },
            },
          },
          '401': { description: 'Invalid email or password' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get Current Profile',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Authenticated user profile' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Logout',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Logged out successfully' },
        },
      },
    },
    '/auth/request-password-reset': {
      post: {
        summary: 'Request Password Reset',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordResetRequest' } } },
        },
        responses: {
          '200': { description: 'Reset email sent if account exists' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        summary: 'Reset Password',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PasswordResetConfirmRequest' } } },
        },
        responses: {
          '200': { description: 'Password reset successful' },
        },
      },
    },
    '/auth/verify-email': {
      post: {
        summary: 'Verify Email',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyEmailRequest' } } },
        },
        responses: {
          '200': { description: 'Email verified' },
        },
      },
    },
    '/cart': {
      get: {
        summary: 'Get Cart',
        tags: ['Cart'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Cart content with items and totals' } },
      },
      post: {
        summary: 'Add Item to Cart',
        tags: ['Cart'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AddToCartRequest' } } },
        },
        responses: { '201': { description: 'Added to cart' }, '400': { description: 'Insufficient stock or validation error' } },
      },
      delete: {
        summary: 'Clear Cart',
        tags: ['Cart'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Cart cleared' } },
      },
    },
    '/cart/{itemId}': {
      patch: {
        summary: 'Update Cart Item Quantity',
        tags: ['Cart'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateCartItemRequest' } } },
        },
        responses: { '200': { description: 'Cart updated' } },
      },
      delete: {
        summary: 'Remove Item from Cart',
        tags: ['Cart'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Item removed' } },
      },
    },
    '/orders': {
      get: {
        summary: 'List Customer Orders',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of past orders' } },
      },
      post: {
        summary: 'Create Order from Cart',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateOrderRequest' } } },
        },
        responses: { '201': { description: 'Order created' }, '400': { description: 'Cart empty or invalid delivery details' } },
      },
    },
    '/orders/{orderId}': {
      get: {
        summary: 'Get Order Details',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Order details with line items' } },
      },
    },
    '/admin/stats': {
      get: {
        summary: 'Dashboard Analytics',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Overview stats (products, stock, low stock count)' } },
      },
    },
    '/admin/products': {
      get: {
        summary: 'List All Products (Admin)',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'All products including drafts' } },
      },
      post: {
        summary: 'Create Product',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProductRequest' } } },
        },
        responses: { '201': { description: 'Product created' } },
      },
    },
    '/admin/products/{id}': {
      patch: {
        summary: 'Update Product',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProductRequest' } } },
        },
        responses: { '200': { description: 'Product updated' } },
      },
      delete: {
        summary: 'Soft Delete Product',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Product deleted' } },
      },
    },
    '/admin/products/{productId}/variants': {
      post: {
        summary: 'Create Product Variant',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateVariantRequest' } } },
        },
        responses: { '201': { description: 'Variant created' } },
      },
    },
    '/admin/inventory/{variantId}': {
      patch: {
        summary: 'Update Stock Level',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'variantId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateInventoryRequest' } } },
        },
        responses: { '200': { description: 'Inventory updated & movement logged' } },
      },
    },
    '/admin/categories': {
      get: {
        summary: 'List Categories',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of categories' } },
      },
      post: {
        summary: 'Create Category',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateCategoryRequest' } } },
        },
        responses: { '201': { description: 'Category created' } },
      },
    },
  },
};
