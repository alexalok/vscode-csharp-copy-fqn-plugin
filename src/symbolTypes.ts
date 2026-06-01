export interface Position {
  readonly line: number;
  readonly character: number;
}

export interface Range {
  readonly start: Position;
  readonly end: Position;
}

export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25
}

export interface SymbolNode {
  readonly name: string;
  readonly detail?: string;
  readonly kind: SymbolKind;
  readonly range: Range;
  readonly selectionRange: Range;
  readonly children?: readonly SymbolNode[];
}

export interface FlatSymbolNode {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly range: Range;
  readonly containerName?: string;
}

const supportedSymbolKinds = new Set<SymbolKind>([
  SymbolKind.Namespace,
  SymbolKind.Class,
  SymbolKind.Method,
  SymbolKind.Property,
  SymbolKind.Field,
  SymbolKind.Constructor,
  SymbolKind.Enum,
  SymbolKind.Interface,
  SymbolKind.Function,
  SymbolKind.EnumMember,
  SymbolKind.Struct,
  SymbolKind.Event
]);

export function isSupportedSymbolKind(kind: SymbolKind): boolean {
  return supportedSymbolKinds.has(kind);
}

export function comparePositions(left: Position, right: Position): number {
  if (left.line !== right.line) {
    return left.line - right.line;
  }

  return left.character - right.character;
}

export function containsPosition(range: Range, position: Position): boolean {
  return comparePositions(range.start, position) <= 0 && comparePositions(position, range.end) <= 0;
}
