/**
 * Export Handlers - /api/export/* endpoints
 * Exports crystal geometry to various formats (STL, glTF)
 */

import type { Context } from 'hono';
import { parseCDL } from '../lib/cdl-parser';
import { generateGeometry } from '../lib/crystal-geometry';
import { renderToSTL, renderToGLTF } from '../lib/svg-renderer';

interface ExportRequest {
  cdl: string;
  scale?: number;
}

/**
 * Export to STL format
 * POST /api/export/stl
 */
export async function exportSTLHandler(c: Context): Promise<Response> {
  try {
    const body = await c.req.json<ExportRequest>();
    const { cdl, scale = 10 } = body;

    // Validate CDL
    const parseResult = parseCDL(cdl);
    if (!parseResult.valid || !parseResult.parsed) {
      return c.json({ error: parseResult.error || 'Invalid CDL' }, 400);
    }

    // Validate scale
    const scaleValue = Math.max(1, Math.min(100, scale));

    // Generate geometry
    const geometry = generateGeometry(parseResult.parsed);

    // Render to STL
    const stl = renderToSTL(geometry, scaleValue);

    return new Response(stl, {
      headers: {
        'Content-Type': 'model/stl',
        'Content-Disposition': 'attachment; filename="crystal.stl"',
      },
    });
  } catch (error) {
    console.error('STL export error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      500
    );
  }
}

/**
 * Export to glTF format
 * POST /api/export/gltf
 */
export async function exportGLTFHandler(c: Context): Promise<Response> {
  try {
    const body = await c.req.json<ExportRequest>();
    const { cdl, scale = 1 } = body;

    // Validate CDL
    const parseResult = parseCDL(cdl);
    if (!parseResult.valid || !parseResult.parsed) {
      return c.json({ error: parseResult.error || 'Invalid CDL' }, 400);
    }

    // Validate scale
    const scaleValue = Math.max(0.1, Math.min(10, scale));

    // Generate geometry
    const geometry = generateGeometry(parseResult.parsed);

    // Render to glTF
    const gltf = renderToGLTF(geometry, scaleValue);

    return c.json(gltf, 200, {
      'Content-Disposition': 'attachment; filename="crystal.gltf"',
    });
  } catch (error) {
    console.error('glTF export error:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      500
    );
  }
}
