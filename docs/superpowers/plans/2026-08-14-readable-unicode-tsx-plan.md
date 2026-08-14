# Readable Unicode TSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve readable UTF-8 Cyrillic in generated TSX without changing runtime text, deterministic output, or JavaScript/JSX escaping safety.

**Architecture:** Keep the typed generation model and TypeScript AST printer. Add one private literal factory that marks only user-visible synthetic string literals with `ts.EmitFlags.NoAsciiEscaping`, then regenerate reviewed React acceptance artifacts and their hashes.

**Tech Stack:** TypeScript 5.9 AST factory/printer, Vitest 3, pnpm 10, existing React fixture generation and provenance scripts.

## Global Constraints

- Generated source stays deterministic UTF-8.
- Preserve the current JSX string-expression representation; raw `JsxText` is out of scope.
- Do not decode input strings or post-process printed source.
- Quotes, backslashes, newlines, control characters, and JSX-significant text remain safely escaped.
- Do not alter Pixso source artifacts, resolution contracts, component mappings, or runtime behavior.

---

### Task 1: Make user-visible TSX literals readable

**Files:**

- Modify: `packages/generator-react/src/emit-tsx.test.ts:15-31`
- Modify: `packages/generator-react/src/emit-tsx.ts:560-586`

**Interfaces:**

- Consumes: `ts.factory.createStringLiteral(value: string)` and `ts.setEmitFlags`.
- Produces: private `createUtf8StringLiteral(value: string): ts.StringLiteral`, used by `jsxText` and the string branch of `literalExpression`.

- [ ] **Step 1: Write the failing regression assertions**

Replace the old escaped-Cyrillic assertion in the first `emitTsx` test with literal expectations derived from the fixture model:

```ts
expect(source).toContain('title="Закрыть &quot;диалог&quot; <script>"');
expect(source).toContain('{"Привет, <мир> & {не код}"}');
expect(source).not.toMatch(/\\u04[0-9a-fA-F]{2}/);
```

