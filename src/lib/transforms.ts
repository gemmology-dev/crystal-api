/**
 * Geometric transformations for crystal twinning.
 * Ported from Python crystal_geometry.twins.transforms
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Mat3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

export type Mat4 = [
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number]
];

/**
 * Normalize a 3D vector
 */
export function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-10) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Create 3x3 rotation matrix from axis-angle representation.
 * Uses Rodrigues' rotation formula.
 */
export function rotationMatrixAxisAngle(axis: Vec3, angleDeg: number): Mat3 {
  const n = normalize(axis);
  const angleRad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;
  const { x, y, z } = n;

  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

/**
 * Create 4x4 homogeneous rotation matrix.
 */
export function rotationMatrix4x4(axis: Vec3, angleDeg: number): Mat4 {
  const R = rotationMatrixAxisAngle(axis, angleDeg);
  return [
    [R[0][0], R[0][1], R[0][2], 0],
    [R[1][0], R[1][1], R[1][2], 0],
    [R[2][0], R[2][1], R[2][2], 0],
    [0, 0, 0, 1],
  ];
}

/**
 * Create 4x4 homogeneous translation matrix.
 */
export function translationMatrix4x4(offset: Vec3): Mat4 {
  return [
    [1, 0, 0, offset.x],
    [0, 1, 0, offset.y],
    [0, 0, 1, offset.z],
    [0, 0, 0, 1],
  ];
}

/**
 * Create 3x3 reflection matrix across plane with given normal.
 * R = I - 2 * n * n^T
 */
export function reflectionMatrix(normal: Vec3): Mat3 {
  const n = normalize(normal);
  const { x, y, z } = n;
  return [
    [1 - 2 * x * x, -2 * x * y, -2 * x * z],
    [-2 * x * y, 1 - 2 * y * y, -2 * y * z],
    [-2 * x * z, -2 * y * z, 1 - 2 * z * z],
  ];
}

/**
 * Multiply 3x3 matrix by vector
 */
export function mat3MulVec3(m: Mat3, v: Vec3): Vec3 {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

/**
 * Multiply two 3x3 matrices
 */
export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const result: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return result;
}

/**
 * Identity 3x3 matrix
 */
export function identity3(): Mat3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

/**
 * Common crystallographic directions (normalized)
 */
export const DIRECTIONS: Record<string, Vec3> = {
  '[100]': { x: 1, y: 0, z: 0 },
  '[010]': { x: 0, y: 1, z: 0 },
  '[001]': { x: 0, y: 0, z: 1 },
  '[110]': normalize({ x: 1, y: 1, z: 0 }),
  '[111]': normalize({ x: 1, y: 1, z: 1 }),
  '[-111]': normalize({ x: -1, y: 1, z: 1 }),
  '[1-11]': normalize({ x: 1, y: -1, z: 1 }),
  '[11-1]': normalize({ x: 1, y: 1, z: -1 }),
  '[1-10]': normalize({ x: 1, y: -1, z: 0 }),
  '[11-2]': normalize({ x: 1, y: 1, z: -2 }),
  '[021]': normalize({ x: 0, y: 2, z: 1 }),
};

/**
 * Get a crystallographic direction by name
 */
export function getDirection(name: string): Vec3 {
  const dir = DIRECTIONS[name];
  if (!dir) {
    throw new Error(`Unknown direction: ${name}`);
  }
  return { ...dir };
}
