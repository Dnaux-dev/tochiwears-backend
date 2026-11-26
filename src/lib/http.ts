/**
 * Tochiwears — HTTP helpers
 * Request parsing and the app-wide error handler.
 */

import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

/** Throw from any handler to return `{ error, details? }` with the given status. */
export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Parse and validate a JSON body, throwing a 400 ApiError on failure. */
export async function parseBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }
  return validate(schema, body);
}

/** Validate query-string parameters, throwing a 400 ApiError on failure. */
export function parseQuery<T extends z.ZodType>(c: Context, schema: T): z.output<T> {
  return validate(schema, c.req.query());
}

function validate<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'Validation error', z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}

/** Postgres error code, looking through drizzle's DrizzleQueryError wrapper. */
function pgErrorCode(err: unknown): string | undefined {
  let current: any = err;
  for (let depth = 0; current && depth < 3; depth++) {
    if (typeof current.code === 'string') return current.code;
    current = current.cause;
  }
  return undefined;
}

const PG_ERRORS: Record<string, [ContentfulStatusCode, string]> = {
  '23505': [409, 'A record with that value already exists'],
  '23503': [409, 'Related record is missing or still in use'],
  '23514': [400, 'Value is out of the allowed range'],
  '22P02': [400, 'Invalid identifier or value format'],
};

/** Registered with `app.onError`. Never leaks SQL or stack traces to clients. */
export function handleError(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json(
      { error: err.message, ...(err.details !== undefined && { details: err.details }) },
      err.status,
    );
  }
  if (err instanceof z.ZodError) {
    return c.json({ error: 'Validation error', details: z.flattenError(err).fieldErrors }, 400);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  const mapped = PG_ERRORS[pgErrorCode(err) ?? ''];
  if (mapped) {
    return c.json({ error: mapped[1] }, mapped[0]);
  }

  console.error(`[${c.req.method} ${c.req.path}]`, err);
  return c.json({ error: 'Internal server error' }, 500);
}
