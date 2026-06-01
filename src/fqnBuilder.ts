import { parseNamespaceAtPosition } from './csharpNamespace';
import { containsPosition, FlatSymbolNode, isSupportedSymbolKind, Position, SymbolKind, SymbolNode } from './symbolTypes';

export interface BuildFullyQualifiedNameOptions {
  readonly includeMethodSignature?: boolean;
}

interface WordAtPosition {
  readonly text: string;
  readonly line: number;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

export function findSymbolPath(symbols: readonly SymbolNode[], position: Position): readonly SymbolNode[] | undefined {
  for (const symbol of symbols) {
    const path = findSymbolPathInNode(symbol, position);
    if (path) {
      return path;
    }
  }

  return undefined;
}

export function findFlatSymbolAtPosition(
  symbols: readonly FlatSymbolNode[],
  position: Position,
  documentText?: string
): FlatSymbolNode | undefined {
  const wordAtPosition = documentText ? getWordAtPosition(documentText, position) : undefined;
  return symbols
    .filter(symbol =>
      isSupportedSymbolKind(symbol.kind) &&
      containsPosition(symbol.range, position) &&
      (!documentText || isFlatSymbolDeclarationHit(symbol, documentText, wordAtPosition))
    )
    .sort((left, right) => rangeSize(left.range) - rangeSize(right.range))[0];
}

export function buildFullyQualifiedName(
  path: readonly SymbolNode[] | undefined,
  documentText: string,
  position: Position,
  options: BuildFullyQualifiedNameOptions = {}
): string | undefined {
  if (!path || path.length === 0) {
    return undefined;
  }

  const terminal = path[path.length - 1];
  if (!isSupportedSymbolKind(terminal.kind)) {
    return undefined;
  }

  const hasNamespaceSymbol = path.some(symbol => symbol.kind === SymbolKind.Namespace);
  const parts: string[] = [];

  if (!hasNamespaceSymbol) {
    const namespaceName = parseNamespaceAtPosition(documentText, position);
    if (namespaceName) {
      parts.push(...splitNameParts(namespaceName));
    }
  }

  for (const symbol of path) {
    if (!isSupportedSymbolKind(symbol.kind)) {
      continue;
    }

    const normalizedName = normalizeSymbolName(symbol.name, symbol.kind, options);
    if (normalizedName.length === 0) {
      return undefined;
    }

    parts.push(...splitNameParts(normalizedName));
  }

  return parts.length > 0 ? parts.join('.') : undefined;
}

export function buildFullyQualifiedNameFromFlatSymbol(
  symbol: FlatSymbolNode | undefined,
  documentText: string,
  position: Position,
  options: BuildFullyQualifiedNameOptions = {}
): string | undefined {
  if (!symbol || !isSupportedSymbolKind(symbol.kind)) {
    return undefined;
  }

  const parts: string[] = [];
  const namespaceName = parseNamespaceAtPosition(documentText, position);
  const containerName = symbol.containerName?.trim();

  if (namespaceName && (!containerName || !isWithinNamespace(containerName, namespaceName))) {
    parts.push(...splitNameParts(namespaceName));
  }

  if (containerName && containerName.length > 0) {
    parts.push(...splitNameParts(containerName));
  }

  const normalizedName = normalizeSymbolName(symbol.name, symbol.kind, options);
  if (normalizedName.length === 0) {
    return undefined;
  }

  parts.push(...splitNameParts(normalizedName));
  return parts.length > 0 ? parts.join('.') : undefined;
}

export function buildFullyQualifiedNameFromFlatSymbols(
  symbols: readonly FlatSymbolNode[],
  documentText: string,
  position: Position,
  options: BuildFullyQualifiedNameOptions = {}
): string | undefined {
  const targetSymbol = findFlatSymbolAtPosition(symbols, position, documentText);
  if (!targetSymbol) {
    return undefined;
  }

  const containerSymbols = findFlatContainerSymbols(symbols, targetSymbol);
  const containerSymbolsByName = findFlatContainerSymbolsByName(symbols, targetSymbol, containerSymbols);
  if (!containerSymbolsByName) {
    return undefined;
  }

  const allContainerSymbols = mergeContainerSymbols(containerSymbols, containerSymbolsByName);
  const namespaceName = parseNamespaceAtPosition(documentText, position);
  const parts: string[] = [];
  const hasNamespaceSymbol = targetSymbol.kind === SymbolKind.Namespace ||
    allContainerSymbols.some(symbol => symbol.kind === SymbolKind.Namespace);

  if (namespaceName && !hasNamespaceSymbol) {
    parts.push(...splitNameParts(namespaceName));
  }

  for (const containerSymbol of allContainerSymbols) {
    const normalizedName = normalizeSymbolName(containerSymbol.name, containerSymbol.kind, options);
    if (normalizedName.length === 0) {
      return undefined;
    }

    parts.push(...splitNameParts(normalizedName));
  }

  appendContainerNameParts(parts, targetSymbol.containerName, namespaceName);

  const normalizedName = normalizeSymbolName(targetSymbol.name, targetSymbol.kind, options);
  if (normalizedName.length === 0) {
    return undefined;
  }

  parts.push(...splitNameParts(normalizedName));
  return parts.length > 0 ? parts.join('.') : undefined;
}

export function normalizeSymbolName(
  name: string,
  kind: SymbolKind,
  options: BuildFullyQualifiedNameOptions = {}
): string {
  const trimmedName = name.trim();
  if (options.includeMethodSignature && keepsSignature(kind)) {
    return trimmedName.replace(/\s+/g, ' ');
  }

  if (!keepsSignature(kind)) {
    return trimmedName;
  }

  const parameterStart = trimmedName.indexOf('(');
  return parameterStart >= 0 ? trimmedName.slice(0, parameterStart).trimEnd() : trimmedName;
}

function findSymbolPathInNode(symbol: SymbolNode, position: Position): readonly SymbolNode[] | undefined {
  if (!containsPosition(symbol.range, position) && !containsPosition(symbol.selectionRange, position)) {
    return undefined;
  }

  for (const child of symbol.children ?? []) {
    const childPath = findSymbolPathInNode(child, position);
    if (childPath) {
      return [symbol, ...childPath];
    }
  }

  if (containsPosition(symbol.selectionRange, position) && isSupportedSymbolKind(symbol.kind)) {
    return [symbol];
  }

  return undefined;
}

function keepsSignature(kind: SymbolKind): boolean {
  return kind === SymbolKind.Method || kind === SymbolKind.Constructor || kind === SymbolKind.Function;
}

function splitNameParts(name: string): string[] {
  return name
    .split('.')
    .map(part => part.trim())
    .filter(part => part.length > 0);
}

function isWithinNamespace(containerName: string, namespaceName: string): boolean {
  return containerName === namespaceName || containerName.startsWith(`${namespaceName}.`);
}

function findFlatContainerSymbols(
  symbols: readonly FlatSymbolNode[],
  targetSymbol: FlatSymbolNode
): readonly FlatSymbolNode[] {
  return symbols
    .filter(symbol =>
      symbol !== targetSymbol &&
      isContainerSymbolKind(symbol.kind) &&
      containsPosition(symbol.range, targetSymbol.range.start) &&
      containsPosition(symbol.range, targetSymbol.range.end)
    )
    .sort((left, right) => rangeSize(right.range) - rangeSize(left.range));
}

function findFlatContainerSymbolsByName(
  symbols: readonly FlatSymbolNode[],
  targetSymbol: FlatSymbolNode,
  rangeContainers: readonly FlatSymbolNode[]
): readonly FlatSymbolNode[] | undefined {
  const containers: FlatSymbolNode[] = [];
  let nextContainerName = targetSymbol.containerName?.trim();
  const seenNames = new Set<string>();
  const rangeContainerSet = new Set(rangeContainers);

  while (nextContainerName && !seenNames.has(nextContainerName)) {
    seenNames.add(nextContainerName);
    const candidateSymbols = symbols.filter(symbol =>
      symbol !== targetSymbol &&
      isContainerSymbolKind(symbol.kind) &&
      normalizeSymbolName(symbol.name, symbol.kind) === nextContainerName
    );

    const containerSymbol = chooseFlatContainerSymbol(candidateSymbols, rangeContainerSet);
    if (!containerSymbol) {
      return candidateSymbols.length === 0 ? containers : undefined;
    }

    containers.unshift(containerSymbol);
    nextContainerName = containerSymbol.containerName?.trim();
  }

  return containers;
}

function chooseFlatContainerSymbol(
  candidateSymbols: readonly FlatSymbolNode[],
  rangeContainerSet: ReadonlySet<FlatSymbolNode>
): FlatSymbolNode | undefined {
  if (candidateSymbols.length === 1) {
    return candidateSymbols[0];
  }

  const rangeMatchedSymbols = candidateSymbols.filter(symbol => rangeContainerSet.has(symbol));
  return rangeMatchedSymbols.length === 1 ? rangeMatchedSymbols[0] : undefined;
}

function mergeContainerSymbols(
  rangeContainers: readonly FlatSymbolNode[],
  nameContainers: readonly FlatSymbolNode[]
): readonly FlatSymbolNode[] {
  if (nameContainers.length === 0) {
    return rangeContainers;
  }

  if (rangeContainers.length === 0) {
    return nameContainers;
  }

  const merged = [...rangeContainers];
  for (const nameContainer of nameContainers) {
    if (merged.includes(nameContainer)) {
      continue;
    }

    const previousNameContainerIndex = findPreviousKnownContainerIndex(nameContainers, merged, nameContainer);
    if (previousNameContainerIndex >= 0) {
      const insertionIndex = merged.indexOf(nameContainers[previousNameContainerIndex]) + 1;
      merged.splice(insertionIndex, 0, nameContainer);
      continue;
    }

    const nextNameContainerIndex = nameContainers.findIndex(symbol => symbol !== nameContainer && merged.includes(symbol));
    if (nextNameContainerIndex >= 0) {
      const insertionIndex = merged.indexOf(nameContainers[nextNameContainerIndex]);
      merged.splice(insertionIndex, 0, nameContainer);
    } else {
      merged.push(nameContainer);
    }
  }

  return merged;
}

function findPreviousKnownContainerIndex(
  nameContainers: readonly FlatSymbolNode[],
  merged: readonly FlatSymbolNode[],
  nameContainer: FlatSymbolNode
): number {
  const currentIndex = nameContainers.indexOf(nameContainer);
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (merged.includes(nameContainers[index])) {
      return index;
    }
  }

