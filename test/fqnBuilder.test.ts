import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFullyQualifiedName,
  buildFullyQualifiedNameFromFlatSymbol,
  buildFullyQualifiedNameFromFlatSymbols,
  findFlatSymbolAtPosition,
  findSymbolPath
} from '../src/fqnBuilder';
import { Position, SymbolKind, SymbolNode } from '../src/symbolTypes';

function position(line: number, character: number): Position {
  return { line, character };
}

function range(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
  return {
    start: position(startLine, startCharacter),
    end: position(endLine, endCharacter)
  };
}

function symbol(
  name: string,
  kind: SymbolKind,
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  children: SymbolNode[] = []
): SymbolNode {
  return {
    name,
    kind,
    range: range(startLine, startCharacter, endLine, endCharacter),
    selectionRange: range(startLine, startCharacter, startLine, startCharacter + name.length),
    children
  };
}

test('builds namespace-qualified method name from document symbol path', () => {
  const method = symbol('EnsureMediaBufferEntriesExistAsync', SymbolKind.Method, 4, 22, 4, 57);
  const type = symbol('MediaBufferService', SymbolKind.Class, 2, 13, 6, 1, [method]);
  const namespace = symbol('MyCompany.MyApp.Services', SymbolKind.Namespace, 0, 10, 7, 1, [type]);

  const path = findSymbolPath([namespace], position(4, 31));
  const result = buildFullyQualifiedName(path, '', position(4, 31));

  assert.equal(result, 'MyCompany.MyApp.Services.MediaBufferService.EnsureMediaBufferEntriesExistAsync');
});

test('uses file-scoped namespace when provider omits namespace symbol', () => {
  const documentText = [
    'namespace MyCompany.Project.Models;',
    '',
    'public class User',
    '{',
    '    public string Email { get; set; }',
    '}'
  ].join('\n');
  const property = symbol('Email', SymbolKind.Property, 4, 18, 4, 23);
  const type = symbol('User', SymbolKind.Class, 2, 13, 5, 1, [property]);

  const path = findSymbolPath([type], position(4, 20));
  const result = buildFullyQualifiedName(path, documentText, position(4, 20));

  assert.equal(result, 'MyCompany.Project.Models.User.Email');
});

test('keeps nested type names in order', () => {
  const inner = symbol('Inner', SymbolKind.Class, 3, 17, 5, 5);
  const outer = symbol('Outer', SymbolKind.Class, 1, 13, 6, 1, [inner]);

  const path = findSymbolPath([outer], position(3, 18));
  const result = buildFullyQualifiedName(path, 'namespace MyCompany.Project;', position(3, 18));

  assert.equal(result, 'MyCompany.Project.Outer.Inner');
});

test('strips method signature text by default', () => {
  const method = symbol('GetUserAsync(Guid userId, CancellationToken cancellationToken)', SymbolKind.Method, 3, 17, 3, 76);
  const type = symbol('UserService', SymbolKind.Class, 1, 13, 4, 1, [method]);

  const path = findSymbolPath([type], position(3, 20));
  const result = buildFullyQualifiedName(path, 'namespace MyCompany.Project.Services;', position(3, 20));

  assert.equal(result, 'MyCompany.Project.Services.UserService.GetUserAsync');
});

test('returns no path when cursor is in body but not on symbol selection range', () => {
  const method = symbol('RunAsync', SymbolKind.Method, 3, 17, 7, 5);
  const type = symbol('Worker', SymbolKind.Class, 1, 13, 8, 1, [method]);

  const path = findSymbolPath([type], position(5, 12));

  assert.equal(path, undefined);
});

test('builds fully qualified name from flat symbol provider result', () => {
  const flatSymbol = {
    name: 'GetUserAsync(Guid userId, CancellationToken cancellationToken)',
    kind: SymbolKind.Method,
    containerName: 'MyCompany.Project.Services.UserService',
    range: range(3, 17, 3, 76)
  };

  const found = findFlatSymbolAtPosition([flatSymbol], position(3, 22));
  const result = buildFullyQualifiedNameFromFlatSymbol(found, '', position(3, 22));

  assert.equal(result, 'MyCompany.Project.Services.UserService.GetUserAsync');
});

