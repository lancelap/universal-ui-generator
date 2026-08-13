# Readable Unicode in Generated TSX

## Problem

Pixso source artifacts and the internal generation model already contain valid
Unicode text. The React AST emitter creates synthetic TypeScript string
literals, and the TypeScript printer currently serializes their non-ASCII
characters as `\uXXXX` escape sequences. The browser renders the same text, but
the generated TSX is difficult to read, search, review, and compare with the
design.

This change must preserve ordinary Cyrillic characters in generated source
without weakening JavaScript/JSX escaping or changing runtime rendering.

## Scope

The change applies to user-visible string values emitted by
`packages/generator-react/src/emit-tsx.ts`:

- JSX text represented as a string expression;
- string-valued component props emitted through `literalExpression`.

Imports, identifiers, CSS, persisted JSON contracts, Pixso source artifacts,
and internal delimiter characters are outside this change. The generator must
continue to emit deterministic UTF-8 bytes.

## Selected approach

Create one private AST helper that builds a `StringLiteral` and assigns
`ts.EmitFlags.NoAsciiEscaping`. Use it from both `jsxText` and the string branch
of `literalExpression`.

This is preferred over post-processing printed source because it changes the
printer policy only for intended user-visible literals. It is also preferred
over decoding input because the input is already correct Unicode and contains
nothing that needs decoding.

Example output:

```tsx
// Before
<Typography>{"\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435"}</Typography>

// After
<Typography>{"Выберите"}</Typography>
```

The string expression form is retained in this slice. Converting safe strings
to raw `JsxText` would introduce a separate whitespace and JSX-token escaping
policy and is not necessary to make the source readable.

## Escaping and safety

`NoAsciiEscaping` affects only non-ASCII presentation. The TypeScript printer
must still escape characters that are structurally significant inside a
JavaScript string, including quotes, backslashes, line breaks, and control
characters. Existing generated-source validation remains unchanged.

The output files remain UTF-8. No `Buffer` transcoding, URI decoding, regular
expression replacement, or source-level post-processing is permitted.

## Test strategy

Implementation follows a red-green cycle:

1. Change the emitter regression test to require readable Cyrillic in JSX text
   and string props and to reject Cyrillic `\u04XX` escapes.
2. Run the focused test and verify it fails against the current emitter for the
   expected reason.
3. Add the minimal shared literal helper and rerun the focused test.
4. Regenerate committed React acceptance fixtures using the repository's
   existing generation workflow, including provenance hashes.
5. Rebuild the committed Qwen adapter only if its reproducibility check shows
   that the emitter change affects the bundle.
6. Run `pnpm verify` as the final release gate.

Required regression coverage:

- Cyrillic JSX content is present as readable UTF-8;
- Cyrillic string props are present as readable UTF-8;
- Cyrillic is not emitted as `\u04XX` sequences;
- quotes and newlines remain valid escaped JavaScript string content;
- repeated generation remains byte-identical;
- all committed generated fixtures and their provenance agree.

## Acceptance criteria

- Generated TSX contains readable Russian letters wherever the generation
  model contains Russian user-visible text.
- No Cyrillic `\u04XX` escapes remain in regenerated TSX fixtures.
- Runtime text and component contracts are unchanged.
- Generated source remains deterministic and passes AST validation.
- The complete repository verification succeeds.
