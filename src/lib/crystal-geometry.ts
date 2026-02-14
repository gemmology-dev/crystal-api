/**
 * Crystal Geometry Engine - JavaScript implementation
 * Ported from Python crystal_geometry.geometry
 *
 * Generates 3D crystal geometry using half-space intersection algorithm.
 */

import type { CDLParseResult, MillerIndex, ModificationSpec } from './cdl-parser';
import { flatForms } from './cdl-parser';
import type { HalfspaceData } from './halfspace';
import { computeHalfspaceIntersection } from './halfspace';
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
// NOTE: c_ratio = 1.0 for hex/trigonal matches Python default behavior
const SYSTEM_PARAMS: Record<string, { a: number; b: number; c: number; alpha: number; beta: number; gamma: number }> = {
  cubic: { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 },
  tetragonal: { a: 1, b: 1, c: 1.2, alpha: 90, beta: 90, gamma: 90 },
  orthorhombic: { a: 1, b: 1.2, c: 0.8, alpha: 90, beta: 90, gamma: 90 },
  hexagonal: { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 120 },
  trigonal: { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 120 },
  monoclinic: { a: 1, b: 1.2, c: 0.9, alpha: 90, beta: 110, gamma: 90 },
  triclinic: { a: 1, b: 1.1, c: 0.95, alpha: 80, beta: 85, gamma: 75 },
};

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
 * Compute reciprocal lattice vectors for a crystal system
 */
function getReciprocalLattice(system: string): { aStar: Vector3; bStar: Vector3; cStar: Vector3 } {
  const params = SYSTEM_PARAMS[system] || SYSTEM_PARAMS.cubic;
  const { a, b, c, alpha, beta, gamma } = params;

  // Convert angles to radians
  const alphaRad = (alpha * Math.PI) / 180;
  const betaRad = (beta * Math.PI) / 180;
  const gammaRad = (gamma * Math.PI) / 180;

  // Direct lattice vectors in Cartesian coordinates
  const aVec = vec3(a, 0, 0);
  const bVec = vec3(b * Math.cos(gammaRad), b * Math.sin(gammaRad), 0);

  const cx = c * Math.cos(betaRad);
  const cy = c * (Math.cos(alphaRad) - Math.cos(betaRad) * Math.cos(gammaRad)) / Math.sin(gammaRad);
  const cz = Math.sqrt(c * c - cx * cx - cy * cy);
  const cVec = vec3(cx, cy, cz);

  // Volume = a · (b × c)
  const bCrossC = cross(bVec, cVec);
  const V = dot(aVec, bCrossC);

  // Reciprocal lattice vectors: a* = (b × c) / V, etc.
  const aStar = scale(cross(bVec, cVec), 1 / V);
  const bStar = scale(cross(cVec, aVec), 1 / V);
  const cStar = scale(cross(aVec, bVec), 1 / V);

  return { aStar, bStar, cStar };
}

/**
 * Convert Miller index to normal vector based on crystal system
 * Uses proper reciprocal lattice transformation for all systems
 */
function millerToNormal(miller: MillerIndex, system: string): Vector3 {
  // For hexagonal/trigonal with 4-index notation, convert to 3-index
  let h = miller.h;
  let k = miller.k;
  let l = miller.l;

  if (miller.i !== undefined) {
    // Already in 4-index, just use h, k, l (i is redundant: i = -(h+k))
    l = miller.l;
  }

  const params = SYSTEM_PARAMS[system] || SYSTEM_PARAMS.cubic;

  // Check for cubic system (simple case)
  if (
    params.a === params.b &&
    params.b === params.c &&
    params.alpha === 90 &&
    params.beta === 90 &&
    params.gamma === 90
  ) {
    return normalize(vec3(h, k, l));
  }

  // For non-cubic systems, use reciprocal lattice vectors
  const { aStar, bStar, cStar } = getReciprocalLattice(system);

  // Normal = h * a* + k * b* + l * c*
  const normal = vec3(
    h * aStar.x + k * bStar.x + l * cStar.x,
    h * aStar.y + k * bStar.y + l * cStar.y,
    h * aStar.z + k * bStar.z + l * cStar.z
  );

  return normalize(normal);
}

