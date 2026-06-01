import test from 'node:test';
import assert from 'node:assert/strict';
import {
  languageServerUnavailableMessage,
  noSymbolMessage,
  toUserFacingErrorMessage,
  unresolvedMessage
} from '../src/errorMessages';

test('keeps documented errors unchanged', () => {
  assert.equal(toUserFacingErrorMessage(new Error(noSymbolMessage)), noSymbolMessage);
  assert.equal(toUserFacingErrorMessage(new Error(languageServerUnavailableMessage)), languageServerUnavailableMessage);
  assert.equal(toUserFacingErrorMessage(new Error(unresolvedMessage)), unresolvedMessage);
});

test('maps unknown errors to unresolved message', () => {
  assert.equal(toUserFacingErrorMessage(new Error('provider crashed')), unresolvedMessage);
  assert.equal(toUserFacingErrorMessage('clipboard failed'), unresolvedMessage);
});
