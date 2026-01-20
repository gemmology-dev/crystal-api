import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cache } from 'hono/cache';
import { renderHandler } from './handlers/render';
import { validateHandler } from './handlers/validate';
import { exportSTLHandler, exportGLTFHandler } from './handlers/export';

export interface Env {
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS configuration
app.use('/*', cors({
  origin: ['https://gemmology.dev', 'http://localhost:4321', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Health check
app.get('/', (c) => c.json({
  service: 'gemmology-api',
  version: '1.0.0',
  status: 'healthy',
  endpoints: ['/api/render', '/api/validate', '/api/export/stl', '/api/export/gltf']
}));

// API routes
app.post('/api/render', renderHandler);
app.get('/api/render', renderHandler);

app.post('/api/validate', validateHandler);

app.post('/api/export/stl', exportSTLHandler);
app.post('/api/export/gltf', exportGLTFHandler);

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