test('prefixes namespace when flat symbol container is not fully qualified', () => {
  const documentText = [
    'namespace MyCompany.Project.Services;',
    '',
    'public class UserService',
    '{',
    '    public Task GetUserAsync(Guid userId) => Task.CompletedTask;',
    '}'
  ].join('\n');
  const flatSymbol = {
    name: 'GetUserAsync(Guid userId)',
    kind: SymbolKind.Method,
    containerName: 'UserService',
    range: range(4, 16, 4, 28)
  };

  const found = findFlatSymbolAtPosition([flatSymbol], position(4, 20));
  const result = buildFullyQualifiedNameFromFlatSymbol(found, documentText, position(4, 20));

  assert.equal(result, 'MyCompany.Project.Services.UserService.GetUserAsync');
});

test('preserves nested type chain from flat provider ranges', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class Outer',
    '{',
    '    public class Inner',
    '    {',
    '        public void Run() {}',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'Outer',
      kind: SymbolKind.Class,
      range: range(2, 13, 8, 1)
    },
    {
      name: 'Inner',
      kind: SymbolKind.Class,
      containerName: 'Outer',
      range: range(4, 17, 7, 5)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'Inner',
      range: range(6, 20, 6, 23)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(6, 21));

  assert.equal(result, 'MyCompany.Project.Outer.Inner.Run');
});

test('preserves flat nested type chain from container names when ranges are name-only', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class Outer',
    '{',
    '    public class Inner',
    '    {',
    '        public void Run() {}',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'Outer',
      kind: SymbolKind.Class,
      range: range(2, 13, 2, 18)
    },
    {
      name: 'Inner',
      kind: SymbolKind.Class,
      containerName: 'Outer',
      range: range(4, 17, 4, 22)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'Inner',
      range: range(6, 20, 6, 23)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(6, 21));

  assert.equal(result, 'MyCompany.Project.Outer.Inner.Run');
});

test('keeps flat name-chain order when inner name is longer than outer name', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class O',
    '{',
    '    public class LongerInner',
    '    {',
    '        public void Run() {}',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'O',
      kind: SymbolKind.Class,
      range: range(2, 13, 2, 14)
    },
    {
      name: 'LongerInner',
      kind: SymbolKind.Class,
      containerName: 'O',
      range: range(4, 17, 4, 28)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'LongerInner',
      range: range(6, 20, 6, 23)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(6, 21));

  assert.equal(result, 'MyCompany.Project.O.LongerInner.Run');
});

test('rejects flat full-range body hits', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class UserService',
    '{',
    '    public void Run()',
    '    {',
    '        Console.WriteLine("work");',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'UserService',
      kind: SymbolKind.Class,
      range: range(2, 0, 8, 1)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'UserService',
      range: range(4, 4, 7, 5)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(6, 14));

  assert.equal(result, undefined);
});

test('rejects flat full-range body hits when body word matches symbol name', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class UserService',
    '{',
    '    public void Run()',
    '    {',
    '        service.Run();',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'UserService',
      kind: SymbolKind.Class,
      range: range(2, 0, 8, 1)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'UserService',
      range: range(4, 4, 7, 5)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(6, 16));

  assert.equal(result, undefined);
});

test('allows flat full-range declaration when cursor is on symbol name', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class UserService',
    '{',
    '    public void Run()',
    '    {',
    '        Console.WriteLine("work");',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'UserService',
      kind: SymbolKind.Class,
      range: range(2, 0, 8, 1)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'UserService',
      range: range(4, 4, 7, 5)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(4, 17));

  assert.equal(result, 'MyCompany.Project.UserService.Run');
});

test('matches generic flat method names at cursor word', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class UserService',
    '{',
    '    public T Run<T>(T value) => value;',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'UserService',
      kind: SymbolKind.Class,
      range: range(2, 0, 5, 1)
    },
    {
      name: 'Run<T>(T value)',
      kind: SymbolKind.Method,
      containerName: 'UserService',
      range: range(4, 4, 4, 38)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(4, 13));

  assert.equal(result, 'MyCompany.Project.UserService.Run<T>');
});

