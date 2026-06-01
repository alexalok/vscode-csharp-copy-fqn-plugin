import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isProviderResultUnavailable,
  splitSymbolProviderResults
} from '../src/providerResults';

test('treats undefined and empty provider arrays as unavailable', () => {
  assert.equal(isProviderResultUnavailable(undefined), true);
  assert.equal(isProviderResultUnavailable([]), true);
  assert.equal(isProviderResultUnavailable([{ name: 'UserService' }]), false);
});

test('splits mixed document symbol and symbol information results', () => {
  const documentSymbol = {
    name: 'UserService',
    selectionRange: {},
    children: []
  };
  const symbolInformation = {
    name: 'GetUserAsync',
    location: { range: {} },
    containerName: 'UserService'
  };

  const result = splitSymbolProviderResults([documentSymbol, symbolInformation, { name: 'unknown' }]);

  assert.deepEqual(result.documentSymbols, [documentSymbol]);
  assert.deepEqual(result.symbolInformation, [symbolInformation]);
});
