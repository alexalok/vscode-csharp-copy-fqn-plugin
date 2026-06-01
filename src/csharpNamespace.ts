import { Position } from './symbolTypes';

type TokenKind = 'identifier' | 'dot' | 'openBrace' | 'closeBrace' | 'semicolon';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly offset: number;
}

interface ParsedName {
  readonly name: string;
  readonly nextIndex: number;
}

interface NamespaceBlock {
  readonly name: string;
  readonly startOffset: number;
}

export function parseNamespaceAtPosition(text: string, position: Position): string | undefined {
  const targetOffset = offsetAt(text, position);
  const tokens = tokenizeCSharp(text);
  const fileScopedNamespaces: string[] = [];
  const matchingBlocks: NamespaceBlock[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== 'identifier' || token.text !== 'namespace' || token.offset > targetOffset) {
      continue;
    }

    const parsedName = parseQualifiedName(tokens, index + 1);
    if (!parsedName) {
      continue;
    }

    const delimiter = tokens[parsedName.nextIndex];
    if (!delimiter) {
      continue;
    }

    if (delimiter.kind === 'semicolon' && delimiter.offset <= targetOffset) {
      fileScopedNamespaces.splice(0, fileScopedNamespaces.length, parsedName.name);
      continue;
    }

    if (delimiter.kind !== 'openBrace') {
      continue;
    }

    const closeBrace = findMatchingBrace(tokens, parsedName.nextIndex);
    const endOffset = closeBrace?.offset ?? Number.POSITIVE_INFINITY;
    if (delimiter.offset <= targetOffset && targetOffset <= endOffset) {
      matchingBlocks.push({ name: parsedName.name, startOffset: delimiter.offset });
    }
  }

  const parts = [
    ...fileScopedNamespaces,
    ...matchingBlocks
      .sort((left, right) => left.startOffset - right.startOffset)
      .map(namespaceBlock => namespaceBlock.name)
  ];

  return parts.length > 0 ? parts.join('.') : undefined;
}

function parseQualifiedName(tokens: readonly Token[], startIndex: number): ParsedName | undefined {
  const parts: string[] = [];
  let index = startIndex;
  let expectingIdentifier = true;

  while (index < tokens.length) {
    const token = tokens[index];
    if (expectingIdentifier) {
      if (token.kind !== 'identifier') {
        break;
      }

      parts.push(token.text);
      expectingIdentifier = false;
      index += 1;
      continue;
    }

    if (token.kind !== 'dot') {
      break;
    }

    expectingIdentifier = true;
    index += 1;
  }

  if (parts.length === 0 || expectingIdentifier) {
    return undefined;
  }

  return { name: parts.join('.'), nextIndex: index };
}

function findMatchingBrace(tokens: readonly Token[], openBraceIndex: number): Token | undefined {
  let depth = 0;

  for (let index = openBraceIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'openBrace') {
      depth += 1;
      continue;
    }

    if (token.kind !== 'closeBrace') {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return token;
    }
  }

  return undefined;
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

function tokenizeCSharp(text: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;

  while (offset < text.length) {
    const current = text[offset];
    const next = text[offset + 1];

    if (/\s/.test(current)) {
      offset += 1;
      continue;
    }

    if (current === '/' && next === '/') {
      offset = skipLineComment(text, offset + 2);
      continue;
    }

    if (current === '/' && next === '*') {
      offset = skipBlockComment(text, offset + 2);
      continue;
    }

    if (
      ((current === '@' && next === '$') || (current === '$' && next === '@')) &&
      text[offset + 2] === '"'
    ) {
      offset = skipVerbatimString(text, offset + 3);
      continue;
    }

    if (current === '@' && next === '"') {
      offset = skipVerbatimString(text, offset + 2);
      continue;
    }

    if (current === '"' && next === '"' && text[offset + 2] === '"') {
      const quoteCount = countQuotes(text, offset);
      offset = skipRawString(text, offset + quoteCount, quoteCount);
      continue;
    }

    if (current === '"') {
      offset = skipString(text, offset + 1, '"');
      continue;
    }

    if (current === "'") {
      offset = skipString(text, offset + 1, "'");
      continue;
    }

    if (isIdentifierStart(current)) {
      const start = offset;
      offset += 1;
      while (offset < text.length && isIdentifierPart(text[offset])) {
        offset += 1;
      }

      tokens.push({ kind: 'identifier', text: text.slice(start, offset), offset: start });
      continue;
    }

    if (current === '.') {
      tokens.push({ kind: 'dot', text: current, offset });
    } else if (current === '{') {
      tokens.push({ kind: 'openBrace', text: current, offset });
    } else if (current === '}') {
      tokens.push({ kind: 'closeBrace', text: current, offset });
    } else if (current === ';') {
      tokens.push({ kind: 'semicolon', text: current, offset });
    }

    offset += 1;
  }

  return tokens;
}

function skipLineComment(text: string, offset: number): number {
  while (offset < text.length && text[offset] !== '\n' && text[offset] !== '\r') {
    offset += 1;
  }

  return offset;
}

function skipBlockComment(text: string, offset: number): number {
  while (offset < text.length) {
    if (text[offset] === '*' && text[offset + 1] === '/') {
      return offset + 2;
    }

    offset += 1;
  }

  return offset;
}

function skipString(text: string, offset: number, quote: '"' | "'"): number {
  while (offset < text.length) {
    if (text[offset] === '\\') {
      offset += 2;
      continue;
    }

    if (text[offset] === quote) {
      return offset + 1;
    }

    offset += 1;
  }

  return offset;
}

function skipVerbatimString(text: string, offset: number): number {
  while (offset < text.length) {
    if (text[offset] === '"' && text[offset + 1] === '"') {
      offset += 2;
      continue;
    }

    if (text[offset] === '"') {
      return offset + 1;
    }

    offset += 1;
  }

  return offset;
}

function skipRawString(text: string, offset: number, quoteCount: number): number {
  while (offset < text.length) {
    if (hasQuoteRun(text, offset, quoteCount)) {
      return offset + quoteCount;
    }

    offset += 1;
  }

  return offset;
}

function countQuotes(text: string, offset: number): number {
  let quoteCount = 0;
  while (text[offset + quoteCount] === '"') {
    quoteCount += 1;
  }

  return quoteCount;
}

function hasQuoteRun(text: string, offset: number, quoteCount: number): boolean {
  for (let index = 0; index < quoteCount; index += 1) {
    if (text[offset + index] !== '"') {
      return false;
    }
  }

  return true;
}

function isIdentifierStart(character: string): boolean {
  return /[A-Za-z_]/.test(character);
}

function isIdentifierPart(character: string): boolean {
  return /[A-Za-z0-9_]/.test(character);
}
