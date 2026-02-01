/**
 * Twin law definitions for crystal geometry.
 * Ported from Python crystal_geometry.twins.laws
 */

import { DIRECTIONS, type Vec3 } from './transforms';

// Japan twin angle: 84°33'30"
const JAPAN_ANGLE_QUARTZ = 84 + 33 / 60 + 30 / 3600;

export interface TwinLaw {
  name: string;
  description: string;
  twinType: 'contact' | 'penetration' | 'cyclic';
  renderMode: 'unified' | 'dual_crystal' | 'v_shaped' | 'contact_rotation' | 'cyclic' | 'single_crystal';
  axis: Vec3;
  angle: number;
  habit: string;
  habitParams?: Record<string, number>;
  examples: string[];
}

/**
 * Twin law definitions
 */
export const TWIN_LAWS: Record<string, TwinLaw> = {
  spinel: {
    name: 'Spinel Law (Macle)',
    description: '180° rotation about [111] with {111} composition plane',
    twinType: 'contact',
    renderMode: 'contact_rotation',
    axis: DIRECTIONS['[111]'],
    angle: 180,
    habit: 'octahedron',
    examples: ['spinel', 'diamond', 'magnetite'],
  },
  iron_cross: {
    name: 'Iron Cross Twin',
    description: '90° rotation about [001] (pyrite)',
    twinType: 'penetration',
    renderMode: 'dual_crystal',
    axis: DIRECTIONS['[001]'],
    angle: 90,
    habit: 'orthorhombic_prism',
    habitParams: { b_ratio: 0.5, c_ratio: 2.5 },
    examples: ['pyrite'],
  },
  carlsbad: {
    name: 'Carlsbad Twin',
    description: '180° rotation about [001] (feldspar)',
    twinType: 'penetration',
    renderMode: 'dual_crystal',
    axis: DIRECTIONS['[001]'],
    angle: 180,
    habit: 'orthorhombic_prism',
    examples: ['orthoclase', 'feldspar'],
  },
  albite: {
    name: 'Albite Twin',
    description: '180° rotation about [010] with (010) composition plane',
    twinType: 'contact',
    renderMode: 'contact_rotation',
    axis: DIRECTIONS['[010]'],
    angle: 180,
    habit: 'feldspar_tabular',
    examples: ['plagioclase', 'albite'],
  },
  brazil: {
    name: 'Brazil Twin (Quartz)',
    description: '180° rotation about [110] (optical twins, opposite handedness)',
    twinType: 'penetration',
    renderMode: 'dual_crystal',
    axis: DIRECTIONS['[110]'],
    angle: 180,
    habit: 'quartz_crystal',
    habitParams: { c_ratio: 2.5 },
    examples: ['quartz'],
  },
  dauphine: {
    name: 'Dauphine Twin (Quartz)',
    description: '180° rotation about c-axis [001] (internal/electrical twin)',
    twinType: 'penetration',
    renderMode: 'single_crystal',
    axis: DIRECTIONS['[001]'],
    angle: 180,
    habit: 'quartz_crystal',
    habitParams: { c_ratio: 2.5 },
    examples: ['quartz'],
  },
  japan: {
    name: 'Japan Twin (Quartz)',
    description: "Contact twin at 84°33'30\" angle (twin plane {11-22})",
    twinType: 'contact',
    renderMode: 'v_shaped',
    axis: DIRECTIONS['[11-2]'],
    angle: JAPAN_ANGLE_QUARTZ,
    habit: 'quartz_crystal',
    habitParams: { c_ratio: 2.5 },
    examples: ['quartz'],
  },
  trilling: {
    name: 'Trilling (Cyclic Twin)',
    description: 'Three crystals rotated 120° about c-axis',
    twinType: 'cyclic',
    renderMode: 'cyclic',
    axis: DIRECTIONS['[001]'],
    angle: 120,
    habit: 'tabular',
    examples: ['chrysoberyl', 'aragonite'],
  },
  fluorite: {
    name: 'Fluorite Penetration Twin',
    description: 'Two cubes interpenetrating along [111]',
    twinType: 'penetration',
    renderMode: 'dual_crystal',
    axis: DIRECTIONS['[111]'],
    angle: 180,
    habit: 'cube',
    examples: ['fluorite'],
  },
  staurolite_60: {
    name: 'Staurolite 60° Twin',
    description: '60° cross-shaped penetration twin',
    twinType: 'penetration',
    renderMode: 'dual_crystal',
    axis: DIRECTIONS['[001]'],
    angle: 60,
    habit: 'orthorhombic_prism',
    examples: ['staurolite'],
  },
  staurolite_90: {
    name: 'Staurolite 90° Twin',
    description: '90° cross-shaped penetration twin',
    twinType: 'penetration',
    renderMode: 'dual_crystal',
    axis: DIRECTIONS['[001]'],
    angle: 90,
    habit: 'orthorhombic_prism',
    examples: ['staurolite'],
  },
  manebach: {
    name: 'Manebach Twin',
    description: '180° rotation about [001] with (001) composition plane',
    twinType: 'contact',
    renderMode: 'contact_rotation',
    axis: DIRECTIONS['[001]'],
    angle: 180,
    habit: 'feldspar_tabular',
    examples: ['orthoclase', 'feldspar'],
  },
  baveno: {
    name: 'Baveno Twin',
    description: '180° rotation about [021] with (021) composition plane',
    twinType: 'contact',
    renderMode: 'contact_rotation',
    axis: DIRECTIONS['[021]'],
    angle: 180,
    habit: 'feldspar_tabular',
    examples: ['orthoclase', 'feldspar'],
  },
  gypsum_swallow: {
    name: 'Gypsum Swallow-Tail Twin',
    description: 'Contact twin forming characteristic swallow-tail shape',
    twinType: 'contact',
    renderMode: 'v_shaped',
    axis: DIRECTIONS['[100]'],
    angle: 180,
    habit: 'tabular',
    examples: ['gypsum'],
  },
};

/**
 * Get a twin law by name (case-insensitive, supports aliases)
 */
export function getTwinLaw(name: string): TwinLaw | null {
  const normalized = name.toLowerCase().replace(/[_-\s]/g, '');

  // Direct lookup
  if (TWIN_LAWS[name]) return TWIN_LAWS[name];

  // Try normalized lookup
  for (const [key, law] of Object.entries(TWIN_LAWS)) {
    if (key.toLowerCase().replace(/[_-]/g, '') === normalized) {
      return law;
    }
  }

  return null;
}

/**
 * List all available twin law names
 */
export function listTwinLaws(): string[] {
  return Object.keys(TWIN_LAWS).sort();
}
