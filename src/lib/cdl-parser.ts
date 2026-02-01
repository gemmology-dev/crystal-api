/**
 * CDL Parser - JavaScript implementation
 * Parses Crystal Description Language strings into structured form data
 */

export interface MillerIndex {
  h: number;
  k: number;
  l: number;
  i?: number; // For 4-index hexagonal notation
}

export interface CrystalForm {
  millerIndex: MillerIndex;
  scale: number;
}

export interface TwinSpec {
  law: string;
}

export interface ModificationSpec {
  type: 'elongate' | 'flatten' | 'scale';
  axis: 'a' | 'b' | 'c';
  factor: number;
}

export interface CDLParseResult {
  system: string;
  pointGroup: string;
  forms: CrystalForm[];
  modifier?: string;
  twin?: TwinSpec;
  modifications?: ModificationSpec[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  parsed?: CDLParseResult;
}

// Valid crystal systems
const CRYSTAL_SYSTEMS = [
  'cubic',
  'hexagonal',
  'trigonal',
  'tetragonal',
  'orthorhombic',
  'monoclinic',
  'triclinic',
];

// Common point groups by system
const POINT_GROUPS: Record<string, string[]> = {
  cubic: ['m3m', '432', '-43m', 'm3', '23'],
  hexagonal: ['6/mmm', '6mm', '-6m2', '622', '6/m', '-6', '6'],
  trigonal: ['-3m', '3m', '32', '-3', '3'],
  tetragonal: ['4/mmm', '4mm', '-42m', '422', '4/m', '-4', '4'],
  orthorhombic: ['mmm', 'mm2', '222'],
  monoclinic: ['2/m', 'm', '2'],
  triclinic: ['-1', '1'],
};

/**
 * Parse a Miller index string like {111} or {10-10} or {01-11}
 */
function parseMillerIndex(str: string): MillerIndex | null {
  // Remove braces
  const inner = str.replace(/[{}]/g, '');

  // Handle 4-index hexagonal notation (e.g., 10-10, 01-11)
  const fourIndexMatch = inner.match(/^(-?\d)(-?\d)(-?\d)(-?\d)$/);
  if (fourIndexMatch) {
    return {
      h: parseInt(fourIndexMatch[1], 10),
      k: parseInt(fourIndexMatch[2], 10),
      i: parseInt(fourIndexMatch[3], 10),
      l: parseInt(fourIndexMatch[4], 10),
    };
  }

  // Handle 3-index notation with potential negatives (e.g., 111, 100, 1-10)
  const threeIndexMatch = inner.match(/^(-?\d+)(-?\d+)(-?\d+)$/);
  if (threeIndexMatch) {
    return {
      h: parseInt(threeIndexMatch[1], 10),
      k: parseInt(threeIndexMatch[2], 10),
      l: parseInt(threeIndexMatch[3], 10),
    };
  }

  // Try splitting by examining the string more carefully
  // For cases like "10-10" where we have multi-digit or negatives
  const parts: number[] = [];
  let current = '';

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === '-' && current !== '') {
      parts.push(parseInt(current, 10));
      current = '-';
    } else if (char === '-' && current === '') {
      current = '-';
    } else {
      current += char;
    }
  }
  if (current !== '') {
    parts.push(parseInt(current, 10));
  }

  if (parts.length === 3) {
    return { h: parts[0], k: parts[1], l: parts[2] };
  }
  if (parts.length === 4) {
    return { h: parts[0], k: parts[1], i: parts[2], l: parts[3] };
  }

  return null;
}

/**
 * Parse a single form expression like {111}@1.0
 */
function parseForm(str: string): CrystalForm | null {
  const match = str.match(/^\{([^}]+)\}(?:@([\d.]+))?$/);
  if (!match) return null;

  const millerIndex = parseMillerIndex(`{${match[1]}}`);
  if (!millerIndex) return null;

  const scale = match[2] ? parseFloat(match[2]) : 1.0;

  return { millerIndex, scale };
}

/**
 * Parse a complete CDL expression
 * Format: system[point_group]:{form}@scale + {form}@scale | modifier
 */
export function parseCDL(cdl: string): ValidationResult {
  const trimmed = cdl.trim();

  if (!trimmed) {
    return { valid: false, error: 'CDL expression is required' };
  }

  if (trimmed.length > 500) {
    return { valid: false, error: 'CDL expression too long (max 500 characters)' };
  }

  // Split by modifier if present
  const [mainPart, modifier] = trimmed.split('|').map(s => s.trim());

  // Parse system and point group: system[point_group]:forms
  const systemMatch = mainPart.match(/^(\w+)\[([^\]]+)\]:(.+)$/);
  if (!systemMatch) {
    return { valid: false, error: 'Invalid CDL format. Expected: system[point_group]:{forms}' };
  }

  const [, system, pointGroup, formsStr] = systemMatch;

  // Validate system
  if (!CRYSTAL_SYSTEMS.includes(system.toLowerCase())) {
    return {
      valid: false,
      error: `Unknown crystal system: ${system}. Valid systems: ${CRYSTAL_SYSTEMS.join(', ')}`,
    };
  }

  // Validate point group (optional - allow any for flexibility)
  const validGroups = POINT_GROUPS[system.toLowerCase()];
  if (validGroups && !validGroups.includes(pointGroup)) {
    // Just warn, don't fail
    console.warn(`Point group ${pointGroup} may not be valid for ${system} system`);
  }

  // Parse forms (separated by +)
  const formStrings = formsStr.split('+').map(s => s.trim());
  const forms: CrystalForm[] = [];

  for (const formStr of formStrings) {
    const form = parseForm(formStr);
    if (!form) {
      return { valid: false, error: `Invalid form expression: ${formStr}` };
    }
    forms.push(form);
  }

  if (forms.length === 0) {
    return { valid: false, error: 'At least one crystal form is required' };
  }

  // Parse twin and modifications from modifier string
  let twin: TwinSpec | undefined;
  const modifications: ModificationSpec[] = [];

  if (modifier) {
    // Parse twin: twin(name)
    const twinMatch = modifier.match(/twin\s*\(\s*(\w+)\s*\)/i);
    if (twinMatch) {
      twin = { law: twinMatch[1].toLowerCase() };
    }

    // Parse modifications: elongate(c:2.0), flatten(a:0.5), scale(b:1.5)
    const modRegex = /(elongate|flatten|scale)\s*\(\s*([abc])\s*:\s*([\d.]+)\s*\)/gi;
    let modMatch;
    while ((modMatch = modRegex.exec(modifier)) !== null) {
      modifications.push({
        type: modMatch[1].toLowerCase() as ModificationSpec['type'],
        axis: modMatch[2].toLowerCase() as ModificationSpec['axis'],
        factor: parseFloat(modMatch[3]),
      });
    }
  }

  return {
    valid: true,
    parsed: {
      system: system.toLowerCase(),
      pointGroup,
      forms,
      modifier,
      twin,
      modifications: modifications.length > 0 ? modifications : undefined,
    },
  };
}

/**
 * Quick validation without full parsing
 */
export function validateCDL(cdl: string): ValidationResult {
  return parseCDL(cdl);
}
