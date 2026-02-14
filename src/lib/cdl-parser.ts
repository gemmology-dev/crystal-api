/**
 * CDL Parser v1.3 - Recursive descent implementation (Worker variant)
 * Parses Crystal Description Language strings into structured form data.
 *
 * Includes TwinSpec and ModificationSpec extraction for the crystal-api worker.
 * Supports: grouping, labels, definitions, references, comments (line/block/doc)
 */

// =============================================================================
// Interfaces
// =============================================================================

export interface MillerIndex {
  h: number;
  k: number;
  l: number;
  i?: number; // For 4-index hexagonal notation
}

export interface CrystalForm {
  millerIndex: MillerIndex;
  scale: number;
  features?: string; // Raw feature content from [...] e.g., "trigon:dense, phantom:3"
  label?: string; // Optional label e.g., "prism" in prism:{10-10}
}

export interface FormGroup {
  forms: FormNode[];
  features?: string; // Shared features applied to all children
  label?: string;
}

export type FormNode = CrystalForm | FormGroup;

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
  forms: FormNode[];
  modifier?: string;
  phenomenon?: string; // Raw phenomenon content e.g., "asterism:6"
  twin?: TwinSpec;
  modifications?: ModificationSpec[];
  definitions?: Record<string, string>; // name -> raw expression text
  docComments?: string[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  parsed?: CDLParseResult;
}

// =============================================================================
// Type guards and helpers
// =============================================================================

export function isFormGroup(node: FormNode): node is FormGroup {
  return 'forms' in node && Array.isArray((node as FormGroup).forms);
}

/**
 * Flatten a FormNode tree into a flat list of CrystalForm objects.
 * Group features are merged into child forms (group features first).
 */
export function flatForms(forms: FormNode[]): CrystalForm[] {
  const result: CrystalForm[] = [];
  for (const node of forms) {
    flattenNode(node, undefined, result);
  }
  return result;
}

function flattenNode(
  node: FormNode,
  parentFeatures: string | undefined,
  result: CrystalForm[],
): void {
  if (isFormGroup(node)) {
    const combined = mergeFeatures(parentFeatures, node.features);
    for (const child of node.forms) {
      flattenNode(child, combined, result);
    }
  } else {
    const merged = mergeFeatures(parentFeatures, node.features);
    result.push({
      millerIndex: node.millerIndex,
      scale: node.scale,
      features: merged,
      label: node.label,
    });
  }
}

function mergeFeatures(
  parent: string | undefined,
  child: string | undefined,
): string | undefined {
  if (parent && child) return `${parent}, ${child}`;
  return parent || child;
}

// =============================================================================
// Constants
// =============================================================================

const CRYSTAL_SYSTEMS = new Set([
  'cubic',
  'hexagonal',
  'trigonal',
  'tetragonal',
  'orthorhombic',
  'monoclinic',
  'triclinic',
]);

// Common point groups by system (used for validation warnings)
const POINT_GROUPS: Record<string, string[]> = {
  cubic: ['m3m', '432', '-43m', 'm3', 'm-3', '23'],
  hexagonal: ['6/mmm', '6mm', '-6m2', '622', '6/m', '-6', '6'],
  trigonal: ['-3m', '3m', '32', '-3', '3'],
  tetragonal: ['4/mmm', '4mm', '-42m', '422', '4/m', '-4', '4'],
  orthorhombic: ['mmm', 'mm2', '222'],
  monoclinic: ['2/m', 'm', '2'],
  triclinic: ['-1', '1'],
};

// All valid point groups (for lexer identification)
const ALL_POINT_GROUPS = new Set<string>();
for (const groups of Object.values(POINT_GROUPS)) {
  for (const g of groups) {
    ALL_POINT_GROUPS.add(g);
  }
}

// =============================================================================
// Comment Stripping
// =============================================================================