test('matches generic flat type names at cursor word', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class Box<T>',
    '{',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'Box<T>',
      kind: SymbolKind.Class,
      range: range(2, 0, 4, 1)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(2, 13));

  assert.equal(result, 'MyCompany.Project.Box<T>');
});

test('preserves range container order when name chain only identifies inner type', () => {
  const documentText = [
    'namespace MyCompany.Project',
    '{',
    '    public class Outer',
    '    {',
    '        public class Inner',
    '        {',
    '            public void Run() {}',
    '        }',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'MyCompany.Project',
      kind: SymbolKind.Namespace,
      range: range(0, 0, 9, 1)
    },
    {
      name: 'Outer',
      kind: SymbolKind.Class,
      range: range(2, 4, 8, 5)
    },
    {
      name: 'Inner',
      kind: SymbolKind.Class,
      range: range(4, 8, 7, 9)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'Inner',
      range: range(6, 24, 6, 27)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(6, 25));

  assert.equal(result, 'MyCompany.Project.Outer.Inner.Run');
});

test('preserves flat name-chain order when only innermost range container matches', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class A',
    '{',
    '    public class B',
    '    {',
    '        public class C',
    '        {',
    '            public void Run() {}',
    '        }',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'A',
      kind: SymbolKind.Class,
      range: range(2, 13, 2, 14)
    },
    {
      name: 'B',
      kind: SymbolKind.Class,
      containerName: 'A',
      range: range(4, 17, 4, 18)
    },
    {
      name: 'C',
      kind: SymbolKind.Class,
      containerName: 'B',
      range: range(6, 8, 9, 9)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'C',
      range: range(8, 24, 8, 27)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(8, 25));

  assert.equal(result, 'MyCompany.Project.A.B.C.Run');
});

test('does not duplicate namespace target from flat symbols', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class UserService {}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'MyCompany.Project',
      kind: SymbolKind.Namespace,
      range: range(0, 10, 0, 28)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(0, 27));

  assert.equal(result, 'MyCompany.Project');
});

test('matches any segment of flat namespace symbol at cursor', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class UserService {}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'MyCompany.Project',
      kind: SymbolKind.Namespace,
      range: range(0, 10, 0, 28)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(0, 12));

  assert.equal(result, 'MyCompany.Project');
});

test('rejects ambiguous flat container-name chain', () => {
  const documentText = [
    'namespace MyCompany.Project;',
    '',
    'public class A',
    '{',
    '    public class Inner',
    '    {',
    '        public void Run() {}',
    '    }',
    '}',
    'public class B',
    '{',
    '    public class Inner',
    '    {',
    '        public void Run() {}',
    '    }',
    '}'
  ].join('\n');
  const flatSymbols = [
    {
      name: 'A',
      kind: SymbolKind.Class,
      range: range(2, 13, 2, 14)
    },
    {
      name: 'Inner',
      kind: SymbolKind.Class,
      containerName: 'A',
      range: range(4, 17, 4, 22)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'Inner',
      range: range(6, 20, 6, 23)
    },
    {
      name: 'B',
      kind: SymbolKind.Class,
      range: range(9, 13, 9, 14)
    },
    {
      name: 'Inner',
      kind: SymbolKind.Class,
      containerName: 'B',
      range: range(11, 17, 11, 22)
    },
    {
      name: 'Run',
      kind: SymbolKind.Method,
      containerName: 'Inner',
      range: range(13, 20, 13, 23)
    }
  ];

  const result = buildFullyQualifiedNameFromFlatSymbols(flatSymbols, documentText, position(13, 21));

  assert.equal(result, undefined);
});

test('returns no flat symbol when cursor is outside provider range', () => {
  const flatSymbol = {
    name: 'GetUserAsync',
    kind: SymbolKind.Method,
    containerName: 'MyCompany.Project.Services.UserService',
    range: range(3, 17, 3, 29)
  };

  const found = findFlatSymbolAtPosition([flatSymbol], position(4, 8));

  assert.equal(found, undefined);
});
