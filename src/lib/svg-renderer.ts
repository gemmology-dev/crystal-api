/**
 * SVG Renderer - JavaScript implementation
 * Renders crystal geometry to SVG with proper projection and face sorting
 */

import type { CrystalGeometry, Face, Vector3 } from './crystal-geometry';

interface RenderOptions {
  width: number;
  height: number;
  elevation: number; // degrees
  azimuth: number; // degrees
  scale: number;
  showEdges: boolean;
  fillOpacity: number;
}

interface ProjectedFace {
  points: { x: number; y: number }[];
  depth: number;
  normal: Vector3;
  originalFace: Face;
}

const DEFAULT_OPTIONS: RenderOptions = {
  width: 300,
  height: 300,
  elevation: 30,
  azimuth: -45,
  scale: 100,
  showEdges: true,
  fillOpacity: 0.85,
};

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Create rotation matrix for view transformation
 */
function createViewMatrix(elevation: number, azimuth: number): number[][] {
  const elev = toRadians(elevation);
  const azim = toRadians(azimuth);

  const cosE = Math.cos(elev);
  const sinE = Math.sin(elev);
  const cosA = Math.cos(azim);
  const sinA = Math.sin(azim);

  // Combined rotation: first around Y (azimuth), then around X (elevation)
  return [
    [cosA, 0, -sinA],
    [sinA * sinE, cosE, cosA * sinE],
    [sinA * cosE, -sinE, cosA * cosE],
  ];
}

/**
 * Apply matrix transformation to a vector
 */
function transformVector(v: Vector3, matrix: number[][]): Vector3 {
  return {
    x: matrix[0][0] * v.x + matrix[0][1] * v.y + matrix[0][2] * v.z,
    y: matrix[1][0] * v.x + matrix[1][1] * v.y + matrix[1][2] * v.z,
    z: matrix[2][0] * v.x + matrix[2][1] * v.y + matrix[2][2] * v.z,
  };
}

/**
 * Project 3D point to 2D using orthographic projection
 */
function project(v: Vector3, scale: number, offsetX: number, offsetY: number): { x: number; y: number; z: number } {
  return {
    x: v.x * scale + offsetX,
    y: -v.y * scale + offsetY, // Flip Y for SVG coordinates
    z: v.z, // Keep Z for depth sorting
  };
}

/**
 * Calculate face color based on normal direction (simple lighting)
 */
function calculateFaceColor(normal: Vector3, viewMatrix: number[][]): string {
  // Transform normal to view space
  const viewNormal = transformVector(normal, viewMatrix);

  // Light direction (from top-right-front)
  const lightDir = { x: 0.5, y: 0.7, z: 0.5 };
  const lightLen = Math.sqrt(lightDir.x ** 2 + lightDir.y ** 2 + lightDir.z ** 2);
  lightDir.x /= lightLen;
  lightDir.y /= lightLen;
  lightDir.z /= lightLen;

  // Calculate diffuse lighting
  const diffuse = Math.max(
    0,
    viewNormal.x * lightDir.x + viewNormal.y * lightDir.y + viewNormal.z * lightDir.z
  );

  // Base color (crystal blue)
  const baseR = 14; // #0ea5e9 - sky blue
  const baseG = 165;
  const baseB = 233;

  // Apply lighting
  const ambient = 0.3;
  const intensity = ambient + (1 - ambient) * diffuse;

  const r = Math.round(baseR * intensity);
  const g = Math.round(baseG * intensity);
  const b = Math.round(baseB * intensity);

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Render crystal geometry to SVG string
 */
export function renderToSVG(geometry: CrystalGeometry, options: Partial<RenderOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const viewMatrix = createViewMatrix(opts.elevation, opts.azimuth);

  const centerX = opts.width / 2;
  const centerY = opts.height / 2;

  // Transform and project all faces
  const projectedFaces: ProjectedFace[] = [];

  for (const face of geometry.faces) {
    // Transform face vertices
    const transformedVertices = face.vertices.map((v) => transformVector(v, viewMatrix));

    // Calculate face center for depth sorting
    const center = transformedVertices.reduce(
      (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }),
      { x: 0, y: 0, z: 0 }
    );
    const n = transformedVertices.length;
    center.x /= n;
    center.y /= n;
    center.z /= n;

    // Transform normal
    const transformedNormal = transformVector(face.normal, viewMatrix);

    // Back-face culling: skip faces pointing away from viewer
    if (transformedNormal.z < -0.01) continue;

    // Project vertices to 2D
    const projectedPoints = transformedVertices.map((v) =>
      project(v, opts.scale, centerX, centerY)
    );

    projectedFaces.push({
      points: projectedPoints,
      depth: center.z,
      normal: transformedNormal,
      originalFace: face,
    });
  }

  // Sort faces by depth (back to front - painter's algorithm)
  projectedFaces.sort((a, b) => a.depth - b.depth);

  // Generate SVG
  const halfWidth = opts.width / 2;
  const halfHeight = opts.height / 2;

  let svg = `<svg viewBox="${-halfWidth} ${-halfHeight} ${opts.width} ${opts.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="crystalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#38bdf8;stop-opacity:0.9" />
      <stop offset="100%" style="stop-color:#0284c7;stop-opacity:0.95" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="4" stdDeviation="3" flood-opacity="0.15"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
`;

  // Draw faces
  for (const face of projectedFaces) {
    const pointsStr = face.points
      .map((p) => `${(p.x - centerX).toFixed(2)},${(p.y - centerY).toFixed(2)}`)
      .join(' ');

    const fillColor = calculateFaceColor(face.originalFace.normal, viewMatrix);

    svg += `    <polygon points="${pointsStr}" fill="${fillColor}" fill-opacity="${opts.fillOpacity}" stroke="#0369a1" stroke-width="1.5" stroke-linejoin="round"/>\n`;
  }

  svg += `  </g>
</svg>`;

  return svg;
}

