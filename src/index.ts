import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cache } from 'hono/cache';
import { renderHandler } from './handlers/render';
import { validateHandler } from './handlers/validate';
import { exportSTLHandler, exportGLTFHandler } from './handlers/export';
import { verifyCodeHandler, requestAccessHandler } from './handlers/auth';
import {
  listRequestsHandler,
  approveRequestHandler,
  rejectRequestHandler,
  listCodesHandler,
  generateCodeHandler,
  revokeCodeHandler,
} from './handlers/admin';
import { adminAuth } from './middleware/adminAuth';

export interface Env {
  ENVIRONMENT: string;
  // KV Namespaces
  INVITE_CODES: KVNamespace;
  CODE_REQUESTS: KVNamespace;
  // Secrets (set via wrangler secret put)
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS configuration
app.use('/*', cors({
  origin: ['https://gemmology.dev', 'http://localhost:4321', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Health check
app.get('/', (c) => c.json({
  service: 'gemmology-api',
  version: '1.0.0',
  status: 'healthy',
  endpoints: [
    '/api/render',
    '/api/validate',
    '/api/export/stl',
    '/api/export/gltf',
    '/api/auth/verify',
    '/api/auth/request',
    '/api/admin/*',
  ]
}));

// API routes
app.post('/api/render', renderHandler);
app.get('/api/render', renderHandler);

app.post('/api/validate', validateHandler);

app.post('/api/export/stl', exportSTLHandler);
app.post('/api/export/gltf', exportGLTFHandler);

// Auth routes
app.post('/api/auth/verify', verifyCodeHandler);
app.post('/api/auth/request', requestAccessHandler);

// Admin routes (password protected)
app.use('/api/admin/*', adminAuth);
app.get('/api/admin/requests', listRequestsHandler);
app.post('/api/admin/requests/:id/approve', approveRequestHandler);
app.post('/api/admin/requests/:id/reject', rejectRequestHandler);
app.get('/api/admin/codes', listCodesHandler);
app.post('/api/admin/codes', generateCodeHandler);
app.delete('/api/admin/codes/:code', revokeCodeHandler);

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
