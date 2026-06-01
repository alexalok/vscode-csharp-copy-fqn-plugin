import * as vscode from 'vscode';
import {
  buildFullyQualifiedName,
  buildFullyQualifiedNameFromFlatSymbols,
  findSymbolPath
} from './fqnBuilder';
import {
  languageServerUnavailableMessage,
  noSymbolMessage,
  toUserFacingErrorMessage,
  unresolvedMessage
} from './errorMessages';
import {
  hasProviderResults,
  isDocumentSymbolLike,
  isSymbolInformationLike,
  splitSymbolProviderResults
} from './providerResults';
import { FlatSymbolNode, Position, Range, SymbolKind, SymbolNode } from './symbolTypes';

const commandId = 'csharp-copy-reference.copyFullyQualifiedName';

type ResolveStatus = 'resolved' | 'no-symbol' | 'unavailable' | 'unresolved';

interface ResolveResult {
  readonly status: ResolveStatus;
  readonly name?: string;
}

interface DefinitionTarget {
  readonly uri: vscode.Uri;
  readonly position: vscode.Position;
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(commandId, async () => {
      await copyFullyQualifiedName();
    })
  );
}

export function deactivate(): void {
  return undefined;
}

async function copyFullyQualifiedName(): Promise<void> {
  try {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.languageId !== 'csharp') {
      throw new Error(noSymbolMessage);
    }

    const fullyQualifiedName = await resolveFullyQualifiedName(activeEditor);
    await vscode.env.clipboard.writeText(fullyQualifiedName);
    vscode.window.setStatusBarMessage(`Copied ${fullyQualifiedName}`, 3000);
  } catch (error) {
    vscode.window.showErrorMessage(toUserFacingErrorMessage(error));
  }
}

async function resolveFullyQualifiedName(editor: vscode.TextEditor): Promise<string> {
  const sourceDocument = editor.document;
  const sourcePosition = editor.selection.active;
  const definitionTargets = await getDefinitionTargets(sourceDocument.uri, sourcePosition);

  for (const target of definitionTargets.targets) {
    const result = await resolveAtPosition(sourceDocument, target.uri, target.position);
    if (result.status === 'resolved' && result.name) {
      return result.name;
    }
  }

  const sourceResult = await resolveAtPosition(sourceDocument, sourceDocument.uri, sourcePosition);
  if (sourceResult.status === 'resolved' && sourceResult.name) {
    return sourceResult.name;
  }

  if (definitionTargets.unavailable && sourceResult.status === 'unavailable') {
    throw new Error(languageServerUnavailableMessage);
  }

  if (sourceResult.status === 'unresolved') {
    throw new Error(unresolvedMessage);
  }

  throw new Error(noSymbolMessage);
}

async function getDefinitionTargets(
  uri: vscode.Uri,
  position: vscode.Position
): Promise<{ readonly unavailable: boolean; readonly targets: readonly DefinitionTarget[] }> {
  const definitions = await vscode.commands.executeCommand<
    readonly (vscode.Location | vscode.LocationLink)[] | undefined
  >('vscode.executeDefinitionProvider', uri, position);

  if (!hasProviderResults(definitions)) {
    return { unavailable: true, targets: [] };
  }

  return {
    unavailable: false,
    targets: definitions.map(definition => {
      if (isLocationLink(definition)) {
        return {
          uri: definition.targetUri,
          position: (definition.targetSelectionRange ?? definition.targetRange).start
        };
      }

      return { uri: definition.uri, position: definition.range.start };
    })
  };
}

async function resolveAtPosition(
  sourceDocument: vscode.TextDocument,
  uri: vscode.Uri,
  position: vscode.Position
): Promise<ResolveResult> {
  const symbols = await vscode.commands.executeCommand<
    readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined
  >('vscode.executeDocumentSymbolProvider', uri);

  if (!hasProviderResults(symbols)) {
    return { status: 'unavailable' };
  }

  const document = uri.toString() === sourceDocument.uri.toString()
    ? sourceDocument
    : await vscode.workspace.openTextDocument(uri);
  const plainPosition = toPosition(position);
  const { documentSymbols, symbolInformation } = splitSymbolProviderResults(symbols);
  const documentText = document.getText();
  const fullyQualifiedName = buildFromDocumentSymbols(
    documentSymbols.filter(isDocumentSymbolLikeForVscode),
    documentText,
    plainPosition
  ) ?? buildFromSymbolInformation(
    symbolInformation.filter(isSymbolInformationLikeForVscode),
    documentText,
    plainPosition
  );

  if (!fullyQualifiedName) {
    return { status: 'no-symbol' };
  }

  return { status: 'resolved', name: fullyQualifiedName };
}

function buildFromDocumentSymbols(
  symbols: readonly vscode.DocumentSymbol[],
  documentText: string,
  position: Position
): string | undefined {
  const plainSymbols = symbols.map(toSymbolNode);
  const path = findSymbolPath(plainSymbols, position);
  return buildFullyQualifiedName(path, documentText, position);
}

function buildFromSymbolInformation(
  symbols: readonly vscode.SymbolInformation[],
  documentText: string,
  position: Position
): string | undefined {
  const plainSymbols = symbols.map(toFlatSymbolNode);
  return buildFullyQualifiedNameFromFlatSymbols(plainSymbols, documentText, position);
}

function isLocationLink(definition: vscode.Location | vscode.LocationLink): definition is vscode.LocationLink {
  return 'targetUri' in definition;
}

function toSymbolNode(symbol: vscode.DocumentSymbol): SymbolNode {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbol.kind as SymbolKind,
    range: toRange(symbol.range),
    selectionRange: toRange(symbol.selectionRange),
    children: symbol.children.map(toSymbolNode)
  };
}

function toFlatSymbolNode(symbol: vscode.SymbolInformation): FlatSymbolNode {
  return {
    name: symbol.name,
    kind: symbol.kind as SymbolKind,
    range: toRange(symbol.location.range),
    containerName: symbol.containerName
  };
}

function toRange(range: vscode.Range): Range {
  return {
    start: toPosition(range.start),
    end: toPosition(range.end)
  };
}

function toPosition(position: vscode.Position): Position {
  return {
    line: position.line,
    character: position.character
  };
}

function isDocumentSymbolLikeForVscode(symbol: unknown): symbol is vscode.DocumentSymbol {
  return isDocumentSymbolLike(symbol);
}

function isSymbolInformationLikeForVscode(symbol: unknown): symbol is vscode.SymbolInformation {
  return isSymbolInformationLike(symbol);
}
