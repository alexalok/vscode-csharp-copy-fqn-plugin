# C# Copy Reference Extension

## Goal

Build and maintain VS Code command `csharp-copy-reference.copyFullyQualifiedName`, which copies readable fully qualified C# type/member names from editor context menu, command palette, or user-defined keybinding.

## Scope

- Available for C# files through `editor/context` when `editorLangId == csharp`.
- Supports symbols resolved by VS Code C# language features: namespaces, classes, interfaces, structs, records as class/struct symbols, enums, methods, constructors, properties, fields, events, functions/delegates, and nested types.
- Default output excludes parameter types and method signatures.
- XML documentation IDs and overload-aware signatures are outside current MVP.

Example output:

```text
MyCompany.MyApp.Services.MediaBufferService.EnsureMediaBufferEntriesExistAsync
```

## Architecture

- `src/extension.ts`: VS Code command registration, definition/document-symbol provider calls, clipboard write, user-facing errors.
- `src/symbolTypes.ts`: VS Code-like symbol/range types and supported `SymbolKind` constants for pure tests.
- `src/fqnBuilder.ts`: Symbol path selection and fully qualified name formatting.
- `src/csharpNamespace.ts`: Conservative namespace parser used only after semantic symbol resolution.

Resolution should prefer provider-owned semantic data. The command should not copy guessed member names. Namespace parsing is allowed only to prefix an already-resolved symbol when the provider omits namespace symbols.

## User-Facing Errors

Keep exact messages:

- `No C# symbol found at cursor.`
- `C# language server is not available.`
- `Could not resolve fully qualified name for selected symbol.`

No clipboard write on error.

## Development

- Use `pnpm`.
- Compile with `pnpm run compile`.
- Test with `pnpm test`.
- Keep symbol/name logic testable without VS Code runtime.
- Before changing resolver behavior, add or update tests in `test/fqnBuilder.test.ts` or `test/csharpNamespace.test.ts`.

## Packaging/Manual Test

Run test extension host from repo root:

```bash
pnpm install
pnpm run compile
code --new-window --extensionDevelopmentPath=$(pwd) /path/to/csharp/project
```

In the launched window, open a `.cs` file, wait for C# language server, then run `Copy Fully Qualified C# Name` from context menu or command palette.
