/**
 * Render Handler - /api/render endpoint
 * Renders CDL expressions to SVG
 */

import type { Context } from 'hono';
import { parseCDL } from '../lib/cdl-parser';
import { generateGeometry } from '../lib/crystal-geometry';
import { renderToSVG } from '../lib/svg-renderer';

interface RenderRequest {
  cdl: string;
  elev?: number;
  azim?: number;
  width?: number;
  height?: number;
}

export async function renderHandler(c: Context): Promise<Response> {
  try {
    let cdl: string;
    let elev = 30;
    let azim = -45;
    let width = 300;
    let height = 300;

    // Handle both GET and POST
    if (c.req.method === 'GET') {
      cdl = c.req.query('cdl') || '';
      elev = parseFloat(c.req.query('elev') || '30');
      azim = parseFloat(c.req.query('azim') || '-45');
      width = parseInt(c.req.query('width') || '300', 10);
      height = parseInt(c.req.query('height') || '300', 10);
    } else {
      const body = await c.req.json<RenderRequest>();
      cdl = body.cdl || '';
      elev = body.elev ?? 30;
      azim = body.azim ?? -45;
      width = body.width ?? 300;
      height = body.height ?? 300;
    }

    // Validate CDL
    const parseResult = parseCDL(cdl);
    if (!parseResult.valid || !parseResult.parsed) {
      return c.json({ error: parseResult.error || 'Invalid CDL' }, 400);
    }

    // Clamp angles
    elev = Math.max(-90, Math.min(90, elev));
    azim = Math.max(-180, Math.min(180, azim));

    // Generate geometry
    const geometry = generateGeometry(parseResult.parsed);

    // Render to SVG
    const svg = renderToSVG(geometry, {
      width,
      height,
      elevation: elev,
      azimuth: azim,
      scale: Math.min(width, height) * 0.35,
    });

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Render error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Render failed' },
      500
    );
  }
}