  return -1;
}

function isContainerSymbolKind(kind: SymbolKind): boolean {
  return kind === SymbolKind.Namespace ||
    kind === SymbolKind.Class ||
    kind === SymbolKind.Interface ||
    kind === SymbolKind.Struct ||
    kind === SymbolKind.Enum;
}

function appendContainerNameParts(parts: string[], containerName: string | undefined, namespaceName: string | undefined): void {
  const trimmedContainerName = containerName?.trim();
  if (!trimmedContainerName) {
    return;
  }

  let containerParts = splitNameParts(trimmedContainerName);
  if (namespaceName && isWithinNamespace(trimmedContainerName, namespaceName)) {
    const namespaceParts = splitNameParts(namespaceName);
    containerParts = containerParts.slice(namespaceParts.length);
  }

  if (endsWithParts(parts, containerParts)) {
    return;
  }

  const overlap = longestSuffixPrefixOverlap(parts, containerParts);
  parts.push(...containerParts.slice(overlap));
}

function endsWithParts(parts: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length > parts.length) {
    return false;
  }

  return suffix.every((part, index) => parts[parts.length - suffix.length + index] === part);
}

function longestSuffixPrefixOverlap(parts: readonly string[], nextParts: readonly string[]): number {
  const maxOverlap = Math.min(parts.length, nextParts.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const suffix = parts.slice(parts.length - overlap);
    const prefix = nextParts.slice(0, overlap);
    if (suffix.every((part, index) => part === prefix[index])) {
      return overlap;
    }
  }

  return 0;
}