/**
 * Generate STL (ASCII) from crystal geometry
 */
export function renderToSTL(geometry: CrystalGeometry, scale: number = 10): string {
  let stl = 'solid crystal\n';

  for (const face of geometry.faces) {
    // Triangulate face (fan triangulation from first vertex)
    for (let i = 1; i < face.vertices.length - 1; i++) {
      const v0 = face.vertices[0];
      const v1 = face.vertices[i];
      const v2 = face.vertices[i + 1];

      stl += `  facet normal ${face.normal.x.toFixed(6)} ${face.normal.y.toFixed(6)} ${face.normal.z.toFixed(6)}\n`;
      stl += `    outer loop\n`;
      stl += `      vertex ${(v0.x * scale).toFixed(6)} ${(v0.y * scale).toFixed(6)} ${(v0.z * scale).toFixed(6)}\n`;
      stl += `      vertex ${(v1.x * scale).toFixed(6)} ${(v1.y * scale).toFixed(6)} ${(v1.z * scale).toFixed(6)}\n`;
      stl += `      vertex ${(v2.x * scale).toFixed(6)} ${(v2.y * scale).toFixed(6)} ${(v2.z * scale).toFixed(6)}\n`;
      stl += `    endloop\n`;
      stl += `  endfacet\n`;
    }
  }

  stl += 'endsolid crystal\n';
  return stl;
}

/**
 * Generate glTF JSON from crystal geometry
 */
export function renderToGLTF(geometry: CrystalGeometry, scale: number = 1): object {
  // Collect all vertices and indices for triangulated mesh
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  let vertexIndex = 0;

  for (const face of geometry.faces) {
    const faceStartIndex = vertexIndex;

    // Add vertices for this face
    for (const v of face.vertices) {
      positions.push(v.x * scale, v.y * scale, v.z * scale);
      normals.push(face.normal.x, face.normal.y, face.normal.z);
      vertexIndex++;
    }

    // Triangulate (fan triangulation)
    for (let i = 1; i < face.vertices.length - 1; i++) {
      indices.push(faceStartIndex, faceStartIndex + i, faceStartIndex + i + 1);
    }
  }

  // Convert to binary buffers
  const positionBuffer = new Float32Array(positions);
  const normalBuffer = new Float32Array(normals);
  const indexBuffer = new Uint16Array(indices);

  // Calculate bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }

  // Create glTF JSON structure
  const gltf = {
    asset: {
      version: '2.0',
      generator: 'gemmology-api',
    },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [
      {
        mesh: 0,
        name: 'Crystal',
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
            },
            indices: 2,
            material: 0,
          },
        ],
        name: 'CrystalMesh',
      },
    ],
    materials: [
      {
        name: 'CrystalMaterial',
        pbrMetallicRoughness: {
          baseColorFactor: [0.055, 0.647, 0.914, 0.9], // #0ea5e9 with alpha
          metallicFactor: 0.1,
          roughnessFactor: 0.3,
        },
        alphaMode: 'BLEND',
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: positions.length / 3,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normals.length / 3,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5123, // UNSIGNED_SHORT
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positionBuffer.byteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: positionBuffer.byteLength,
        byteLength: normalBuffer.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positionBuffer.byteLength + normalBuffer.byteLength,
        byteLength: indexBuffer.byteLength,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [
      {
        byteLength: positionBuffer.byteLength + normalBuffer.byteLength + indexBuffer.byteLength,
        uri: `data:application/octet-stream;base64,${bufferToBase64(
          positionBuffer,
          normalBuffer,
          indexBuffer
        )}`,
      },
    ],
  };

  return gltf;
}

/**
 * Convert typed arrays to base64 data URI
 */
function bufferToBase64(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint16Array
): string {
  const totalLength =
    positions.byteLength + normals.byteLength + indices.byteLength;
  const combined = new Uint8Array(totalLength);

  combined.set(new Uint8Array(positions.buffer), 0);
  combined.set(new Uint8Array(normals.buffer), positions.byteLength);
  combined.set(
    new Uint8Array(indices.buffer),
    positions.byteLength + normals.byteLength
  );

  // Convert to base64
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}