function stripComments(cdl: string): { cleaned: string; docComments: string[] } {
  const docComments: string[] = [];

  // Extract doc comments (#! ...) line by line
  const lines = cdl.split('\n');
  const processedLines: string[] = [];
  for (const line of lines) {
    const stripped = line.trimStart();
    if (stripped.startsWith('#!')) {
      docComments.push(stripped.substring(2).trim());
    } else {
      processedLines.push(line);
    }
  }

  let text = processedLines.join('\n');

  // Remove block comments /* ... */
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments # ... (to end of line)
  text = text.replace(/#[^\n]*/g, '');

  return { cleaned: text, docComments };
}

// =============================================================================
// Definition Pre-processing
// =============================================================================

function preprocessDefinitions(
  text: string,
): { body: string; definitions: Record<string, string> } {
  const lines = text.split('\n');
  const definitions: Record<string, string> = {};
  const defOrder: string[] = [];
  const bodyLines: string[] = [];

  // Extract definition lines (@name = expression)
  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) {
      bodyLines.push(line);
      continue;
    }
    const match = stripped.match(/^@(\w+)\s*=\s*(.+)/);
    if (match) {
      const name = match[1];
      const body = match[2].trim();
      definitions[name] = body;
      defOrder.push(name);
    } else {
      bodyLines.push(line);
    }
  }

  // Resolve references within definitions (in order)
  const resolved: Record<string, string> = {};
  for (const name of defOrder) {
    let body = definitions[name];
    for (const [prevName, prevBody] of Object.entries(resolved)) {
      body = body.replace(new RegExp('\\$' + prevName + '(?!\\w)', 'g'), prevBody);
    }
    resolved[name] = body;
  }

  // Resolve references in the body text
  let bodyText = bodyLines.join('\n');
  for (const [name, resolvedBody] of Object.entries(resolved)) {
    bodyText = bodyText.replace(
      new RegExp('\\$' + name + '(?!\\w)', 'g'),
      resolvedBody,
    );
  }

  // Check for unresolved $references
  const unresolved = bodyText.match(/\$(\w+)/);
  if (unresolved) {
    throw new Error(`Undefined reference: $${unresolved[1]}`);
  }

  return {
    body: bodyText,
    definitions: defOrder.length > 0 ? definitions : {},
  };
}

// =============================================================================
// Token Types
// =============================================================================

const enum TokenType {
  SYSTEM = 'SYSTEM',
  POINT_GROUP = 'POINT_GROUP',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COLON = 'COLON',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  PLUS = 'PLUS',
  PIPE = 'PIPE',
  AT = 'AT',
  COMMA = 'COMMA',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  INTEGER = 'INTEGER',
  FLOAT = 'FLOAT',
  IDENTIFIER = 'IDENTIFIER',
  EOF = 'EOF',
}

interface Token {
  type: TokenType;
  value: string | number | null;
  position: number;
  raw?: string;
}

// =============================================================================
// Lexer
// =============================================================================

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  '[': TokenType.LBRACKET,
  ']': TokenType.RBRACKET,
  '{': TokenType.LBRACE,
  '}': TokenType.RBRACE,
  ':': TokenType.COLON,
  '+': TokenType.PLUS,
  '|': TokenType.PIPE,
  '@': TokenType.AT,
  ',': TokenType.COMMA,
  '(': TokenType.LPAREN,
  ')': TokenType.RPAREN,
  '$': TokenType.EOF,
  '=': TokenType.EOF,
};

class Lexer {
  private text: string;
  private pos: number;
  private length: number;

  constructor(text: string) {
    this.text = text;
    this.pos = 0;
    this.length = text.length;
  }

  private skipWhitespace(): void {
    while (this.pos < this.length && /\s/.test(this.text[this.pos])) {
      this.pos++;
    }
  }

  private readNumber(): Token {
    const start = this.pos;
    let hasDecimal = false;

    if (this.text[this.pos] === '-') {
      this.pos++;
    }

    while (this.pos < this.length) {
      const ch = this.text[this.pos];
      if (/\d/.test(ch)) {
        this.pos++;
      } else if (ch === '.' && !hasDecimal) {
        hasDecimal = true;
        this.pos++;
      } else {
        break;
      }
    }

    const raw = this.text.substring(start, this.pos);
    if (hasDecimal) {
      return { type: TokenType.FLOAT, value: parseFloat(raw), position: start, raw };
    }
    return { type: TokenType.INTEGER, value: parseInt(raw, 10), position: start, raw };
  }

