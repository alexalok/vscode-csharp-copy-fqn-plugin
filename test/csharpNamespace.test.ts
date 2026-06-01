import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNamespaceAtPosition } from '../src/csharpNamespace';

test('parses file-scoped namespace before symbol position', () => {
  const text = [
    'namespace MyCompany.Project.Services;',
    '',
    'public class UserService {}'
  ].join('\n');

  assert.equal(parseNamespaceAtPosition(text, { line: 2, character: 13 }), 'MyCompany.Project.Services');
});

test('parses block namespace containing symbol position', () => {
  const text = [
    'namespace MyCompany.Project',
    '{',
    '    namespace Services',
    '    {',
    '        public class UserService {}',
    '    }',
    '}'
  ].join('\n');

  assert.equal(parseNamespaceAtPosition(text, { line: 4, character: 21 }), 'MyCompany.Project.Services');
});

test('ignores namespace text in comments and strings', () => {
  const text = [
    '// namespace Wrong.Comment;',
    'var text = "namespace Wrong.String;";',
    'namespace Real.Namespace;',
    'public class UserService {}'
  ].join('\n');

  assert.equal(parseNamespaceAtPosition(text, { line: 3, character: 13 }), 'Real.Namespace');
});

test('ignores raw strings with four-quote delimiters', () => {
  const text = [
    'var text = """"',
    'namespace Wrong.Raw;',
    '"""";',
    'namespace Real.Namespace;',
    'public class UserService {}'
  ].join('\n');

  assert.equal(parseNamespaceAtPosition(text, { line: 4, character: 13 }), 'Real.Namespace');
});

test('ignores verbatim interpolated strings with at-dollar prefix', () => {
  const text = [
    'namespace Real.Namespace;',
    'var text = @$"first "" quote',
    'namespace Wrong.String;',
    '";',
    'public class UserService {}'
  ].join('\n');

  assert.equal(parseNamespaceAtPosition(text, { line: 4, character: 13 }), 'Real.Namespace');
});
