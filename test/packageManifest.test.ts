import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJsonPath = resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  readonly scripts?: Record<string, string>;
  readonly contributes?: {
    readonly commands?: readonly { readonly command: string; readonly title: string; readonly category?: string }[];
  };
};

test('runs compile before VS Code packaging', () => {
  assert.equal(packageJson.scripts?.['vscode:prepublish'], 'tsc -p .');
});

test('uses requested command title', () => {
  assert.deepEqual(packageJson.contributes?.commands?.[0], {
    command: 'csharp-copy-reference.copyFullyQualifiedName',
    title: 'Copy Fully Qualified C# Name',
    category: 'C#'
  });
});

test('excludes compiled tests from VSIX package', () => {
  const vscodeIgnore = readFileSync(resolve(__dirname, '../../.vscodeignore'), 'utf8');

  assert.match(vscodeIgnore, /^out\/test$/m);
});