  private readIdentifier(): Token {
    const start = this.pos;

    while (this.pos < this.length) {
      const ch = this.text[this.pos];
      if (/[a-zA-Z0-9_\/-]/.test(ch)) {
        this.pos++;
      } else {
        break;
      }
    }

    const value = this.text.substring(start, this.pos);
    const valueLower = value.toLowerCase();

    if (CRYSTAL_SYSTEMS.has(valueLower)) {
      return { type: TokenType.SYSTEM, value: valueLower, position: start };
    }

    if (ALL_POINT_GROUPS.has(value)) {
      return { type: TokenType.POINT_GROUP, value, position: start };
    }

    return { type: TokenType.IDENTIFIER, value, position: start };
  }

  private tryPointGroup(): string | null {
    let tempPos = this.pos;
    while (
      tempPos < this.length &&
      /[a-zA-Z0-9\/-]/.test(this.text[tempPos])
    ) {
      tempPos++;
    }
    const potential = this.text.substring(this.pos, tempPos);
    if (ALL_POINT_GROUPS.has(potential)) {
      if (tempPos < this.length && this.text[tempPos] === '.') {
        return null;
      }
      return potential;
    }
    return null;
  }

  nextToken(): Token {
    this.skipWhitespace();

    if (this.pos >= this.length) {
      return { type: TokenType.EOF, value: null, position: this.pos };
    }

    const ch = this.text[this.pos];
    const start = this.pos;

    if (ch in SINGLE_CHAR_TOKENS) {
      this.pos++;
      return { type: SINGLE_CHAR_TOKENS[ch], value: ch, position: start };
    }

    if (/\d/.test(ch)) {
      const pg = this.tryPointGroup();
      if (pg) {
        this.pos += pg.length;
        return { type: TokenType.POINT_GROUP, value: pg, position: start };
      }
      return this.readNumber();
    }

    if (ch === '-' && this.pos + 1 < this.length && /\d/.test(this.text[this.pos + 1])) {
      const pg = this.tryPointGroup();
      if (pg) {
        this.pos += pg.length;
        return { type: TokenType.POINT_GROUP, value: pg, position: start };
      }
      return this.readNumber();
    }

    if (/[a-zA-Z_]/.test(ch)) {
      return this.readIdentifier();
    }

    throw new Error(`Unexpected character '${ch}' at position ${this.pos}`);
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const token = this.nextToken();
      tokens.push(token);
      if (token.type === TokenType.EOF) break;
    }
    return tokens;
  }
}

// =============================================================================
// Parser
// =============================================================================

class CDLParser {
  private tokens: Token[];
  private text: string;
  private pos: number;

  constructor(tokens: Token[], text: string) {
    this.tokens = tokens;
    this.text = text;
    this.pos = 0;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private peek(offset: number = 1): Token {
    const idx = this.pos + offset;
    if (idx < this.tokens.length) return this.tokens[idx];
    return this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const token = this.current();
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new Error(
        `Expected ${type}, got ${token.type} at position ${token.position}`,
      );
    }
    return this.advance();
  }

