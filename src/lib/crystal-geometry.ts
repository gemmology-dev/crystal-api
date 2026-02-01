/**
 * Crystal Geometry Engine - JavaScript implementation
 * Generates 3D crystal geometry using half-space intersection algorithm
 */

import type { CDLParseResult, MillerIndex, ModificationSpec } from './cdl-parser';
import { generateTwinnedGeometry } from './twin-generator';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Face {
  vertices: Vector3[];
  normal: Vector3;
  millerIndex?: MillerIndex;
}

export interface CrystalGeometry {
  vertices: Vector3[];
  faces: Face[];
  edges: [number, number][];
}

// Crystal system parameters (unit cell ratios and angles)
const SYSTEM_PARAMS: Record<string, { a: number; b: number; c: number; alpha: number; beta: number; gamma: number }> = {
  cubic: { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 },
  tetragonal: { a: 1, b: 1, c: 1.2, alpha: 90, beta: 90, gamma: 90 },
  orthorhombic: { a: 1, b: 1.2, c: 0.8, alpha: 90, beta: 90, gamma: 90 },
  hexagonal: { a: 1, b: 1, c: 1.5, alpha: 90, beta: 90, gamma: 120 },
  trigonal: { a: 1, b: 1, c: 1.5, alpha: 90, beta: 90, gamma: 120 },
  monoclinic: { a: 1, b: 1.2, c: 0.9, alpha: 90, beta: 110, gamma: 90 },
  triclinic: { a: 1, b: 1.1, c: 0.95, alpha: 80, beta: 85, gamma: 75 },
};

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Vector operations
 */
function vec3(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vector3, s: number): Vector3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vector3): Vector3 {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Convert Miller index to normal vector based on crystal system
 */
function millerToNormal(miller: MillerIndex, system: string): Vector3 {
  const params = SYSTEM_PARAMS[system] || SYSTEM_PARAMS.cubic;

  // For hexagonal/trigonal with 4-index notation, convert to 3-index
  let h = miller.h;
  let k = miller.k;
  let l = miller.l;

  if (miller.i !== undefined) {
    // Already in 4-index, just use h, k, l (i is redundant: i = -(h+k))
    l = miller.l;
  }

  // Convert to Cartesian normal based on crystal system
  if (system === 'hexagonal' || system === 'trigonal') {
    // Hexagonal axes transformation
    const a1 = vec3(1, 0, 0);
    const a2 = vec3(-0.5, Math.sqrt(3) / 2, 0);
    const a3 = vec3(0, 0, params.c);

    const normal = add(add(scale(a1, h), scale(a2, k)), scale(a3, l));
    return normalize(normal);
  }

  // For other systems, simple reciprocal lattice normal
  const normal = vec3(h / params.a, k / params.b, l / params.c);
  return normalize(normal);
}

/**
 * Generate symmetry-equivalent normals based on point group
 */
function generateSymmetryEquivalents(normal: Vector3, pointGroup: string): Vector3[] {
  const normals: Vector3[] = [normal];

  // Apply symmetry operations based on point group
  // This is a simplified implementation for common point groups

  if (pointGroup.includes('m3m') || pointGroup.includes('m-3m')) {
    // Full cubic symmetry (48 operations)
    const permutations = [
      [1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1],
    ];
    const signs = [
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
      [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    ];

    normals.length = 0;
    for (const perm of permutations) {
      for (const sign of signs) {
        const coords = [normal.x, normal.y, normal.z];
        const n = vec3(
          coords[perm[0] - 1] * sign[0],
          coords[perm[1] - 1] * sign[1],
          coords[perm[2] - 1] * sign[2]
        );
        // Check if this normal is unique
        const isUnique = !normals.some(
          existing => Math.abs(existing.x - n.x) < 0.001 &&
                      Math.abs(existing.y - n.y) < 0.001 &&
                      Math.abs(existing.z - n.z) < 0.001
        );
        if (isUnique) normals.push(n);
      }
    }
  } else if (pointGroup === '6/mmm') {
    // Hexagonal symmetry (24 operations)
    normals.length = 0;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Rotate around z-axis
      const rotated = vec3(
        normal.x * cos - normal.y * sin,
        normal.x * sin + normal.y * cos,
        normal.z
      );
      normals.push(rotated);

      // Mirror in z
      normals.push(vec3(rotated.x, rotated.y, -rotated.z));

      // Mirror in xy plane
      normals.push(vec3(rotated.x, -rotated.y, rotated.z));
      normals.push(vec3(rotated.x, -rotated.y, -rotated.z));
    }
  } else if (pointGroup === '4/mmm') {
    // Tetragonal symmetry
    normals.length = 0;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const rotated = vec3(
        normal.x * cos - normal.y * sin,
        normal.x * sin + normal.y * cos,
        normal.z
      );
      normals.push(rotated);
      normals.push(vec3(rotated.x, rotated.y, -rotated.z));
      normals.push(vec3(-rotated.x, rotated.y, rotated.z));
      normals.push(vec3(-rotated.x, rotated.y, -rotated.z));
    }
  } else if (pointGroup === 'mmm') {
    // Orthorhombic symmetry
    normals.length = 0;
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          normals.push(vec3(normal.x * sx, normal.y * sy, normal.z * sz));
        }
      }
    }
  } else if (pointGroup === '-3m') {
    // Trigonal symmetry
    normals.length = 0;
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const rotated = vec3(
        normal.x * cos - normal.y * sin,
        normal.x * sin + normal.y * cos,
        normal.z
      );
      normals.push(rotated);
      normals.push(vec3(rotated.x, rotated.y, -rotated.z));
      normals.push(vec3(-rotated.y, -rotated.x, rotated.z));
      normals.push(vec3(-rotated.y, -rotated.x, -rotated.z));
    }
  }

  return normals;
}