function rangeSize(range: { readonly start: Position; readonly end: Position }): number {
  return ((range.end.line - range.start.line) * 1_000_000) + (range.end.character - range.start.character);
}

function isFlatSymbolDeclarationHit(
  symbol: FlatSymbolNode,
  documentText: string,
  wordAtPosition: WordAtPosition | undefined
): boolean {
  if (!wordAtPosition || wordAtPosition.text !== flatSymbolCursorIdentifier(symbol)) {
    if (symbol.kind !== SymbolKind.Namespace || !isNamespaceSegment(symbol, wordAtPosition)) {
      return false;
    }
  }

  if (!wordAtPosition) {
    return false;
  }

  const symbolStartOffset = offsetAt(documentText, symbol.range.start);
  const symbolEndOffset = offsetAt(documentText, symbol.range.end);
  const wordStartOffset = offsetAt(documentText, {
    line: wordAtPosition.line,
    character: wordAtPosition.startCharacter
  });
  const wordEndOffset = offsetAt(documentText, {
    line: wordAtPosition.line,
    character: wordAtPosition.endCharacter
  });
  const headerEndOffset = findDeclarationHeaderEnd(documentText, symbolStartOffset, symbolEndOffset);

  return wordStartOffset >= symbolStartOffset && wordEndOffset <= headerEndOffset;
}