  parse(): CDLParseResult {
    const systemToken = this.expect(TokenType.SYSTEM);
    const system = systemToken.value as string;

    this.expect(TokenType.LBRACKET);
    const pgToken = this.current();
    let pointGroup: string;
    if (
      pgToken.type === TokenType.POINT_GROUP ||
      pgToken.type === TokenType.IDENTIFIER
    ) {
      pointGroup = this.advance().value as string;
    } else {
      throw new Error(
        `Expected point group, got ${pgToken.type} at position ${pgToken.position}`,
      );
    }
    this.expect(TokenType.RBRACKET);

    const validGroups = POINT_GROUPS[system];
    if (validGroups && !validGroups.includes(pointGroup)) {
      console.warn(
        `Point group ${pointGroup} may not be valid for ${system} system`,
      );
    }

    this.expect(TokenType.COLON);

    const forms = this.parseFormList();

    // Parse optional modifier (everything after |)
    let modifier: string | undefined;
    let phenomenon: string | undefined;
    let twin: TwinSpec | undefined;
    const modifications: ModificationSpec[] = [];

    if (this.current().type === TokenType.PIPE) {
      const pipePos = this.current().position;
      modifier = this.text.substring(pipePos + 1).trim();

      // Extract twin: twin(name)
      const twinMatch = modifier.match(/twin\s*\(\s*(\w+)\s*\)/i);
      if (twinMatch) {
        twin = { law: twinMatch[1].toLowerCase() };
      }

      // Extract modifications: elongate(c:2.0), flatten(a:0.5), scale(b:1.5)
      const modRegex = /(elongate|flatten|scale)\s*\(\s*([abc])\s*:\s*([\d.]+)\s*\)/gi;
      let modMatch;
      while ((modMatch = modRegex.exec(modifier)) !== null) {
        modifications.push({
          type: modMatch[1].toLowerCase() as ModificationSpec['type'],
          axis: modMatch[2].toLowerCase() as ModificationSpec['axis'],
          factor: parseFloat(modMatch[3]),
        });
      }

      // Extract phenomenon: phenomenon[type:params]
      const phenMatch = modifier.match(/phenomenon\[([^\]]*)\]/i);
      if (phenMatch) {
        phenomenon = phenMatch[1];
      }

      // Advance past all remaining tokens
      while (this.current().type !== TokenType.EOF) {
        this.advance();
      }
    }