/**
 * Clip a convex polygon against a half-space defined by plane
 */
function clipPolygon(vertices: Vector3[], planeNormal: Vector3, planeDist: number): Vector3[] {
  if (vertices.length === 0) return [];

  const result: Vector3[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];

    const currentDist = dot(current, planeNormal) - planeDist;
    const nextDist = dot(next, planeNormal) - planeDist;

    if (currentDist <= 0) {
      // Current vertex is inside
      result.push(current);
    }

    if ((currentDist > 0 && nextDist < 0) || (currentDist < 0 && nextDist > 0)) {
      // Edge crosses plane, compute intersection
      const t = currentDist / (currentDist - nextDist);
      const intersection = add(current, scale(sub(next, current), t));
      result.push(intersection);
    }
  }

  return result;
}

/**
 * Create initial large cube vertices
 */
function createInitialCube(size: number): Vector3[] {
  return [
    vec3(-size, -size, -size),
    vec3(size, -size, -size),
    vec3(size, size, -size),
    vec3(-size, size, -size),
    vec3(-size, -size, size),
    vec3(size, -size, size),
    vec3(size, size, size),
    vec3(-size, size, size),
  ];
}

/**
 * Create face from vertices with proper winding
 */
function createFace(vertices: Vector3[], faceNormal: Vector3): Face {
  // Ensure vertices are wound correctly (counter-clockwise when viewed from outside)
  const center = vertices.reduce(
    (acc, v) => add(acc, scale(v, 1 / vertices.length)),
    vec3(0, 0, 0)
  );

  // Calculate face normal from vertices
  if (vertices.length >= 3) {
    const edge1 = sub(vertices[1], vertices[0]);
    const edge2 = sub(vertices[2], vertices[0]);
    const calculatedNormal = normalize(cross(edge1, edge2));

    // If calculated normal points opposite to expected, reverse vertices
    if (dot(calculatedNormal, faceNormal) < 0) {
      vertices.reverse();
    }
  }

  return {
    vertices: [...vertices],
    normal: faceNormal,
  };
}

/**
 * Generate crystal geometry from parsed CDL
 */
