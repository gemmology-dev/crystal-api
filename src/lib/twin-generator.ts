/**
 * Twin geometry generation.
 * Creates twinned crystal geometries by transforming and combining base crystals.
 */

import type { CrystalGeometry, Face, Vector3 } from './crystal-geometry';
import { getTwinLaw, type TwinLaw } from './twin-laws';
import { rotationMatrixAxisAngle, mat3MulVec3, reflectionMatrix, type Mat3, type Vec3 } from './transforms';

/**
 * Parse twin specification from modifier string
 * Handles: "twin(brazil)", "twin(japan)", etc.
 */
export function parseTwinSpec(modifierStr: string): string | null {
  const match = modifierStr.match(/twin\s*\(\s*(\w+)\s*\)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if a modifier string contains a twin specification
 */
export function hasTwin(modifierStr: string | undefined): boolean {
  if (!modifierStr) return false;
  return /twin\s*\(/i.test(modifierStr);
}

/**
 * Convert Vec3 to Vector3 (our geometry format)
 */
function toVector3(v: Vec3): Vector3 {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Convert Vector3 to Vec3
 */
function toVec3(v: Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * Transform a vertex using a 3x3 rotation matrix
 */
function transformVertex(v: Vector3, matrix: Mat3): Vector3 {
  const result = mat3MulVec3(matrix, toVec3(v));
  return toVector3(result);
}

/**
 * Transform all vertices in a geometry
 */
function transformGeometry(geom: CrystalGeometry, matrix: Mat3): CrystalGeometry {
  const newVertices = geom.vertices.map(v => transformVertex(v, matrix));
  const newFaces = geom.faces.map(face => ({
    ...face,
    vertices: face.vertices.map(v => transformVertex(v, matrix)),
    normal: transformVertex(face.normal, matrix),
  }));

  return {
    vertices: newVertices,
    faces: newFaces,
    edges: geom.edges,
  };
}

/**
 * Merge two geometries into one
 */
function mergeGeometries(geom1: CrystalGeometry, geom2: CrystalGeometry): CrystalGeometry {
  const vertexOffset = geom1.vertices.length;

  // Combine vertices
  const vertices = [...geom1.vertices, ...geom2.vertices];

  // Combine faces (no need to adjust indices since faces store actual vertices)
  const faces = [...geom1.faces, ...geom2.faces];

  // Combine edges with offset for second geometry
  const edges: [number, number][] = [
    ...geom1.edges,
    ...geom2.edges.map(([a, b]) => [a + vertexOffset, b + vertexOffset] as [number, number]),
  ];

  return { vertices, faces, edges };
}

/**
 * Generate dual crystal twin (two interpenetrating crystals)
 */
function generateDualCrystalTwin(baseGeom: CrystalGeometry, law: TwinLaw): CrystalGeometry {
  // Create rotation matrix for the twin
  const rotationMatrix = rotationMatrixAxisAngle(law.axis, law.angle);

  // Transform the second crystal
  const twinGeom = transformGeometry(baseGeom, rotationMatrix);

  // Merge both crystals
  return mergeGeometries(baseGeom, twinGeom);
}

/**
 * Generate V-shaped contact twin (like Japan twin)
 */
function generateVShapedTwin(baseGeom: CrystalGeometry, law: TwinLaw): CrystalGeometry {
  // For V-shaped twins, we reflect one half across the twin plane
  // The twin plane normal is perpendicular to the twin axis

  // Create rotation matrix for the angled orientation
  const rotationMatrix = rotationMatrixAxisAngle(law.axis, law.angle);

  // Transform and merge
  const twinGeom = transformGeometry(baseGeom, rotationMatrix);
  return mergeGeometries(baseGeom, twinGeom);
}

/**
 * Generate contact rotation twin (like spinel law)
 */
function generateContactRotationTwin(baseGeom: CrystalGeometry, law: TwinLaw): CrystalGeometry {
  // Create rotation matrix
  const rotationMatrix = rotationMatrixAxisAngle(law.axis, law.angle);

  // For contact twins, we clip each crystal at the composition plane
  // For simplicity, we'll just merge the two rotated crystals
  const twinGeom = transformGeometry(baseGeom, rotationMatrix);
  return mergeGeometries(baseGeom, twinGeom);
}

/**
 * Generate cyclic twin (like trilling - 3 crystals at 120°)
 */
function generateCyclicTwin(baseGeom: CrystalGeometry, law: TwinLaw): CrystalGeometry {
  const n = Math.round(360 / law.angle); // Number of crystals in the cycle
  let result = baseGeom;

  for (let i = 1; i < n; i++) {
    const angle = law.angle * i;
    const rotationMatrix = rotationMatrixAxisAngle(law.axis, angle);
    const rotatedGeom = transformGeometry(baseGeom, rotationMatrix);
    result = mergeGeometries(result, rotatedGeom);
  }

  return result;
}

/**
 * Generate twinned crystal geometry
 */
export function generateTwinnedGeometry(
  baseGeom: CrystalGeometry,
  twinName: string
): CrystalGeometry {
  const law = getTwinLaw(twinName);
  if (!law) {
    console.warn(`Unknown twin law: ${twinName}, returning base geometry`);
    return baseGeom;
  }

  // Handle single_crystal twins (no external change)
  if (law.renderMode === 'single_crystal') {
    return baseGeom;
  }

  switch (law.renderMode) {
    case 'dual_crystal':
      return generateDualCrystalTwin(baseGeom, law);

    case 'v_shaped':
      return generateVShapedTwin(baseGeom, law);

    case 'contact_rotation':
      return generateContactRotationTwin(baseGeom, law);

    case 'cyclic':
      return generateCyclicTwin(baseGeom, law);

    case 'unified':
    default:
      // For unified, we'd need halfspace intersection
      // Fall back to dual crystal for now
      return generateDualCrystalTwin(baseGeom, law);
  }
}

/**
 * Check if a twin law is supported
 */
export function isTwinSupported(twinName: string): boolean {
  return getTwinLaw(twinName) !== null;
}

/**
 * Get list of supported twin laws
 */
export function getSupportedTwins(): string[] {
  return [
    'spinel',
    'brazil',
    'dauphine',
    'japan',
    'carlsbad',
    'albite',
    'fluorite',
    'trilling',
    'staurolite_60',
    'staurolite_90',
    'iron_cross',
    'manebach',
    'baveno',
    'gypsum_swallow',
  ];
}