    return {
      system,
      pointGroup,
      forms,
      modifier,
      phenomenon,
      twin,
      modifications: modifications.length > 0 ? modifications : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Form parsing
  // ---------------------------------------------------------------------------

  private parseFormList(): FormNode[] {
    const forms: FormNode[] = [this.parseFormOrGroup()];

    while (this.current().type === TokenType.PLUS) {
      this.advance();
      forms.push(this.parseFormOrGroup());
    }

    return forms;
  }

  private parseFormOrGroup(): FormNode {
    let label: string | undefined;

    if (this.current().type === TokenType.IDENTIFIER) {
      if (this.peek().type === TokenType.COLON) {
        const afterColon = this.peek(2);
        if (
          afterColon.type === TokenType.LPAREN ||
          afterColon.type === TokenType.LBRACE
        ) {
          label = this.current().value as string;
          this.advance();
          this.advance();
        }
      }
    }

    if (this.current().type === TokenType.LPAREN) {
      return this.parseGroup(label);
    }
    return this.parseForm(label);
  }

  private parseGroup(label?: string): FormGroup {
    this.advance(); // consume (

    const forms = this.parseFormList();

    this.expect(TokenType.RPAREN);

    let features: string | undefined;
    if (this.current().type === TokenType.LBRACKET) {
      features = this.parseRawFeatures();
    }

    return { forms, features, label };
  }

  private parseForm(label?: string): CrystalForm {
    const millerIndex = this.parseMillerIndex();

    let scale = 1.0;
    if (this.current().type === TokenType.AT) {
      this.advance();
      scale = this.parseScale();
    }

    let features: string | undefined;
    if (this.current().type === TokenType.LBRACKET) {
      features = this.parseRawFeatures();
    }

    return { millerIndex, scale, features, label };
  }

  // ---------------------------------------------------------------------------
  // Miller index parsing
  // ---------------------------------------------------------------------------

  private parseMillerIndex(): MillerIndex {
    this.expect(TokenType.LBRACE);

    const indices: number[] = [];

    while (
      this.current().type === TokenType.INTEGER ||
      (this.current().type === TokenType.POINT_GROUP &&
        /^-?\d+$/.test(String(this.current().value)))
    ) {
      const token = this.advance();

      if (token.type === TokenType.POINT_GROUP) {
        indices.push(parseInt(String(token.value), 10));
        if (this.current().type === TokenType.COMMA) this.advance();
        continue;
      }

      const raw = token.raw || String(token.value);

      let sign = 1;
      let rawDigits = raw;
      if (raw.startsWith('-')) {
        sign = -1;
        rawDigits = raw.substring(1);
      }

      if (rawDigits.length >= 2) {
        for (let idx = 0; idx < rawDigits.length; idx++) {
          if (idx === 0) {
            indices.push(sign * parseInt(rawDigits[idx], 10));
          } else {
            indices.push(parseInt(rawDigits[idx], 10));
          }
        }
      } else {
        indices.push(token.value as number);
      }

      if (this.current().type === TokenType.COMMA) this.advance();
    }

    this.expect(TokenType.RBRACE);

    if (indices.length === 3) {
      return { h: indices[0], k: indices[1], l: indices[2] };
    }
    if (indices.length === 4) {
      return { h: indices[0], k: indices[1], i: indices[2], l: indices[3] };
    }

    throw new Error(
      `Miller index must have 3 or 4 components, got ${indices.length}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Scale parsing
  // ---------------------------------------------------------------------------

  private parseScale(): number {
    const token = this.current();
    if (token.type === TokenType.FLOAT || token.type === TokenType.INTEGER) {
      this.advance();
      return typeof token.value === 'number'
        ? token.value
        : parseFloat(String(token.value));
    }
    if (token.type === TokenType.POINT_GROUP) {
      const num = parseFloat(String(token.value));
      if (!isNaN(num)) {
        this.advance();
        return num;
      }
    }
    throw new Error(
      `Expected scale value after @, got ${token.type} at position ${token.position}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Feature parsing (raw string extraction)
  // ---------------------------------------------------------------------------

  private parseRawFeatures(): string | undefined {
    this.advance(); // consume [
    const startPos = this.current().position;

    let depth = 0;
    while (true) {
      if (this.current().type === TokenType.EOF) {
        throw new Error('Unterminated feature brackets');
      }
      if (this.current().type === TokenType.LBRACKET) depth++;
      if (this.current().type === TokenType.RBRACKET) {
        if (depth === 0) break;
        depth--;
      }
      this.advance();
    }

    const endPos = this.current().position;
    this.advance(); // consume ]

    const raw = this.text.substring(startPos, endPos).trim();
    return raw || undefined;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse a complete CDL expression.
 * Format: system[point_group]:{form}@scale + {form}@scale | modifier
 */
export function parseCDL(cdl: string): ValidationResult {
  try {
    const trimmed = cdl.trim();
    if (!trimmed) {
      return { valid: false, error: 'CDL expression is required' };
    }
    if (trimmed.length > 5000) {
      return {
        valid: false,
        error: 'CDL expression too long (max 5000 characters)',
      };
    }

    // Strip comments
    const { cleaned, docComments } = stripComments(trimmed);
    const cleanedTrimmed = cleaned.trim();
    if (!cleanedTrimmed) {
      return { valid: false, error: 'CDL expression is required' };
    }

    // Preprocess definitions
    const { body, definitions } = preprocessDefinitions(cleanedTrimmed);
    const bodyTrimmed = body.trim();
    if (!bodyTrimmed) {
      return { valid: false, error: 'CDL expression is required' };
    }

    // Tokenize
    const lexer = new Lexer(bodyTrimmed);
    const tokens = lexer.tokenize();

    // Parse
    const parser = new CDLParser(tokens, bodyTrimmed);
    const result = parser.parse();

    // Attach definitions and doc comments
    if (Object.keys(definitions).length > 0) {
      result.definitions = definitions;
    }
    if (docComments.length > 0) {
      result.docComments = docComments;
    }

    return { valid: true, parsed: result };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Quick validation without full parsing (delegates to parseCDL).
 */
export function validateCDL(cdl: string): ValidationResult {
  return parseCDL(cdl);
}