The production regression caught by this test is removal or omission of the `NoAsciiEscaping` emit flag, which would restore `\u04XX` output. Keep the existing deterministic-generation test; it independently protects byte stability.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run packages/generator-react/src/emit-tsx.test.ts
```

Expected: FAIL because the output contains `{"\u041F...` rather than `{"Привет..."}`. The existing title assertion must continue to pass, proving JSX string props already remain safely readable.

- [ ] **Step 3: Implement the minimal AST policy**

Add the helper beside `jsxText`:

```ts
function createUtf8StringLiteral(value: string): ts.StringLiteral {
  const literal = factory.createStringLiteral(value);
  return ts.setEmitFlags(literal, ts.EmitFlags.NoAsciiEscaping);
}
```

Use it in both locations:

```ts
if (typeof value === "string") {
  return createUtf8StringLiteral(value);
}
```

```ts
function jsxText(value: string): ts.JsxExpression {
  return factory.createJsxExpression(
    undefined,
    createUtf8StringLiteral(value),
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm vitest run packages/generator-react/src/emit-tsx.test.ts
```

Expected: all tests in `emit-tsx.test.ts` pass, including readable Cyrillic, safe title escaping, and byte-identical repeated output.

- [ ] **Step 5: Format and commit the emitter slice**

Run:

```bash
pnpm exec prettier --write packages/generator-react/src/emit-tsx.ts packages/generator-react/src/emit-tsx.test.ts
pnpm vitest run packages/generator-react/src/emit-tsx.test.ts
git add packages/generator-react/src/emit-tsx.ts packages/generator-react/src/emit-tsx.test.ts
git commit -m "fix: preserve readable unicode in generated TSX"
```

Expected: focused tests pass and the commit contains only the emitter and its regression test.

---

### Task 2: Regenerate reviewed acceptance artifacts

**Files:**

- Modify: `fixtures/react-generation/modal/material-ui/generated/GeneratedModal.tsx`
- Modify: `fixtures/react-generation/modal/material-ui/generated/generation-report.json`
- Modify: `fixtures/react-generation/modal/sber-space-ui/generated/GeneratedModal.tsx`
- Modify: `fixtures/react-generation/modal/sber-space-ui/generated/generation-report.json`
- Modify: `fixtures/react-generation/pixso-4-314/sber-space-ui/generated/GeneratedModal.tsx`
- Modify: `fixtures/react-generation/pixso-4-314/sber-space-ui/generated/generation-report.json`
- Modify: `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.tsx`
- Modify: `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/generation-report.json`
- Modify: `fixtures/react-generation/README.md`

**Interfaces:**

- Consumes: `pnpm generate:react-acceptance-candidates -- <destination>` and committed fixture inputs.
- Produces: reviewed, deterministic generated TSX/report bytes plus exact `react-generation-fixture-provenance/v1` hashes.

- [ ] **Step 1: Generate candidates outside the fixture tree**

Run with an explicit disposable directory:

```bash
pnpm generate:react-acceptance-candidates -- --output /private/tmp/uig-readable-unicode-candidates
```

Expected: four candidate summaries for the two neutral modal packs, Pixso `4:314`, and Pixso `70:118899`.

- [ ] **Step 2: Review the candidate diff before accepting it**

Compare each candidate directory with its committed counterpart:

```bash
diff -ru fixtures/react-generation/modal/material-ui /private/tmp/uig-readable-unicode-candidates/modal/material-ui
diff -ru fixtures/react-generation/modal/sber-space-ui /private/tmp/uig-readable-unicode-candidates/modal/sber-space-ui
diff -ru fixtures/react-generation/pixso-4-314/sber-space-ui /private/tmp/uig-readable-unicode-candidates/pixso-4-314/sber-space-ui
diff -ru fixtures/react-generation/pixso-70-118899/sber-space-ui /private/tmp/uig-readable-unicode-candidates/pixso-70-118899/sber-space-ui
```

Expected: only generated TSX Unicode presentation and the corresponding TSX hashes in generation reports differ. CSS and resolution plans remain byte-identical.

- [ ] **Step 3: Accept only reviewed generated files**

Copy the four reviewed `generated/` directories from the candidate tree over
their exact fixture counterparts:

```bash
cp -R /private/tmp/uig-readable-unicode-candidates/modal/material-ui/generated/. fixtures/react-generation/modal/material-ui/generated/
cp -R /private/tmp/uig-readable-unicode-candidates/modal/sber-space-ui/generated/. fixtures/react-generation/modal/sber-space-ui/generated/
cp -R /private/tmp/uig-readable-unicode-candidates/pixso-4-314/sber-space-ui/generated/. fixtures/react-generation/pixso-4-314/sber-space-ui/generated/
cp -R /private/tmp/uig-readable-unicode-candidates/pixso-70-118899/sber-space-ui/generated/. fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/
```

Do not replace source Design IR, manifests, resolution plans, or raw Pixso
fixtures.

- [ ] **Step 4: Update exact fixture provenance**

For every changed file listed in the `react-generation-provenance` block,
calculate byte length and SHA-256:

```bash
find fixtures/react-generation -type f -not -name README.md -exec shasum -a 256 {} \;
find fixtures/react-generation -type f -not -name README.md -exec wc -c {} \;
```

Update only changed literal `byteLength` and `sha256` entries in
`fixtures/react-generation/README.md`. Do not weaken
`scripts/verify-fixture-provenance.ts`.

Run:

```bash
pnpm verify:fixtures
```

Expected: `Verified 4 Pixso fixtures and 17 React fixture files`.

- [ ] **Step 5: Prove generated TSX contains readable Cyrillic**

Run:

```bash
rg -n '\\u04[0-9a-fA-F]{2}' fixtures/react-generation --glob '*.tsx'
rg -n 'Выберите необходимые действия|Создать заявку|Переформирование поручения' fixtures/react-generation --glob '*.tsx'
```

Expected: the first command has no matches; the second finds the reviewed Russian labels in generated TSX.

- [ ] **Step 6: Run acceptance tests and commit artifacts**

Run:

```bash
pnpm test:acceptance
git add fixtures/react-generation
git commit -m "test: refresh readable unicode fixtures"
```

Expected: acceptance tests pass and the commit contains only reviewed fixture/provenance changes.

---

### Task 3: Rebuild the Qwen adapter and run the release gate

**Files:**

- Modify: `dist/qwen-adapter.mjs`
- Modify: `dist/qwen-adapter.provenance.json`

**Interfaces:**

- Consumes: the updated generator source and `scripts/build-qwen-extension.ts`.
- Produces: a reproducible committed adapter whose provenance SHA-256 matches its bytes.

- [ ] **Step 1: Confirm the committed bundle is stale for the expected reason**

Run:

```bash
pnpm verify:qwen-extension-bundle
```

Expected: FAIL because a clean rebuild includes the emitter change and is no longer byte-identical to the committed bundle.

- [ ] **Step 2: Rebuild and verify the adapter**

Run:

```bash
pnpm build:qwen-extension
pnpm verify:qwen-extension-bundle
```

Expected: bundle verification passes and `dist/qwen-adapter.provenance.json` contains the new measured bundle SHA-256.

- [ ] **Step 3: Run the complete release gate**

Run:

```bash
pnpm verify
```

Expected: formatting, typecheck, fixture provenance, Qwen bundle reproducibility, and all test files pass with zero failures.

- [ ] **Step 4: Inspect scope and commit**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~2
git add dist/qwen-adapter.mjs dist/qwen-adapter.provenance.json
git commit -m "build: refresh Qwen adapter for unicode output"
```

Expected: no unrelated source, lockfile, Pixso input, or design-system changes are present. If rebuilding does not change the committed bundle, omit the empty bundle commit and record that result in the handoff.

- [ ] **Step 5: Verify the committed branch one final time**

Run:

```bash
pnpm verify
git status --short
```

Expected: the complete gate passes and the worktree is clean.