/**
 * Generate symmetry-equivalent normals based on point group
 * Properly handles hexagonal/trigonal Miller index transformations
 */
function generateSymmetryEquivalents(normal: Vector3, miller: MillerIndex, pointGroup: string, system: string): { normal: Vector3; miller: MillerIndex }[] {
  const results: { normal: Vector3; miller: MillerIndex }[] = [];

  // Get Miller indices
  let h = miller.h;
  let k = miller.k;
  let l = miller.l;

  if (system === 'hexagonal' || system === 'trigonal') {
    // Use proper Miller index transformations for hexagonal/trigonal
    const millerEquivs = generateHexTrigonalEquivalents(h, k, l, pointGroup);
    for (const [eh, ek, el] of millerEquivs) {
      const equiv: MillerIndex = { h: eh, k: ek, l: el };
      const n = millerToNormal(equiv, system);
      results.push({ normal: n, miller: equiv });
    }
  } else if (pointGroup.includes('m3m') || pointGroup.includes('m-3m')) {
    // Full cubic symmetry (48 operations)
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    const signs = [
      [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
      [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    ];

    const coords = [h, k, l];
    const seen = new Set<string>();

    for (const perm of permutations) {
      for (const sign of signs) {
        const eh = coords[perm[0]] * sign[0];
        const ek = coords[perm[1]] * sign[1];
        const el = coords[perm[2]] * sign[2];

        const key = `${eh},${ek},${el}`;
        if (!seen.has(key)) {
          seen.add(key);
          const equiv: MillerIndex = { h: eh, k: ek, l: el };
          const n = millerToNormal(equiv, system);
          results.push({ normal: n, miller: equiv });
        }
      }
    }
  } else if (pointGroup === '4/mmm') {
    // Tetragonal symmetry
    const ops = [
      [h, k, l], [k, -h, l], [-h, -k, l], [-k, h, l],
      [h, -k, -l], [-h, k, -l], [k, h, -l], [-k, -h, -l],
      [h, k, -l], [k, -h, -l], [-h, -k, -l], [-k, h, -l],
      [h, -k, l], [-h, k, l], [k, h, l], [-k, -h, l],
    ];
    const seen = new Set<string>();
    for (const [eh, ek, el] of ops) {
      const key = `${eh},${ek},${el}`;
      if (!seen.has(key)) {
        seen.add(key);
        const equiv: MillerIndex = { h: eh, k: ek, l: el };
        const n = millerToNormal(equiv, system);
        results.push({ normal: n, miller: equiv });
      }
    }
  } else if (pointGroup === 'mmm') {
    // Orthorhombic symmetry
    const seen = new Set<string>();
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          const eh = h * sx;
          const ek = k * sy;
          const el = l * sz;
          const key = `${eh},${ek},${el}`;
          if (!seen.has(key)) {
            seen.add(key);
            const equiv: MillerIndex = { h: eh, k: ek, l: el };
            const n = millerToNormal(equiv, system);
            results.push({ normal: n, miller: equiv });
          }
        }
      }
    }
  } else {
    // Default: just the original
    results.push({ normal, miller });
  }

  return results;
}

// Miller index transformation matrices for hexagonal/trigonal systems
// These are 3x3 matrices that transform (h, k, l) in Miller index space

// C6z (60°): (h, k, l) -> (h+k, -h, l)
const HEX_C6z: number[][] = [
  [1, 1, 0],
  [-1, 0, 0],
  [0, 0, 1],
];

// C3z (120°): (h, k, l) -> (k, -h-k, l)
const HEX_C3z: number[][] = [
  [0, 1, 0],
  [-1, -1, 0],
  [0, 0, 1],
];

// C2 about [100] direction: (h, k, l) -> (h-k, -k, -l)
const HEX_C2_100: number[][] = [
  [1, 1, 0],
  [0, -1, 0],
  [0, 0, -1],
];

// C2 about [110] direction: (h, k, l) -> (k, h, -l)
const HEX_C2_110: number[][] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1],
];

// Mirror perpendicular to c
const HEX_Mz: number[][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, -1],
];

