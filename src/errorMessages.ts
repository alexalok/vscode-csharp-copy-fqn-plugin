export const noSymbolMessage = 'No C# symbol found at cursor.';
export const languageServerUnavailableMessage = 'C# language server is not available.';
export const unresolvedMessage = 'Could not resolve fully qualified name for selected symbol.';

const canonicalMessages = new Set([
  noSymbolMessage,
  languageServerUnavailableMessage,
  unresolvedMessage
]);

export function toUserFacingErrorMessage(error: unknown): string {
  if (error instanceof Error && canonicalMessages.has(error.message)) {
    return error.message;
  }

  return unresolvedMessage;
}
