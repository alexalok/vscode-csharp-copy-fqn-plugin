import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJsonPath = resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  readonly repository?: { readonly type: string; readonly url: string };
  readonly icon?: string;
  readonly keywords?: readonly string[];
  readonly galleryBanner?: { readonly color: string; readonly theme: string };
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

test('contains marketplace metadata', () => {
  assert.deepEqual(packageJson.repository, {
    type: 'git',
    url: 'https://github.com/alexalok/vscode-csharp-copy-fqn-plugin.git'
  });
  assert.equal(packageJson.icon, 'media/icon.png');
  assert.deepEqual(packageJson.galleryBanner, {
    color: '#1f2937',
    theme: 'dark'
  });
  assert.deepEqual(packageJson.keywords, [
    'csharp',
    'c#',
    'copy',
    'reference',
    'fully-qualified-name',
    'symbol'
  ]);
});

test('marketplace files exist', () => {
  assert.equal(existsSync(resolve(__dirname, '../../media/icon.png')), true);
  assert.equal(existsSync(resolve(__dirname, '../../CHANGELOG.md')), true);
});
