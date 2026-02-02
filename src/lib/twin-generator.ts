/**
 * Twin geometry generation.
 * Ported from Python crystal_geometry.twins.generators
 *
 * Creates twinned crystal geometries using halfspace intersection.
 * Each twin type has a specific generator that computes the appropriate geometry.
 */

import type { CrystalGeometry, Face, Vector3 } from './crystal-geometry';
import type { HalfspaceData } from './halfspace';
import { computeHalfspaceIntersection, rotateHalfspaces, addClippingPlane } from './halfspace';
import { getTwinLaw, type TwinLaw } from './twin-laws';
import { rotationMatrixAxisAngle, type Mat3, type Vec3 } from './transforms';

/**
 * Parse twin specification from modifier string
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
 * Convert Vec3 to Vector3
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
 * Build edges from faces
 */
function buildEdges(faces: Face[], vertices: Vector3[]): [number, number][] {
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const vertexMap = new Map<string, number>();

  // Build vertex index map
  vertices.forEach((v, i) => {
    const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
    vertexMap.set(key, i);
  });

  for (const face of faces) {
    for (let i = 0; i < face.vertices.length; i++) {
      const v1 = face.vertices[i];
      const v2 = face.vertices[(i + 1) % face.vertices.length];

      const key1 = `${v1.x.toFixed(6)},${v1.y.toFixed(6)},${v1.z.toFixed(6)}`;
      const key2 = `${v2.x.toFixed(6)},${v2.y.toFixed(6)},${v2.z.toFixed(6)}`;

      const idx1 = vertexMap.get(key1);
      const idx2 = vertexMap.get(key2);

      if (idx1 !== undefined && idx2 !== undefined) {
        const edgeKey = idx1 < idx2 ? `${idx1}-${idx2}` : `${idx2}-${idx1}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push([idx1, idx2]);
        }
      }
    }
  }

  return edges;
}

/**
 * Merge two geometries into one
 */
function mergeGeometries(geom1: CrystalGeometry, geom2: CrystalGeometry): CrystalGeometry {
  const vertexOffset = geom1.vertices.length;

  // Combine vertices
  const vertices = [...geom1.vertices, ...geom2.vertices];

  // Combine faces
  const faces = [...geom1.faces, ...geom2.faces];

  // Combine edges with offset for second geometry
  const edges: [number, number][] = [
    ...geom1.edges,
    ...geom2.edges.map(([a, b]) => [a + vertexOffset, b + vertexOffset] as [number, number]),
  ];

  return { vertices, faces, edges };
}

/**
 * Generate dual crystal twin (two complete interpenetrating crystals)
 * Used for: Brazil, Carlsbad, Fluorite, Staurolite, Iron Cross
 */
function generateDualCrystalTwin(halfspaces: HalfspaceData, law: TwinLaw): CrystalGeometry {
  // Crystal 1: Complete crystal from original halfspaces
  const result1 = computeHalfspaceIntersection(halfspaces);
  const edges1 = buildEdges(result1.faces, result1.vertices);

  // Crystal 2: Complete crystal from rotated halfspaces
  const R = rotationMatrixAxisAngle(law.axis, law.angle);
  const rotatedHalfspaces = rotateHalfspaces(halfspaces, R);
  const result2 = computeHalfspaceIntersection(rotatedHalfspaces);
  const edges2 = buildEdges(result2.faces, result2.vertices);

  // Merge both crystals
  const geom1: CrystalGeometry = {
    vertices: result1.vertices,
    faces: result1.faces,
    edges: edges1,
  };

  const geom2: CrystalGeometry = {
    vertices: result2.vertices,
    faces: result2.faces,
    edges: edges2,
  };

  return mergeGeometries(geom1, geom2);
}

/**
 * Generate V-shaped contact twin (like Japan twin)
 * Two crystals meeting at composition plane at an angle
 */
function generateVShapedTwin(halfspaces: HalfspaceData, law: TwinLaw): CrystalGeometry {
  const axis = law.axis;
  const angle = law.angle;

  // Normalize axis
  const axisLen = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  const normAxis: Vec3 = {
    x: axis.x / axisLen,
    y: axis.y / axisLen,
    z: axis.z / axisLen,
  };

  // For 180° twins (reflection): use reflection across composition plane
  // For non-180° twins (Japan Law): clip and rotate
  const useReflection = Math.abs(angle - 180) < 1e-6;

  if (useReflection) {
    // Crystal 1: Clip at composition plane (keep positive side)
    const clipped1 = addClippingPlane(
      halfspaces,
      { x: -normAxis.x, y: -normAxis.y, z: -normAxis.z },
      0
    );
    const result1 = computeHalfspaceIntersection(clipped1);
    const edges1 = buildEdges(result1.faces, result1.vertices);

    // Crystal 2: Reflect vertices across composition plane
    const reflectedVertices = result1.vertices.map(v => {
      const d = v.x * normAxis.x + v.y * normAxis.y + v.z * normAxis.z;
      return {
        x: v.x - 2 * d * normAxis.x,
        y: v.y - 2 * d * normAxis.y,
        z: v.z - 2 * d * normAxis.z,
      };
    });

    // Reverse face winding for reflection
    const reflectedFaces = result1.faces.map(face => ({
      ...face,
      vertices: [...face.vertices].reverse().map(v => {
        const d = v.x * normAxis.x + v.y * normAxis.y + v.z * normAxis.z;
        return {
          x: v.x - 2 * d * normAxis.x,
          y: v.y - 2 * d * normAxis.y,
          z: v.z - 2 * d * normAxis.z,
        };
      }),
      normal: {
        x: -face.normal.x + 2 * (face.normal.x * normAxis.x + face.normal.y * normAxis.y + face.normal.z * normAxis.z) * normAxis.x,
        y: -face.normal.y + 2 * (face.normal.x * normAxis.x + face.normal.y * normAxis.y + face.normal.z * normAxis.z) * normAxis.y,
        z: -face.normal.z + 2 * (face.normal.x * normAxis.x + face.normal.y * normAxis.y + face.normal.z * normAxis.z) * normAxis.z,
      },
    }));

    const geom1: CrystalGeometry = {
      vertices: result1.vertices,
      faces: result1.faces,
      edges: edges1,
    };

    const geom2: CrystalGeometry = {
      vertices: reflectedVertices,
      faces: reflectedFaces,
      edges: edges1.map(([a, b]) => [a, b] as [number, number]),
    };

    return mergeGeometries(geom1, geom2);
  } else {
    // Non-180° twin (Japan Law): clip both sides, rotate Crystal 2
    // Crystal 1: Clip at composition plane (keep positive side)
    const clipped1 = addClippingPlane(
      halfspaces,
      { x: -normAxis.x, y: -normAxis.y, z: -normAxis.z },
      0
    );
    const result1 = computeHalfspaceIntersection(clipped1);
    const edges1 = buildEdges(result1.faces, result1.vertices);

    // Crystal 2: Clip opposite side
    const clipped2 = addClippingPlane(
      halfspaces,
      { x: normAxis.x, y: normAxis.y, z: normAxis.z },
      0
    );
    const result2 = computeHalfspaceIntersection(clipped2);

    // Rotate Crystal 2 vertices
    const R = rotationMatrixAxisAngle(law.axis, angle);
    const rotatedVertices = result2.vertices.map(v => ({
      x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
      y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
      z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z,
    }));

    const rotatedFaces = result2.faces.map(face => ({
      ...face,
      vertices: face.vertices.map(v => ({
        x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
        y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
        z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z,
      })),
      normal: {
        x: R[0][0] * face.normal.x + R[0][1] * face.normal.y + R[0][2] * face.normal.z,
        y: R[1][0] * face.normal.x + R[1][1] * face.normal.y + R[1][2] * face.normal.z,
        z: R[2][0] * face.normal.x + R[2][1] * face.normal.y + R[2][2] * face.normal.z,
      },
    }));

    const edges2 = buildEdges(result2.faces, result2.vertices);

    const geom1: CrystalGeometry = {
      vertices: result1.vertices,
      faces: result1.faces,
      edges: edges1,
    };

    const geom2: CrystalGeometry = {
      vertices: rotatedVertices,
      faces: rotatedFaces,
      edges: edges2,
    };

    return mergeGeometries(geom1, geom2);
  }
}

/**
 * Generate contact rotation twin (like spinel law macle)
 * Clip at composition plane, rotate one half
 */
function generateContactRotationTwin(halfspaces: HalfspaceData, law: TwinLaw): CrystalGeometry {
  const axis = law.axis;
  const angle = law.angle;

  // Normalize axis
  const axisLen = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  const normAxis: Vec3 = {
    x: axis.x / axisLen,
    y: axis.y / axisLen,
    z: axis.z / axisLen,
  };

  // Crystal 1: Clip at composition plane (keep positive side)
  const clipped1 = addClippingPlane(
    halfspaces,
    { x: -normAxis.x, y: -normAxis.y, z: -normAxis.z },
    0
  );
  const result1 = computeHalfspaceIntersection(clipped1);
  const edges1 = buildEdges(result1.faces, result1.vertices);

  // Crystal 2: Rotate Crystal 1 by twin angle
  const R = rotationMatrixAxisAngle(law.axis, angle);
  const rotatedVertices = result1.vertices.map(v => ({
    x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
    y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
    z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z,
  }));

  const rotatedFaces = result1.faces.map(face => ({
    ...face,
    vertices: face.vertices.map(v => ({
      x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
      y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
      z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z,
    })),
    normal: {
      x: R[0][0] * face.normal.x + R[0][1] * face.normal.y + R[0][2] * face.normal.z,
      y: R[1][0] * face.normal.x + R[1][1] * face.normal.y + R[1][2] * face.normal.z,
      z: R[2][0] * face.normal.x + R[2][1] * face.normal.y + R[2][2] * face.normal.z,
    },
  }));

  const geom1: CrystalGeometry = {
    vertices: result1.vertices,
    faces: result1.faces,
    edges: edges1,
  };

  const geom2: CrystalGeometry = {
    vertices: rotatedVertices,
    faces: rotatedFaces,
    edges: edges1.map(([a, b]) => [a, b] as [number, number]),
  };

  return mergeGeometries(geom1, geom2);
}

/**
 * Generate cyclic twin (like trilling - 3 crystals at 120°)
 * Uses unified approach: collect all rotated halfspaces and compute single intersection
 */
function generateCyclicTwin(halfspaces: HalfspaceData, law: TwinLaw): CrystalGeometry {
  const n = Math.round(360 / law.angle);

  // Collect all halfspaces from all rotated orientations
  const allNormals: Vector3[] = [];
  const allDistances: number[] = [];

  for (let i = 0; i < n; i++) {
    const angle = law.angle * i;
    const R = rotationMatrixAxisAngle(law.axis, angle);

    // Rotate each halfspace normal
    for (let j = 0; j < halfspaces.normals.length; j++) {
      const n = halfspaces.normals[j];
      const rotatedNormal: Vector3 = {
        x: R[0][0] * n.x + R[0][1] * n.y + R[0][2] * n.z,
        y: R[1][0] * n.x + R[1][1] * n.y + R[1][2] * n.z,
        z: R[2][0] * n.x + R[2][1] * n.y + R[2][2] * n.z,
      };
      allNormals.push(rotatedNormal);
      allDistances.push(halfspaces.distances[j]);
    }
  }

  // Compute unified intersection of all halfspaces
  const unifiedHalfspaces: HalfspaceData = {
    normals: allNormals,
    distances: allDistances,
  };

  const result = computeHalfspaceIntersection(unifiedHalfspaces);
  const edges = buildEdges(result.faces, result.vertices);

  return {
    vertices: result.vertices,
    faces: result.faces,
    edges,
  };
}

/**
 * Generate twinned crystal geometry from halfspace data
 */
export function generateTwinnedGeometry(
  halfspaces: HalfspaceData,
  twinName: string
): CrystalGeometry {
  const law = getTwinLaw(twinName);
  if (!law) {
    console.warn(`Unknown twin law: ${twinName}, returning base geometry`);
    const result = computeHalfspaceIntersection(halfspaces);
    return {
      vertices: result.vertices,
      faces: result.faces,
      edges: buildEdges(result.faces, result.vertices),
    };
  }

  // Handle single_crystal twins (no external change)
  if (law.renderMode === 'single_crystal') {
    const result = computeHalfspaceIntersection(halfspaces);
    return {
      vertices: result.vertices,
      faces: result.faces,
      edges: buildEdges(result.faces, result.vertices),
    };
  }

  switch (law.renderMode) {
    case 'dual_crystal':
      return generateDualCrystalTwin(halfspaces, law);

    case 'v_shaped':
      return generateVShapedTwin(halfspaces, law);

    case 'contact_rotation':
      return generateContactRotationTwin(halfspaces, law);

    case 'cyclic':
      return generateCyclicTwin(halfspaces, law);

    case 'unified':
    default:
      // For unified, fall back to dual crystal
      return generateDualCrystalTwin(halfspaces, law);
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
