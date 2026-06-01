export interface DocumentSymbolLike {
  readonly selectionRange: unknown;
}

export interface SymbolInformationLike {
  readonly location: unknown;
}

export interface SplitSymbolProviderResults {
  readonly documentSymbols: readonly DocumentSymbolLike[];
  readonly symbolInformation: readonly SymbolInformationLike[];
}

export function isProviderResultUnavailable(results: readonly unknown[] | undefined): boolean {
  return !results || results.length === 0;
}

export function hasProviderResults<T>(results: readonly T[] | undefined): results is readonly T[] {
  return !isProviderResultUnavailable(results);
}

export function splitSymbolProviderResults(results: readonly unknown[]): SplitSymbolProviderResults {
  return {
    documentSymbols: results.filter(isDocumentSymbolLike),
    symbolInformation: results.filter(isSymbolInformationLike)
  };
}

export function isDocumentSymbolLike(result: unknown): result is DocumentSymbolLike {
  return typeof result === 'object' && result !== null && 'selectionRange' in result;
}

export function isSymbolInformationLike(result: unknown): result is SymbolInformationLike {
  return typeof result === 'object' && result !== null && 'location' in result;
}