export function generateGeometry(parsed: CDLParseResult): CrystalGeometry {
  const allPlanes: { normal: Vector3; distance: number; millerIndex: MillerIndex }[] = [];

  // Generate planes for each crystal form
  for (const form of parsed.forms) {
    const baseNormal = millerToNormal(form.millerIndex, parsed.system);
    const symmetryNormals = generateSymmetryEquivalents(baseNormal, parsed.pointGroup);

    for (const normal of symmetryNormals) {
      // Distance from origin (adjusted by scale)
      const distance = form.scale;

      // Avoid duplicate planes
      const isDuplicate = allPlanes.some(
        p => Math.abs(dot(p.normal, normal) - 1) < 0.001 &&
             Math.abs(p.distance - distance) < 0.001
      );

      if (!isDuplicate) {
        allPlanes.push({ normal, distance, millerIndex: form.millerIndex });
      }
    }
  }

  // Start with a large initial polyhedron and clip against all planes
  const faces: Face[] = [];
  const vertexMap = new Map<string, number>();
  const vertices: Vector3[] = [];

  // For each plane, we'll compute its contribution to the final shape
  for (const plane of allPlanes) {
    // Create initial face as large quad perpendicular to normal
    const size = 10;

    // Find two vectors perpendicular to the normal
    let tangent: Vector3;
    if (Math.abs(plane.normal.y) < 0.9) {
      tangent = normalize(cross(plane.normal, vec3(0, 1, 0)));
    } else {
      tangent = normalize(cross(plane.normal, vec3(1, 0, 0)));
    }
    const bitangent = cross(plane.normal, tangent);

    // Create initial square face on the plane
    const center = scale(plane.normal, plane.distance);
    let faceVertices: Vector3[] = [
      add(add(center, scale(tangent, -size)), scale(bitangent, -size)),
      add(add(center, scale(tangent, size)), scale(bitangent, -size)),
      add(add(center, scale(tangent, size)), scale(bitangent, size)),
      add(add(center, scale(tangent, -size)), scale(bitangent, size)),
    ];

    // Clip against all other planes
    for (const clipPlane of allPlanes) {
      if (clipPlane === plane) continue;
      faceVertices = clipPolygon(faceVertices, clipPlane.normal, clipPlane.distance);
      if (faceVertices.length < 3) break;
    }

    if (faceVertices.length >= 3) {
      const face = createFace(faceVertices, plane.normal);
      face.millerIndex = plane.millerIndex;
      faces.push(face);

      // Add unique vertices
      for (const v of face.vertices) {
        const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
        if (!vertexMap.has(key)) {
          vertexMap.set(key, vertices.length);
          vertices.push(v);
        }
      }
    }
  }

  // Build edge list
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];

  for (const face of faces) {
    for (let i = 0; i < face.vertices.length; i++) {
      const v1 = face.vertices[i];
      const v2 = face.vertices[(i + 1) % face.vertices.length];

      const key1 = `${v1.x.toFixed(4)},${v1.y.toFixed(4)},${v1.z.toFixed(4)}`;
      const key2 = `${v2.x.toFixed(4)},${v2.y.toFixed(4)},${v2.z.toFixed(4)}`;

      const idx1 = vertexMap.get(key1)!;
      const idx2 = vertexMap.get(key2)!;

      const edgeKey = idx1 < idx2 ? `${idx1}-${idx2}` : `${idx2}-${idx1}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push([idx1, idx2]);
      }
    }
  }

  let geometry: CrystalGeometry = { vertices, faces, edges };

  // Apply modifications (elongate, flatten, scale)
  if (parsed.modifications && parsed.modifications.length > 0) {
    geometry = applyModifications(geometry, parsed.modifications);
  }

  // Apply twin transformation
  if (parsed.twin) {
    geometry = generateTwinnedGeometry(geometry, parsed.twin.law);
  }

  return geometry;
}

/**
 * Apply modifications to geometry (elongate, flatten, scale)
 */
function applyModifications(geom: CrystalGeometry, mods: ModificationSpec[]): CrystalGeometry {
  // Calculate scale factors for each axis
  const scales = { a: 1, b: 1, c: 1 };

  for (const mod of mods) {
    let factor = mod.factor;
    if (mod.type === 'flatten') {
      factor = 1 / factor;
    }
    scales[mod.axis] *= factor;
  }

  // Apply scales to vertices
  const newVertices = geom.vertices.map(v => ({
    x: v.x * scales.a,
    y: v.y * scales.b,
    z: v.z * scales.c,
  }));

  // Apply scales to face vertices and recalculate normals
  const newFaces = geom.faces.map(face => {
    const scaledVertices = face.vertices.map(v => ({
      x: v.x * scales.a,
      y: v.y * scales.b,
      z: v.z * scales.c,
    }));

    // Recalculate normal after scaling
    let normal = face.normal;
    if (scaledVertices.length >= 3) {
      const v0 = scaledVertices[0];
      const v1 = scaledVertices[1];
      const v2 = scaledVertices[2];
      const edge1 = sub(v1, v0);
      const edge2 = sub(v2, v0);
      normal = normalize(cross(edge1, edge2));
    }

    return {
      ...face,
      vertices: scaledVertices,
      normal,
    };
  });

  return {
    vertices: newVertices,
    faces: newFaces,
    edges: geom.edges,
  };
}