function flatSymbolCursorIdentifier(symbol: FlatSymbolNode): string {
  const normalizedName = normalizeSymbolName(symbol.name, symbol.kind);
  const parts = splitNameParts(normalizedName);
  return stripGenericSuffix(parts[parts.length - 1] ?? '');
}

function isNamespaceSegment(symbol: FlatSymbolNode, wordAtPosition: WordAtPosition | undefined): boolean {
  if (!wordAtPosition) {
    return false;
  }

  return splitNameParts(symbol.name).includes(wordAtPosition.text);
}

function stripGenericSuffix(name: string): string {
  const genericStart = name.indexOf('<');
  return genericStart >= 0 ? name.slice(0, genericStart) : name;
}

function getWordAtPosition(text: string, position: Position): WordAtPosition | undefined {
  const lineText = getLineText(text, position.line);
  if (position.character < 0 || position.character > lineText.length) {
    return undefined;
  }

  const character = lineText[position.character];
  const previousCharacter = lineText[position.character - 1];
  if (!isIdentifierPart(character) && !isIdentifierPart(previousCharacter)) {
    return undefined;
  }

  let start = position.character;
  if (!isIdentifierPart(lineText[start]) && start > 0) {
    start -= 1;
  }

  while (start > 0 && isIdentifierPart(lineText[start - 1])) {
    start -= 1;
  }

  let end = position.character;
  while (end < lineText.length && isIdentifierPart(lineText[end])) {
    end += 1;
  }

  if (end <= start) {
    return undefined;
  }

  return {
    text: lineText.slice(start, end),
    line: position.line,
    startCharacter: start,
    endCharacter: end
  };
}

function getLineText(text: string, targetLine: number): string {
  const lines = text.split(/\r\n|\r|\n/);
  return lines[targetLine] ?? '';
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

function findDeclarationHeaderEnd(text: string, startOffset: number, endOffset: number): number {
  for (let offset = startOffset; offset < endOffset; offset += 1) {
    if (text[offset] === '{' || text[offset] === ';') {
      return offset;
    }

    if (text[offset] === '=' && text[offset + 1] === '>') {
      return offset;
    }
  }

  return endOffset;
}

function offsetAt(text: string, position: Position): number {
  let line = 0;
  let character = 0;

  for (let offset = 0; offset < text.length; offset += 1) {
    if (line === position.line && character === position.character) {
      return offset;
    }

    const current = text[offset];
    if (current === '\r') {
      if (text[offset + 1] === '\n') {
        offset += 1;
      }

      line += 1;
      character = 0;
      continue;
    }

    if (current === '\n') {
      line += 1;
      character = 0;
      continue;
    }

    character += 1;
  }

  return text.length;
}
