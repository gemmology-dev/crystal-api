/**
 * Admin Authentication Middleware
 * Validates admin password from Authorization header
 */

import type { Context, Next } from 'hono';

interface Env {
  ADMIN_PASSWORD: string;
}

/**
 * Middleware to protect admin routes with password authentication
 * Expects: Authorization: Bearer <password>
 */
export async function adminAuth(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Authorization header required' }, 401);
  }

  // Parse Bearer token
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return c.json({ error: 'Invalid authorization format. Use: Bearer <password>' }, 401);
  }

  const password = parts[1];

  // Check against environment secret
  if (!c.env.ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD not configured');
    return c.json({ error: 'Admin access not configured' }, 500);
  }

  if (password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Invalid admin password' }, 401);
  }

  // Password valid, continue to handler
  await next();
}