// Mirror perpendicular to [100]
const HEX_M_100: number[][] = [
  [-1, -1, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// Inversion
const HEX_I: number[][] = [
  [-1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];

// Identity
const HEX_E: number[][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * Multiply two 3x3 matrices
 */
function matMul(A: number[][], B: number[][]): number[][] {
  const result: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

/**
 * Apply matrix to Miller index
 */
function applyMatrixToMiller(M: number[][], h: number, k: number, l: number): [number, number, number] {
  return [
    Math.round(M[0][0] * h + M[0][1] * k + M[0][2] * l),
    Math.round(M[1][0] * h + M[1][1] * k + M[1][2] * l),
    Math.round(M[2][0] * h + M[2][1] * k + M[2][2] * l),
  ];
}

/**
 * Check if two matrices are equal
 */
function matEqual(A: number[][], B: number[][]): boolean {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (Math.abs(A[i][j] - B[i][j]) > 1e-10) return false;
    }
  }
  return true;
}

/**
 * Generate point group from generators using closure
 */
function generateGroup(generators: number[][][], maxElements = 200): number[][][] {
  const group: number[][][] = [HEX_E];
  const queue: number[][][] = [...generators];

  while (queue.length > 0 && group.length < maxElements) {
    const newOp = queue.shift()!;

    // Check if already in group
    let isNew = true;
    for (const existing of group) {
      if (matEqual(newOp, existing)) {
        isNew = false;
        break;
      }
    }

    if (isNew) {
      group.push(newOp);
      // Generate new elements by multiplication
      for (const gen of generators) {
        queue.push(matMul(newOp, gen));
        queue.push(matMul(gen, newOp));
      }
    }
  }

  return group;
}

// Cache for hex/trigonal point group operations
const hexPointGroupCache: Record<string, number[][][]> = {};

/**
 * Get Miller index transformation matrices for hexagonal/trigonal point groups
 */
function getHexPointGroupOperations(pointGroup: string): number[][][] {
  if (hexPointGroupCache[pointGroup]) {
    return hexPointGroupCache[pointGroup];
  }

  // Generators for each point group
  const generatorsMap: Record<string, number[][][]> = {
    // Hexagonal
    '6/mmm': [HEX_C6z, HEX_C2_100, HEX_Mz],
    '622': [HEX_C6z, HEX_C2_100],
    '6mm': [HEX_C6z, HEX_M_100],
    '-6m2': [HEX_C3z, HEX_Mz, HEX_M_100],
    '6/m': [HEX_C6z, HEX_Mz],
    '-6': [HEX_C3z, HEX_Mz],
    '6': [HEX_C6z],
    // Trigonal
    '-3m': [HEX_C3z, HEX_C2_110, HEX_I],
    '32': [HEX_C3z, HEX_C2_110],
    '3m': [HEX_C3z, HEX_M_100],
    '-3': [HEX_C3z, HEX_I],
    '3': [HEX_C3z],
  };

  const generators = generatorsMap[pointGroup] || [];
  const operations = generators.length > 0 ? generateGroup(generators) : [HEX_E];

  hexPointGroupCache[pointGroup] = operations;
  return operations;
}

/**
 * Generate symmetry-equivalent Miller indices for hexagonal/trigonal systems
 * Uses proper matrix-based group generation
 */
function generateHexTrigonalEquivalents(h: number, k: number, l: number, pointGroup: string): [number, number, number][] {
  const operations = getHexPointGroupOperations(pointGroup);
  const seen = new Set<string>();
  const results: [number, number, number][] = [];

  for (const op of operations) {
    const [eh, ek, el] = applyMatrixToMiller(op, h, k, l);
    const key = `${eh},${ek},${el}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push([eh, ek, el]);
    }
  }

  return results;
}

/**
 * Build halfspace data from parsed CDL
 */
function buildHalfspaces(parsed: CDLParseResult): { halfspaces: HalfspaceData; millerIndices: MillerIndex[] } {
  const normals: Vector3[] = [];
  const distances: number[] = [];
  const millerIndices: MillerIndex[] = [];

  const flat = flatForms(parsed.forms);
  for (const form of flat) {
    const baseNormal = millerToNormal(form.millerIndex, parsed.system);
    const equivalents = generateSymmetryEquivalents(baseNormal, form.millerIndex, parsed.pointGroup, parsed.system);

    for (const equiv of equivalents) {
      // Check for duplicates
      const isDuplicate = normals.some(
        (n, i) => Math.abs(dot(n, equiv.normal) - 1) < 0.001 &&
                  Math.abs(distances[i] - form.scale) < 0.001
      );

      if (!isDuplicate) {
        normals.push(equiv.normal);
        distances.push(form.scale);
        millerIndices.push(equiv.miller);
      }
    }
  }

  return {
    halfspaces: { normals, distances },
    millerIndices,
  };
}

/**
 * Build edge list from faces
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
 * Apply modifications to halfspace data (elongate, flatten, scale)
 * Modifies distances based on axis scales
 */
function applyModificationsToHalfspaces(
  halfspaces: HalfspaceData,
  mods: ModificationSpec[]
): HalfspaceData {
  // Calculate scale factors for each axis
  const scales = { a: 1, b: 1, c: 1 };

  for (const mod of mods) {
    let factor = mod.factor;
    if (mod.type === 'flatten') {
      factor = 1 / factor;
    }
    scales[mod.axis] *= factor;
  }

  // Transform normals and distances to account for anisotropic scaling
  // When we scale space by S, the halfspace n·x = d becomes:
  // (S^-1 n)·(S x) = d, so effective normal is S^-1 n (unnormalized)
  // and effective distance scales with normal length
  const newNormals: Vector3[] = [];
  const newDistances: number[] = [];

  for (let i = 0; i < halfspaces.normals.length; i++) {
    const n = halfspaces.normals[i];
    const d = halfspaces.distances[i];

    // Apply inverse scale to normal
    const scaledN: Vector3 = {
      x: n.x / scales.a,
      y: n.y / scales.b,
      z: n.z / scales.c,
    };

    // Normalize and adjust distance
    const len = length(scaledN);
    if (len > 1e-10) {
      newNormals.push({
        x: scaledN.x / len,
        y: scaledN.y / len,
        z: scaledN.z / len,
      });
      // When scaling space by S, plane n·x=d becomes (S⁻¹n)·x'=d
      // Normalizing: n'·x' = d/|S⁻¹n|
      newDistances.push(d / len);
    } else {
      newNormals.push(n);
      newDistances.push(d);
    }
  }

  return { normals: newNormals, distances: newDistances };
}

/**
 * Apply modifications to geometry (post-computation)
 */
function applyModificationsToGeometry(geom: CrystalGeometry, mods: ModificationSpec[]): CrystalGeometry {
  const scales = { a: 1, b: 1, c: 1 };

  for (const mod of mods) {
    let factor = mod.factor;
    if (mod.type === 'flatten') {
      factor = 1 / factor;
    }
    scales[mod.axis] *= factor;
  }

  const newVertices = geom.vertices.map(v => ({
    x: v.x * scales.a,
    y: v.y * scales.b,
    z: v.z * scales.c,
  }));

  const newFaces = geom.faces.map(face => {
    const scaledVertices = face.vertices.map(v => ({
      x: v.x * scales.a,
      y: v.y * scales.b,
      z: v.z * scales.c,
    }));

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

/**
 * Generate crystal geometry from parsed CDL
 *
 * Follows Python approach: compute geometry first, then apply modifications
 * to vertices. This ensures elongate/flatten work correctly with all forms.
 */
export function generateGeometry(parsed: CDLParseResult): CrystalGeometry {
  // Build halfspace data from forms
  const { halfspaces, millerIndices } = buildHalfspaces(parsed);

  let geometry: CrystalGeometry;

  // Generate geometry (twinned or base) from unmodified halfspaces
  if (parsed.twin) {
    geometry = generateTwinnedGeometry(halfspaces, parsed.twin.law);
  } else {
    // Compute base geometry from halfspaces
    const result = computeHalfspaceIntersection(halfspaces);
    const edges = buildEdges(result.faces, result.vertices);
    geometry = {
      vertices: result.vertices,
      faces: result.faces,
      edges,
    };
  }

  // Apply modifications to vertices AFTER computing geometry (like Python)
  if (parsed.modifications && parsed.modifications.length > 0) {
    geometry = applyModificationsToGeometry(geometry, parsed.modifications);
  }

  return geometry;
}
