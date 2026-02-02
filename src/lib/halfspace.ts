/**
 * Halfspace intersection for crystal geometry.
 * Ported from Python crystal_geometry.geometry
 */

import type { Vector3, Face } from './crystal-geometry';

export interface HalfspaceData {
  normals: Vector3[];
  distances: number[];
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
  if (len < 1e-10) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Clip a convex polygon against a half-space
 */
function clipPolygon(vertices: Vector3[], planeNormal: Vector3, planeDist: number): Vector3[] {
  if (vertices.length === 0) return [];

  const result: Vector3[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];

    const currentDist = dot(current, planeNormal) - planeDist;
    const nextDist = dot(next, planeNormal) - planeDist;

    if (currentDist <= 1e-8) {
      result.push(current);
    }

    if ((currentDist > 1e-8 && nextDist < -1e-8) || (currentDist < -1e-8 && nextDist > 1e-8)) {
      const t = currentDist / (currentDist - nextDist);
      const intersection = add(current, scale(sub(next, current), t));
      result.push(intersection);
    }
  }

  return result;
}

/**
 * Compute polyhedron from halfspace intersection
 * Uses face-clipping algorithm (no scipy dependency)
 */
export function computeHalfspaceIntersection(
  halfspaces: HalfspaceData
): { vertices: Vector3[]; faces: Face[] } {
  const { normals, distances } = halfspaces;
  const faces: Face[] = [];
  const vertexMap = new Map<string, number>();
  const vertices: Vector3[] = [];

  // For each plane, create a large initial face and clip against all other planes
  for (let i = 0; i < normals.length; i++) {
    const normal = normals[i];
    const distance = distances[i];

    // Create initial face as large quad perpendicular to normal
    const size = 10;

    // Find two vectors perpendicular to the normal
    let tangent: Vector3;
    if (Math.abs(normal.y) < 0.9) {
      tangent = normalize(cross(normal, vec3(0, 1, 0)));
    } else {
      tangent = normalize(cross(normal, vec3(1, 0, 0)));
    }
    const bitangent = cross(normal, tangent);

    // Create initial square face on the plane
    const center = scale(normal, distance);
    let faceVertices: Vector3[] = [
      add(add(center, scale(tangent, -size)), scale(bitangent, -size)),
      add(add(center, scale(tangent, size)), scale(bitangent, -size)),
      add(add(center, scale(tangent, size)), scale(bitangent, size)),
      add(add(center, scale(tangent, -size)), scale(bitangent, size)),
    ];

    // Clip against all other planes
    for (let j = 0; j < normals.length; j++) {
      if (i === j) continue;
      faceVertices = clipPolygon(faceVertices, normals[j], distances[j]);
      if (faceVertices.length < 3) break;
    }

    if (faceVertices.length >= 3) {
      // Ensure correct winding (counter-clockwise when viewed from outside)
      const faceCenter = faceVertices.reduce(
        (acc, v) => add(acc, scale(v, 1 / faceVertices.length)),
        vec3(0, 0, 0)
      );

      if (faceVertices.length >= 3) {
        const edge1 = sub(faceVertices[1], faceVertices[0]);
        const edge2 = sub(faceVertices[2], faceVertices[0]);
        const calculatedNormal = normalize(cross(edge1, edge2));

        if (dot(calculatedNormal, normal) < 0) {
          faceVertices.reverse();
        }
      }

      const face: Face = {
        vertices: [...faceVertices],
        normal: normal,
      };
      faces.push(face);

      // Add unique vertices
      for (const v of faceVertices) {
        const key = `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
        if (!vertexMap.has(key)) {
          vertexMap.set(key, vertices.length);
          vertices.push(v);
        }
      }
    }
  }

  return { vertices, faces };
}

/**
 * Rotate halfspace normals by a 3x3 rotation matrix
 */
export function rotateHalfspaces(
  halfspaces: HalfspaceData,
  R: [[number, number, number], [number, number, number], [number, number, number]]
): HalfspaceData {
  const rotatedNormals = halfspaces.normals.map(n => ({
    x: R[0][0] * n.x + R[0][1] * n.y + R[0][2] * n.z,
    y: R[1][0] * n.x + R[1][1] * n.y + R[1][2] * n.z,
    z: R[2][0] * n.x + R[2][1] * n.y + R[2][2] * n.z,
  }));

  return {
    normals: rotatedNormals,
    distances: [...halfspaces.distances],
  };
}

/**
 * Add a clipping plane to halfspaces (for contact twins)
 */
export function addClippingPlane(
  halfspaces: HalfspaceData,
  normal: Vector3,
  distance: number
): HalfspaceData {
  return {
    normals: [...halfspaces.normals, normal],
    distances: [...halfspaces.distances, distance],
  };
}
