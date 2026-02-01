/**
 * Crystal modification operations (elongate, flatten, etc.)
 * Ported from Python crystal_geometry.modifications
 */

import type { Vec3 } from './transforms';

export interface Modification {
  type: 'elongate' | 'flatten' | 'scale';
  axis: 'a' | 'b' | 'c';
  factor: number;
}

/**
 * Parse a modification string like "elongate(c:2.0)" or "flatten(a:0.5)"
 */
export function parseModification(modStr: string): Modification | null {
  // Match patterns like: elongate(c:2.0), flatten(a:0.5), scale(b:1.5)
  const match = modStr.match(/^(elongate|flatten|scale)\s*\(\s*([abc])\s*:\s*([\d.]+)\s*\)$/i);
  if (!match) return null;

  const type = match[1].toLowerCase() as Modification['type'];
  const axis = match[2].toLowerCase() as Modification['axis'];
  const factor = parseFloat(match[3]);

  if (isNaN(factor) || factor <= 0) return null;

  return { type, axis, factor };
}

/**
 * Parse multiple modifications from a modifier string
 * Handles: "elongate(c:2.0) | flatten(a:0.5)" or just "elongate(c:2.0)"
 */
export function parseModifications(modifierStr: string): Modification[] {
  const modifications: Modification[] = [];

  // Split by | and process each part
  const parts = modifierStr.split('|').map(s => s.trim());

  for (const part of parts) {
    // Skip twin modifiers
    if (part.startsWith('twin(')) continue;

    const mod = parseModification(part);
    if (mod) {
      modifications.push(mod);
    }
  }

  return modifications;
}

/**
 * Apply a modification to a vertex
 */
export function applyModificationToVertex(v: Vec3, mod: Modification): Vec3 {
  const result = { ...v };

  // Determine effective scale factor
  let scale = mod.factor;
  if (mod.type === 'flatten') {
    scale = 1 / mod.factor; // Flatten reduces the dimension
  }

  // Apply to appropriate axis
  switch (mod.axis) {
    case 'a':
      result.x *= scale;
      break;
    case 'b':
      result.y *= scale;
      break;
    case 'c':
      result.z *= scale;
      break;
  }

  return result;
}

/**
 * Apply all modifications to a vertex
 */
export function applyModificationsToVertex(v: Vec3, mods: Modification[]): Vec3 {
  let result = { ...v };
  for (const mod of mods) {
    result = applyModificationToVertex(result, mod);
  }
  return result;
}

/**
 * Apply modifications to all vertices in an array
 */
export function applyModificationsToVertices(vertices: Vec3[], mods: Modification[]): Vec3[] {
  if (mods.length === 0) return vertices;
  return vertices.map(v => applyModificationsToVertex(v, mods));
}

/**
 * Get the scale factors for a/b/c axes from modifications
 */
export function getScaleFactors(mods: Modification[]): { a: number; b: number; c: number } {
  const scales = { a: 1, b: 1, c: 1 };

  for (const mod of mods) {
    let factor = mod.factor;
    if (mod.type === 'flatten') {
      factor = 1 / factor;
    }
    scales[mod.axis] *= factor;
  }

  return scales;
}
