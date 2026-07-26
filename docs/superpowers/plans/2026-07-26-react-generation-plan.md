# Slice 2 React Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic React/TypeScript artifact compiler that converts consistent v2 planning artifacts and validated design-system recipes into an isolated TSX/CSS Modules bundle plus an auditable generation report.

**Architecture:** Introduce versioned v2 design, manifest, resolution, and pack contracts; upgrade the existing pipeline to emit those contracts; then add a pure `@uig/generator-react` package with a typed intermediate model and TypeScript-AST/CSS emitters. The CLI reads an immutable planning run and atomically installs a generated bundle without calling Pixso, selecting components, mutating a target project, or inventing missing semantic information.

**Tech Stack:** Node.js 22+, TypeScript 5.9, TypeBox 0.34, TypeScript Compiler API, pnpm 10, Vitest 3, Commander 14, CSS Modules, SHA-256 stable artifacts.

## Global Constraints

- Use Node.js `>=22` and pnpm `10.33.0`; do not add another runtime or orchestrator.
- Preserve all Slice 1 v1 schemas and committed goldens as readable historical evidence.
- New planning output uses `design-ir/v2`, `ui-manifest/v2`, `resolution-plan/v2`, and `design-system-pack/v2`.
- `generator-react` must not import `@uig/provider-pixso`, inspect raw DSL, call a network service, select components, or contain Sber/MUI branches.
- Every concrete package/export comes from a verified `ResolutionPlan` binding.
- Every generated JSX prop and composition placement comes from a validated render recipe or resolution default.
- A blocking input produces only `generation-report.json`; never partial TSX or CSS.
- Generated code contains no data fetching, API calls, state hooks, validation, or default business handlers.
- Auto Layout becomes flow CSS; absolute positioning requires an explicit `DesignIR v2` fact.
- Library appearance overrides require pack permission; internal selectors, global selectors, `!important`, and arbitrary inline styles are forbidden.
- Generation is offline and byte-deterministic; timestamps, UUIDs, locale, filesystem order, and target-project state cannot affect bytes.
- `targetTypecheck` remains exactly `"not-run"` in Slice 2.
- No task writes into a user React project or installs design-system packages into one.
- Follow red-green-refactor for every behavior change and end every task with a focused commit.

---

## File Structure

### New contract files

```text
packages/contracts/src/design-ir-v2.ts
packages/contracts/src/ui-manifest-v2.ts
packages/contracts/src/resolution-plan-v2.ts
packages/contracts/src/design-system-pack-v2.ts
packages/contracts/src/react-render-recipes.ts
packages/contracts/src/react-style-policy.ts
packages/contracts/src/react-generation.ts
```

Each file owns one public schema family. Existing v1 files remain unchanged
except shared-schema exports where required.

### New generator package

```text
packages/generator-react/
├── package.json
└── src/
    ├── errors.ts
    ├── validate-generation-input.ts
    ├── generation-model.ts
    ├── build-import-model.ts
    ├── build-props-model.ts
    ├── place-composition-slots.ts
    ├── build-style-model.ts
    ├── build-fallback-model.ts
    ├── build-react-generation-model.ts
    ├── emit-tsx.ts
    ├── emit-css-module.ts
    ├── validate-generated-source.ts
    ├── generate-react-bundle.ts
    └── index.ts
```

Files are split by transformation responsibility. No emitter performs semantic
resolution or reads the design-system pack directly.

### CLI additions

```text
apps/cli/src/generate-from-run.ts
apps/cli/src/write-generated-bundle.ts
apps/cli/src/generate-from-run.test.ts
```

The existing `create-program.ts` only wires the new command to these functions.

### Pack additions

```text
design-system-packs/sber-space-ui/react-render-recipes.json
design-system-packs/sber-space-ui/react-style-policy.json
design-system-packs/material-ui/react-render-recipes.json
design-system-packs/material-ui/react-style-policy.json
```

### Acceptance fixtures

```text
fixtures/react-generation/modal/source.design-ir.json
fixtures/react-generation/modal/source.ui-manifest.json
fixtures/react-generation/modal/sber-space-ui/resolution-plan.json
fixtures/react-generation/modal/sber-space-ui/generated/
fixtures/react-generation/modal/material-ui/resolution-plan.json
fixtures/react-generation/modal/material-ui/generated/
fixtures/react-generation/pixso-4-314/sber-space-ui/generation-report.json
fixtures/react-generation/pixso-4-314/material-ui/generation-report.json
```

---

### Task 1: Define `DesignIR v2` and `UiManifest v2`

**Files:**

- Create: `packages/contracts/src/design-ir-v2.ts`
- Create: `packages/contracts/src/ui-manifest-v2.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`
- Test: `packages/contracts/src/contracts-v2.test.ts`

**Interfaces:**

- Consumes: v1 geometry, layout, appearance, text, component-reference,
  diagnostic, UI kind, and semantic evidence schemas.
- Produces: `DesignIRV2Schema`, `DesignIRV2`, `DesignNodeV2`,
  `UiManifestV2Schema`, `UiManifestV2`, `UiNodeV2`, and `UiInteraction`.

- [ ] **Step 1: Write failing v2 contract tests**

Add `contracts-v2.test.ts` with exact valid fixtures and rejection assertions:

```ts
const interaction = {
  key: "confirm",
  event: "activate",
  valueType: "void",
} as const;

it("validates explicit positioning and interactions", () => {
  expect(
    validateWithSchema(DesignIRV2Schema, designIrV2Fixture),
  ).toEqual(designIrV2Fixture);
  expect(
    validateWithSchema(UiManifestV2Schema, {
      ...uiManifestV2Fixture,
      root: {
        ...uiManifestV2Fixture.root,
        layoutSourceNodeId: "4:314",
        interactions: [interaction],
      },
    }),
  ).toBeTruthy();
});

it("rejects an interaction with an unknown event", () => {
  expect(() =>
    validateWithSchema(UiManifestV2Schema, {
      ...uiManifestV2Fixture,
      root: {
        ...uiManifestV2Fixture.root,
        interactions: [{ ...interaction, event: "submit" }],
      },
    }),
  ).toThrowError(ContractValidationError);
});
```

Also assert that a v1 manifest is still accepted by `UiManifestSchema` and is
rejected by `UiManifestV2Schema`.

- [ ] **Step 2: Run the tests and verify red**

Run:

```bash
pnpm exec vitest run packages/contracts/src/contracts-v2.test.ts
```

Expected: FAIL because the v2 schemas are not exported.

- [ ] **Step 3: Implement the closed v2 schemas**

Define:

```ts
export const LayoutPositionSchema = closedObject({
  mode: Type.Union([Type.Literal("flow"), Type.Literal("absolute")]),
  inset: Type.Optional(
    closedObject({
      top: Type.Optional(Type.Number()),
      right: Type.Optional(Type.Number()),
      bottom: Type.Optional(Type.Number()),
      left: Type.Optional(Type.Number()),
    }),
  ),
});

export const UiInteractionSchema = closedObject({
  key: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$" }),
  event: Type.Union([Type.Literal("activate"), Type.Literal("change")]),
  valueType: Type.Union([
    Type.Literal("void"),
    Type.Literal("string"),
    Type.Literal("boolean"),
    Type.Literal("number"),
  ]),
});
```

`DesignNodeV2` copies the v1 fields and adds optional `position`.
`UiNodeV2` copies the recursive v1 fields, requires `layoutSourceNodeId`, and
adds optional `interactions`. The root schemas use exact literals
`design-ir/v2` and `ui-manifest/v2`.

- [ ] **Step 4: Add cross-field validation helpers**

Add exported assertion functions:

```ts
export function assertDesignIRV2Integrity(ir: DesignIRV2): void;
export function assertUiManifestV2Integrity(
  manifest: UiManifestV2,
  ir: DesignIRV2,
): void;
```

They must reject:

- root IDs missing from node maps;
- `layoutSourceNodeId` absent from `sourceNodeIds`;
- layout anchors missing from DesignIR;
- duplicate interaction keys within a node;
- `activate` interactions whose `valueType` is not `void`;
- `change` interactions whose `valueType` is `void`.

Test each rejection with the exact error message prefix
`V2_CONTRACT_INTEGRITY:`.

- [ ] **Step 5: Run focused and contract tests**

Run:

```bash
pnpm exec vitest run packages/contracts/src/contracts-v2.test.ts packages/contracts/src/contracts.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src
git commit -m "feat: add v2 design and manifest contracts"
```

---

### Task 2: Define `ResolutionPlan v2` source proof

**Files:**

- Create: `packages/contracts/src/resolution-plan-v2.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts-v2.test.ts`
- Test: `packages/contracts/src/resolution-plan-v2.test.ts`

**Interfaces:**

- Consumes: v1 `ResolutionNodeSchema`, `DiagnosticSchema`, and closed-schema
  helpers.
- Produces: `ResolutionPlanV2Schema`, `ResolutionPlanV2`,
  `ResolutionSourceReference`, and `ResolutionTargetV2`.

- [ ] **Step 1: Write the failing source-proof test**

```ts
it("requires exact design, manifest, and pack proofs", () => {
  const value = {
    schema: "resolution-plan/v2",
    source: {
      designIr: {
        artifactId: "pixso_doc_node_0123456789ab",
        schema: "design-ir/v2",
        sha256: "a".repeat(64),
      },
      uiManifest: {
        artifactId: "pixso_doc_node_0123456789ab",
        schema: "ui-manifest/v2",
        sha256: "b".repeat(64),
      },
    },
    target: {
      framework: "react",
      language: "typescript",
      designSystem: "material-ui",
      designSystemVersion: "2.0.0",
      packSha256: "c".repeat(64),
    },
    nodes: [],
    diagnostics: [],
    summary: { reuse: 0, compose: 0, fallback: 0, blocked: 0 },
  };
  expect(validateWithSchema(ResolutionPlanV2Schema, value)).toEqual(value);
});
```

Add rejection cases for a 12-character hash, a v1 schema literal in either
source reference, and a missing design-system version.

- [ ] **Step 2: Verify red**

Run:

```bash
pnpm exec vitest run packages/contracts/src/resolution-plan-v2.test.ts
```

Expected: FAIL because `ResolutionPlanV2Schema` does not exist.

- [ ] **Step 3: Implement and export the schema**

Use `^[a-f0-9]{64}$` for all hashes. Keep the v1 resolution schema and types
unchanged. Export v1 and v2 with unambiguous names.

- [ ] **Step 4: Add resolution summary integrity**

Export:

```ts
export function assertResolutionPlanV2Integrity(
  plan: ResolutionPlanV2,
): void;
```

Recompute decision counts from `nodes` and reject a mismatching summary with
prefix `RESOLUTION_V2_INTEGRITY:`.

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm exec vitest run packages/contracts/src/resolution-plan-v2.test.ts packages/contracts/src/contracts-v2.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src
git commit -m "feat: add resolution source proof contract"
```

---

### Task 3: Define pack v2, render recipes, and style policy contracts

**Files:**

- Create: `packages/contracts/src/design-system-pack-v2.ts`
- Create: `packages/contracts/src/react-render-recipes.ts`
- Create: `packages/contracts/src/react-style-policy.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/react-pack-contracts.test.ts`

**Interfaces:**

- Consumes: v1 component catalog and composition rule identifiers.
- Produces: `DesignSystemPackV2Schema`, `ReactRenderRecipesSchema`,
  `ReactStylePolicySchema`, and their static TypeScript types.

- [ ] **Step 1: Write failing closed-schema tests**

Create valid minimal recipe and policy fixtures. Assert rejection of:

- an arbitrary source `"content.jsonPath"`;
- a recipe field `"jsx": "<Button />"`;
- a missing recipe provenance object;
- CSS property `"filter"`;
- `internalSelectors: true`;
- `inlineStyles: true`;
- `semanticChildrenPolicy: "guess"`;
- an absolute path in either new pack file.

Use this valid recipe core:

```ts
{
  componentId: "base.Button",
  content: { source: "content.label", target: "children" },
  stateProps: [
    { source: "state.disabled", target: "disabled", valueType: "boolean" }
  ],
  eventProps: [{ source: "activate", target: "onClick" }],
  classNameProp: "className",
  semanticChildrenPolicy: "forbidden",
  wrapper: "allowed",
  provenance: {
    kind: "verified-public-api",
    source: "test fixture declaration"
  }
}
```

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run packages/contracts/src/react-pack-contracts.test.ts
```

Expected: FAIL because the schemas are missing.

- [ ] **Step 3: Implement exact recipe enums**

Define closed enums:

```text
ContentSource:
content.text | content.label | content.value

StateSource:
state.disabled | state.checked | state.required | state.placeholder

EventSource:
activate | change

ChildrenPolicy:
forbidden | optional | required

Cardinality:
zero-or-one | exactly-one | many | one-or-more
```

Composition recipes must contain `compositionId`, `rootComponentId`, and slots
with either `acceptsRoles` or `acceptsRemaining: true`, never neither.
Component and composition recipes require a closed provenance object with
non-empty `kind` and `source`.

- [ ] **Step 4: Implement exact style enums**

Define the supported layout and appearance property unions exactly as the spec.
Model `internalSelectors` and `inlineStyles` as `Type.Literal(false)` so `true`
is not representable in v1. Require document-level style-policy provenance.

- [ ] **Step 5: Implement pack v2**

Copy the v1 manifest identity fields, change the schema literal to
`design-system-pack/v2`, and require:

```ts
reactRenderRecipes: Type.String({ minLength: 1 }),
reactStylePolicy: Type.String({ minLength: 1 }),
```

Do not modify the v1 schema.

- [ ] **Step 6: Run tests**

```bash
pnpm exec vitest run packages/contracts/src/react-pack-contracts.test.ts packages/contracts/src/contracts.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src
git commit -m "feat: define React design system recipes"
```

---

### Task 4: Define generation bundle and report contracts

**Files:**

- Create: `packages/contracts/src/react-generation.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/react-generation.test.ts`

**Interfaces:**

- Produces: `ReactGenerationReportSchema`, `ReactGenerationReport`,
  `ReactGenerationBundle`, `GeneratedSourceFile`, and validation-status types.
- The in-memory bundle carries bytes; the serializable report carries only
  path, kind, SHA-256, and byte length.

- [ ] **Step 1: Write failing generated and blocked report tests**

```ts
it.each(["generated", "blocked"] as const)(
  "validates a %s report",
  (status) => {
    const report = reportFixture(status);
    expect(
      validateWithSchema(ReactGenerationReportSchema, report),
    ).toEqual(report);
  },
);
```

Assert:

- generated status requires `syntax: "passed"`;
- blocked status requires `syntax: "not-run"` and no files;
- `targetTypecheck` accepts only `"not-run"`;
- file paths reject absolute paths and `..`;
- report file kinds exclude `"report"`.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run packages/contracts/src/react-generation.test.ts
```

Expected: FAIL because the schema does not exist.

- [ ] **Step 3: Implement report and in-memory bundle**

Use a serializable report schema plus a TypeScript-only bundle interface:

```ts
export interface ReactGenerationBundle {
  schema: "react-generation-bundle/v1";
  status: "generated" | "blocked";
  sourceRunId: string;
  files: GeneratedSourceFile[];
  report: ReactGenerationReport;
}

export interface GeneratedSourceFile {
  path: string;
  kind: "tsx" | "css-module" | "fallback-tsx" | "fallback-css-module";
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
}
```

- [ ] **Step 4: Add report integrity validation**

Export `assertReactGenerationReportIntegrity(report)`. It must recompute:

- generated file count by kind;
- total source byte length;
- status/validation consistency;
- zero source files for blocked status.

- [ ] **Step 5: Run tests**

```bash
pnpm exec vitest run packages/contracts/src/react-generation.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src
git commit -m "feat: define React generation artifacts"
```

---

### Task 5: Load and validate design-system pack v2

**Files:**

- Modify: `packages/component-catalog/src/load-pack.ts`
- Modify: `packages/component-catalog/src/index.ts`
- Create: `packages/component-catalog/src/validate-react-recipes.ts`
- Create: `packages/component-catalog/src/hash-loaded-pack.ts`
- Modify: `packages/component-catalog/src/load-pack.test.ts`
- Test: `packages/component-catalog/src/validate-react-recipes.test.ts`

**Interfaces:**

- Produces: `LoadedDesignSystemPackV2` with `reactRenderRecipes`,
  `reactStylePolicy`, and `sha256`.
- Produces: `loadDesignSystemPackV2(path)` for generation-only callers.
- Upgrades `loadDesignSystemPack(path)` into a schema-dispatching loader that
  returns the common v1 surface plus v2 fields when present, so Slice 1
  planning callers remain valid during the migration.
- Produces: `hashLoadedDesignSystemPackDocuments(documents): string`.

- [ ] **Step 1: Write failing loader tests**

Build temporary v2 packs and assert exact error codes for:

```text
REACT_RECIPE_COMPONENT_MISSING
REACT_RECIPE_COMPONENT_UNCOVERED
REACT_RECIPE_PROP_CONFLICT
REACT_COMPOSITION_RECIPE_INVALID
REACT_STYLE_COMPONENT_MISSING
```

Also assert that file order and modification time do not change the pack hash.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run packages/component-catalog/src/validate-react-recipes.test.ts
```

Expected: FAIL because the v2 loader is missing.

- [ ] **Step 3: Implement v2 document loading**

Reuse the existing safe relative-path and realpath containment checks. Parse all
eight v2 documents concurrently, validate schemas, then run existing catalog,
composition, and verification checks before React-specific checks.

Read `pack.json` first and dispatch on its exact schema literal. Unknown schema
versions fail with `DESIGN_SYSTEM_PACK_INVALID`; no shape-based guessing is
allowed.

- [ ] **Step 4: Implement cross-document recipe validation**

Validate:

- each recipe component exists;
- each verified candidate reachable by `reuse` or `compose` has one recipe;
- recipe prop targets are unique across content/state/event/class hooks;
- composition IDs and root/slot component IDs match existing composition
  rules and closure;
- only one remaining slot exists;
- explicit role sets do not overlap;
- style component IDs exist;
- fallback style policy is present for any role that permits fallback.

- [ ] **Step 5: Implement canonical pack hashing**

Hash `stableStringify` of:

```ts
{
  manifest,
  documents: {
    catalog,
    semanticPolicy,
    pixsoMap,
    compositionRules,
    tokens,
    verification,
    reactRenderRecipes,
    reactStylePolicy,
  },
}
```

Keys are fixed by code, not directory iteration.

- [ ] **Step 6: Run loader and catalog tests**

```bash
pnpm exec vitest run packages/component-catalog/src
pnpm typecheck
```

Expected: pass, including unchanged v1 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/component-catalog packages/contracts
git commit -m "feat: validate React generation packs"
```

---

### Task 6: Normalize `DesignIR v2` positioning

**Files:**

- Modify: `packages/design-normalizer/src/normalize-design.ts`
- Modify: `packages/design-normalizer/src/normalize-node.ts`
- Create: `packages/design-normalizer/src/normalize-position.ts`
- Modify: `packages/design-normalizer/src/index.ts`
- Modify: `packages/design-normalizer/src/normalize-design.test.ts`
- Create: `packages/design-normalizer/src/__fixtures__/minimal-design-ir-v2.json`

**Interfaces:**

- Produces: `normalizePixsoDesignV2({ artifactId, rootNodeId?, rawDsl })`.
- Keeps `normalizePixsoDesign` as the v1 historical function until migration is
  complete.

- [ ] **Step 1: Write failing positioning tests**

Use Pixso fixtures with:

- no positioning fact → no `position` field;
- explicit auto/flow fact → `{ mode: "flow" }`;
- explicit absolute fact with top/left → normalized inset;
- malformed/non-finite inset → `DESIGN_DSL_UNSUPPORTED`;
- overlapping coordinates without a positioning fact → no absolute output.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run packages/design-normalizer/src/normalize-design.test.ts
```

Expected: FAIL on the new v2 expectations.

- [ ] **Step 3: Implement source-field normalization**

Centralize Pixso-field interpretation in `normalize-position.ts`. Accept only
the exact provider field names observed in a committed minimal test fixture.
Do not infer from `left`, `top`, overlap, or parent layout.

- [ ] **Step 4: Emit and validate v2**

Reuse existing traversal, selected-root, contextual-ID, paint, and layout logic.
Construct `design-ir/v2` and run both TypeBox validation and
`assertDesignIRV2Integrity`.

- [ ] **Step 5: Update the deterministic golden**

Generate `minimal-design-ir-v2.json` from the minimal raw DSL and review every
changed field. Keep the v1 golden untouched.

- [ ] **Step 6: Run normalizer tests**

```bash
pnpm exec vitest run packages/design-normalizer/src
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/design-normalizer
git commit -m "feat: normalize explicit layout positioning"
```

---

### Task 7: Build `UiManifest v2` interactions and layout anchors

**Files:**

- Modify: `packages/semantic-planner/src/build-ui-manifest.ts`
- Create: `packages/semantic-planner/src/build-ui-manifest-v2.ts`
- Create: `packages/semantic-planner/src/interaction-recognizers.ts`
- Modify: `packages/semantic-planner/src/index.ts`
- Modify: `packages/semantic-planner/src/build-ui-manifest.test.ts`
- Test: `packages/semantic-planner/src/build-ui-manifest-v2.test.ts`

**Interfaces:**

- Produces: `buildUiManifestV2({ ir, exactMappings })`.
- Consumes: `DesignIRV2`; emits `UiManifestV2`.

- [ ] **Step 1: Write failing interaction and anchor tests**

Assert:

- every emitted node has `layoutSourceNodeId`;
- the anchor is the recognized node ID, not the first arbitrary descendant;
- a structurally recognized primary action receives an explicit
  `{ key: "primaryAction", event: "activate", valueType: "void" }`;
- a text input receives no `change` interaction unless deterministic semantic
  evidence identifies an editable control;
- exact action-group boundaries remain boundaries and do not invent actions;
- duplicate normalized interaction keys block semantic planning.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run packages/semantic-planner/src/build-ui-manifest-v2.test.ts
```

Expected: FAIL because the v2 builder is missing.

- [ ] **Step 3: Implement explicit layout anchors**

Every recognition result uses the recognized `DesignNode.id` as
`layoutSourceNodeId`. Composite recognizers that intentionally merge nodes must
choose and expose the container node explicitly.

- [ ] **Step 4: Implement bounded interaction recognition**

Only semantic nodes with `kind: "action"` and accepted evidence produce
`activate`. Use a stable key from semantic role; if multiple siblings share a
role, suffix keys by deterministic sibling index. Do not inspect button-label
language or raw DSL.

Do not add `change` in the first implementation unless the manifest fixture
provides an exact mapping rule that confirms it. Tests must prove absence is
preserved rather than guessed.

- [ ] **Step 5: Validate and emit v2**

Run `assertUiManifestV2Integrity` after schema validation.

- [ ] **Step 6: Run planner tests**

```bash
pnpm exec vitest run packages/semantic-planner/src
pnpm typecheck
```

Expected: pass, including existing v1 behavior tests.

- [ ] **Step 7: Commit**

```bash
git add packages/semantic-planner
git commit -m "feat: build interaction-aware UI manifests"
```

---

### Task 8: Resolve v2 artifacts with immutable source and pack proofs

**Files:**

- Modify: `packages/component-resolver/package.json`
- Create: `packages/component-resolver/src/resolve-ui-manifest-v2.ts`
- Create: `packages/component-resolver/src/hash-resolution-source.ts`
- Modify: `packages/component-resolver/src/index.ts`
- Test: `packages/component-resolver/src/resolve-ui-manifest-v2.test.ts`

**Interfaces:**

- Consumes: `DesignIRV2`, `UiManifestV2`, and
  `LoadedDesignSystemPackV2`.
- Produces: `resolveUiManifestV2(input): ResolutionPlanV2`.

- [ ] **Step 1: Write the failing v2 resolver test**

Resolve one complete manifest through two pack fixtures and assert:

- source hashes equal SHA-256 of stable serialized DesignIR and manifest;
- target pack ID/version/hash match the loaded pack;
- node decisions remain equivalent to v1 for the same semantics;
- changing one manifest byte changes only the manifest proof;
- changing a pack recipe changes the pack proof, even when resolution decisions
  remain the same.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run packages/component-resolver/src/resolve-ui-manifest-v2.test.ts
```

Expected: FAIL because the v2 resolver does not exist.

- [ ] **Step 3: Add the design-context dependency**

Use the existing exported SHA-256 helper; do not create a second hash
implementation.

- [ ] **Step 4: Implement v2 resolution**

Reuse `resolveNode` and appearance comparison. Construct the v2 source and
target proofs, validate the schema, and run
`assertResolutionPlanV2Integrity`.

- [ ] **Step 5: Run resolver tests**

```bash
pnpm exec vitest run packages/component-resolver/src
pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/component-resolver pnpm-lock.yaml
git commit -m "feat: resolve immutable v2 UI plans"
```

---

### Task 9: Upgrade Sber and MUI packs to v2 recipes

**Files:**

- Modify: `design-system-packs/sber-space-ui/pack.json`
- Create: `design-system-packs/sber-space-ui/react-render-recipes.json`
- Create: `design-system-packs/sber-space-ui/react-style-policy.json`
- Modify: `design-system-packs/material-ui/pack.json`
- Create: `design-system-packs/material-ui/react-render-recipes.json`
- Create: `design-system-packs/material-ui/react-style-policy.json`
- Modify: `packages/component-catalog/src/load-pack.test.ts`
- Modify: `apps/cli/src/create-program.test.ts`

**Interfaces:**

- Produces: two validated `design-system-pack/v2` built-in packs.
- Recipes cover every currently verified reusable/composed catalog component.

- [ ] **Step 1: Add failing built-in pack expectations**

Update tests to call `loadDesignSystemPackV2` and assert:

```ts
expect(pack.manifest.schema).toBe("design-system-pack/v2");
expect(pack.reactRenderRecipes.components.length).toBeGreaterThan(0);
expect(pack.sha256).toMatch(/^[a-f0-9]{64}$/);
```

Run tests and confirm they fail because the pack manifests are v1.

- [ ] **Step 2: Write Sber recipes**

Define exact recipes for all Sber catalog entries. Use only API facts already
verified by the catalog provenance. If a prop such as `className`, `open`, or
`onClick` is not currently proven, mark the recipe capability absent and use an
allowed wrapper or required external input instead of guessing.

Verify the narrow render surface against:

```text
/Users/danilel/dev/gigacode-mcp/resources/sber-space-ui/library-docs/@sber-space-ui
```

and the component's public `.d.ts` when available. Record the exact document or
declaration path in each recipe provenance. This is API verification for the
components used by Slice 2, not broad rules migration.

The Sber modal composition must place:

```text
heading → base.ModalHeader
remaining → base.ModalBody
actionGroup → base.ModalFooter
```

- [ ] **Step 3: Write MUI recipes**

Define equivalent recipes for all MUI catalog entries. Verify every prop and
composition surface against the official MUI public API documentation or the
package's public type declarations and record the exact source in provenance.
Include:

```text
heading → mui.DialogTitle
remaining → mui.DialogContent
actionGroup → mui.DialogActions
```

- [ ] **Step 4: Write conservative style policies**

Allow flow layout and external sizing. Keep library appearance overrides empty
in v1. Permit wrappers only where recipes explicitly allow them. Permit all
serializer-supported fallback styles only for roles whose semantic policy
allows fallback.

- [ ] **Step 5: Validate both packs through CLI tests**

```bash
pnpm exec vitest run packages/component-catalog/src apps/cli/src/create-program.test.ts
pnpm uig -- pack validate ./design-system-packs/sber-space-ui
pnpm uig -- pack validate ./design-system-packs/material-ui
```

Expected: both print `<pack-id>@<version>` and exit `0`.

- [ ] **Step 6: Commit**

```bash
git add design-system-packs packages/component-catalog apps/cli/src/create-program.test.ts
git commit -m "feat: add React recipes to built-in packs"
```

---

### Task 10: Make planning runs generation-ready with v2 artifacts

**Files:**

- Modify: `apps/cli/src/plan-from-snapshot.ts`
- Modify: `apps/cli/src/plan-from-url.ts`
- Modify: `apps/cli/src/create-program.ts`
- Modify: `apps/cli/src/plan-from-url.test.ts`
- Modify: `apps/cli/src/create-program.test.ts`
- Create: `apps/cli/src/plan-v2-artifacts.test.ts`
- Modify: `apps/cli/src/write-run-artifacts.ts`

**Interfaces:**

- Consumes: `normalizePixsoDesignV2`, `buildUiManifestV2`,
  `resolveUiManifestV2`, and `loadDesignSystemPackV2`.
- Produces: planning runs whose `design-ir.json`, `ui-manifest.json`, and
  `resolution-plan.json` are exact v2 artifacts usable by `uig generate`.
- Keeps raw snapshot storage and `GenerationRun v1` indexing unchanged.

- [ ] **Step 1: Write the failing v2 run-artifact test**

Plan from the minimal stored snapshot and assert:

```ts
expect(designIr.schema).toBe("design-ir/v2");
expect(uiManifest.schema).toBe("ui-manifest/v2");
expect(resolutionPlan.schema).toBe("resolution-plan/v2");
expect(resolutionPlan.source.designIr.sha256).toBe(
  sha256(stableStringify(designIr)),
);
expect(resolutionPlan.source.uiManifest.sha256).toBe(
  sha256(stableStringify(uiManifest)),
);
expect(resolutionPlan.target.packSha256).toBe(pack.sha256);
```

Also assert that `snapshot.json` remains `design-snapshot/v1` and `run.json`
remains `generation-run/v1`.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run apps/cli/src/plan-v2-artifacts.test.ts
```

Expected: FAIL because planning still calls the v1 pipeline.

- [ ] **Step 3: Upgrade planning orchestration**

Replace only the internal planning-stage calls with v2 functions. Preserve the
existing fetch, artifact store, run layout, atomic JSON writer, blocked exit
code, and relative artifact names.

- [ ] **Step 4: Preserve explicit historical behavior**

Do not rewrite existing `.uig/runs` or committed Slice 1 goldens. Add a test
showing that the v1 contract validators still read the historical fixtures,
while newly planned runs always emit v2.

- [ ] **Step 5: Run CLI planning tests**

```bash
pnpm exec vitest run apps/cli/src/plan-v2-artifacts.test.ts apps/cli/src/plan-from-url.test.ts apps/cli/src/create-program.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/cli
git commit -m "feat: write generation ready planning runs"
```

---

### Task 11: Scaffold generator and validate cross-artifact input

**Files:**

- Create: `packages/generator-react/package.json`
- Create: `packages/generator-react/src/errors.ts`
- Create: `packages/generator-react/src/validate-generation-input.ts`
- Create: `packages/generator-react/src/generation-model.ts`
- Create: `packages/generator-react/src/index.ts`
- Test: `packages/generator-react/src/validate-generation-input.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ReactGenerationInput {
  sourceRunId: string;
  designIr: DesignIRV2;
  uiManifest: UiManifestV2;
  resolutionPlan: ResolutionPlanV2;
  pack: LoadedDesignSystemPackV2;
}

export function validateGenerationInput(
  input: ReactGenerationInput,
): ValidatedGenerationInput;
```

- [ ] **Step 1: Write failing join/precondition tests**

Cover:

- valid exact hashes;
- DesignIR hash mismatch;
- manifest hash mismatch;
- pack ID/version/hash mismatch;
- missing, duplicate, and extra resolution nodes;
- a blocking diagnostic;
- `summary.blocked > 0`;
- missing layout anchor;
- unresolved semantic node;
- v1 artifacts rejected with `GENERATION_INPUT_INVALID`.

Assert exact `ReactGenerationError.code`.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run packages/generator-react/src/validate-generation-input.test.ts
```

Expected: FAIL because the package is missing.

- [ ] **Step 3: Add package dependencies and exports**

Depend on:

```json
{
  "@uig/component-catalog": "workspace:*",
  "@uig/contracts": "workspace:*",
  "@uig/design-context": "workspace:*",
  "typescript": "^5.9.3"
}
```

- [ ] **Step 4: Implement deterministic validation**

Flatten the manifest in document order. Index resolutions by
`manifestNodeId`. Compare exact stable hashes and target proofs before any
lowering.

On blocked input, return a typed blocked result suitable for report generation;
do not throw a generic error after validation has established a safe diagnostic
context.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm exec vitest run packages/generator-react/src/validate-generation-input.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/generator-react pnpm-lock.yaml
git commit -m "feat: validate React generation inputs"
```

---

### Task 12: Build deterministic imports, props, and interactions

**Files:**

- Create: `packages/generator-react/src/build-import-model.ts`
- Create: `packages/generator-react/src/build-props-model.ts`
- Modify: `packages/generator-react/src/generation-model.ts`
- Modify: `packages/generator-react/src/index.ts`
- Test: `packages/generator-react/src/build-import-model.test.ts`
- Test: `packages/generator-react/src/build-props-model.test.ts`

**Interfaces:**

- Produces:

```ts
buildImportModel(resolutions, recipes): ReactImportModel[];
buildPropsModel(node, resolution, recipe): {
  elementProps: ReactPropModel[];
  externalProps: GeneratedPropModel[];
};
```

- [ ] **Step 1: Write failing import tests**

Assert:

- named imports group by package;
- default imports stay separate;
- duplicates collapse;
- same local export name from different bindings receives a stable alias;
- alias output does not change when input order changes;
- an unused binding produces `GENERATION_INPUT_INVALID`;
- no import exists that was absent from the resolution.

- [ ] **Step 2: Write failing prop tests**

Assert:

- resolution defaults precede content/state/event/class hooks;
- label-to-children produces a child text model, not a `children` attribute;
- booleans remain booleans;
- callback `confirm` becomes `onConfirm?: () => void`;
- string change becomes `(value: string) => void`;
- normalized name collision with incompatible types produces
  `GENERATION_PROP_CONFLICT`;
- absent required recipe input produces `GENERATION_INPUT_INCOMPLETE`;
- no interaction means no callback.

- [ ] **Step 3: Verify red**

```bash
pnpm exec vitest run packages/generator-react/src/build-import-model.test.ts packages/generator-react/src/build-props-model.test.ts
```

Expected: FAIL because builders are missing.

- [ ] **Step 4: Implement import canonicalization**

Use keys `(package, export, exportKind, componentId)`. Sort by package, then
export kind, then export. Derive aliases from normalized component ID and add a
stable hash suffix only if normalization still collides.

- [ ] **Step 5: Implement recipe-driven props**

Use exhaustive switches over closed recipe source enums. Reject any mismatch;
never coerce `"false"` to `false` or a string to a number.

- [ ] **Step 6: Run tests**

```bash
pnpm exec vitest run packages/generator-react/src/build-import-model.test.ts packages/generator-react/src/build-props-model.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/generator-react
git commit -m "feat: lower React imports and props"
```

---

### Task 13: Place composition slots and build element tree

**Files:**

- Create: `packages/generator-react/src/place-composition-slots.ts`
- Create: `packages/generator-react/src/build-react-generation-model.ts`
- Modify: `packages/generator-react/src/generation-model.ts`
- Modify: `packages/generator-react/src/index.ts`
- Test: `packages/generator-react/src/place-composition-slots.test.ts`
- Test: `packages/generator-react/src/build-react-generation-model.test.ts`

**Interfaces:**

- Produces:

```ts
placeCompositionSlots(input): PlacedComposition;
buildReactGenerationModel(
  input: ValidatedGenerationInput,
): ReactGenerationModel;
```

- [ ] **Step 1: Write failing slot-placement tests**

Use the neutral modal tree. Assert:

- heading goes to heading slot;
- action group goes to actions slot;
- remaining content and field preserve order in body;
- every child is placed once;
- two headings violate `zero-or-one`;
- missing heading violates `exactly-one`;
- two remaining slots are rejected by pack validation;
- unmatched child with no remaining slot produces
  `GENERATION_COMPOSITION_AMBIGUOUS`.

- [ ] **Step 2: Write failing model tests**

Assert:

- one manifest tree becomes one React element tree;
- `reuse`, `compose`, and permitted `fallback` are distinct model kinds;
- semantic children policy is enforced;
- an action group with `required` children and none present produces
  `GENERATION_INPUT_INCOMPLETE`;
- intrinsic wrappers appear only when both recipe and style policy allow them.

- [ ] **Step 3: Verify red**

```bash
pnpm exec vitest run packages/generator-react/src/place-composition-slots.test.ts packages/generator-react/src/build-react-generation-model.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement role placement without pack-specific branches**

Use recipe role sets and remaining-slot rule only. Keep manifest document order
inside each slot. Use composition bindings already present in the resolution;
do not query the catalog for a substitute.

- [ ] **Step 5: Implement recursive model lowering**

Join each node to its resolution and recipe, build props/import references,
place children, and preserve source evidence.

- [ ] **Step 6: Run tests**

```bash
pnpm exec vitest run packages/generator-react/src/place-composition-slots.test.ts packages/generator-react/src/build-react-generation-model.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/generator-react
git commit -m "feat: lower UI compositions to React"
```

---

### Task 14: Build policy-controlled styles and fallbacks

**Files:**

- Create: `packages/generator-react/src/build-style-model.ts`
- Create: `packages/generator-react/src/build-fallback-model.ts`
- Modify: `packages/generator-react/src/generation-model.ts`
- Test: `packages/generator-react/src/build-style-model.test.ts`
- Test: `packages/generator-react/src/build-fallback-model.test.ts`

**Interfaces:**

- Produces:

```ts
buildStyleModel(node, designNode, recipe, policy): StyleBuildResult;
buildFallbackModel(node, designNode, resolution, policy): FallbackComponentModel;
```

- [ ] **Step 1: Write failing flow-layout tests**

Assert exact declarations for:

```text
vertical → display:flex + flex-direction:column
horizontal → display:flex + flex-direction:row
gap/padding/alignment/wrap → canonical properties and px units
```

Assert that width is omitted when forbidden and retained when allowed.

- [ ] **Step 2: Write failing positioning tests**

Assert:

- no position fact → no absolute;
- explicit flow → no absolute;
- explicit absolute plus legal relative parent → absolute and inset;
- absolute with forbidden parent positioning →
  `GENERATION_LAYOUT_UNSUPPORTED`;
- overlap without position fact → no absolute.

- [ ] **Step 3: Write failing appearance-policy tests**

Assert:

- forbidden radius emits non-blocking
  `GENERATION_STYLE_OVERRIDE_FORBIDDEN`;
- required forbidden structural style blocks;
- no internal selector or `!important` exists in the style model;
- allowed fallback transfers solid fill, borders, radii, shadows, opacity, and
  typography;
- unsupported paint remains diagnostic.

- [ ] **Step 4: Verify red**

```bash
pnpm exec vitest run packages/generator-react/src/build-style-model.test.ts packages/generator-react/src/build-fallback-model.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Implement exhaustive property lowering**

Use a fixed declaration order constant. Convert only normalized facts. Do not
read arbitrary object keys as CSS names.

- [ ] **Step 6: Implement fallback model**

Require `decision: "fallback"` and matching pack fallback policy. Generate a
stable PascalCase name from `localComponentName`; reject an unapproved fallback
with `GENERATION_FALLBACK_FORBIDDEN`.

- [ ] **Step 7: Run tests**

```bash
pnpm exec vitest run packages/generator-react/src/build-style-model.test.ts packages/generator-react/src/build-fallback-model.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/generator-react
git commit -m "feat: build policy controlled React styles"
```

---

### Task 15: Emit and syntax-validate TSX and CSS Modules

**Files:**

- Create: `packages/generator-react/src/emit-tsx.ts`
- Create: `packages/generator-react/src/emit-css-module.ts`
- Create: `packages/generator-react/src/validate-generated-source.ts`
- Modify: `packages/generator-react/src/index.ts`
- Test: `packages/generator-react/src/emit-tsx.test.ts`
- Test: `packages/generator-react/src/emit-css-module.test.ts`

**Interfaces:**

- Produces:

```ts
emitTsx(model: ReactGenerationModel): string;
emitCssModule(styles: StyleRuleModel[]): string;
validateGeneratedTsx(source: string, expected: SourceExpectation): void;
```

- [ ] **Step 1: Write failing TSX emission tests**

Golden-test:

- grouped imports and aliases;
- generated props interface;
- composition JSX;
- boolean, number, string, and callback props;
- text containing `"`, `'`, `<`, `>`, `{`, `}`, newlines, and Cyrillic;
- modern JSX without an unnecessary React import;
- absence of `useState`, `useEffect`, `fetch`, and `axios`.

- [ ] **Step 2: Write failing CSS tests**

Assert:

- stable class order;
- canonical declaration order;
- normalized px and colors;
- no global selector, descendant selector, `!important`, or inline style;
- byte-identical output when style-model input order changes.

- [ ] **Step 3: Verify red**

```bash
pnpm exec vitest run packages/generator-react/src/emit-tsx.test.ts packages/generator-react/src/emit-css-module.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement TypeScript AST emission**

Build import declarations, interface declarations, function component, JSX
elements, and default export through `typescript.factory`. Use
`typescript.createPrinter` for output.

- [ ] **Step 5: Implement syntax validation**

Parse with `ScriptKind.TSX`; reject `parseDiagnostics`. Walk imports and JSX
identifiers and compare them with the model expectation. Report
`GENERATION_SOURCE_INVALID` on mismatch.

- [ ] **Step 6: Implement CSS serialization**

Serialize typed selectors and declarations only. End files with exactly one
newline.

- [ ] **Step 7: Run tests**

```bash
pnpm exec vitest run packages/generator-react/src/emit-tsx.test.ts packages/generator-react/src/emit-css-module.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/generator-react
git commit -m "feat: emit deterministic TSX and CSS"
```

---

### Task 16: Generate bundle, report, and atomic CLI output

**Files:**

- Create: `packages/generator-react/src/generate-react-bundle.ts`
- Create: `packages/generator-react/src/generate-react-bundle.test.ts`
- Modify: `packages/generator-react/src/index.ts`
- Create: `apps/cli/src/generate-from-run.ts`
- Create: `apps/cli/src/write-generated-bundle.ts`
- Create: `apps/cli/src/generate-from-run.test.ts`
- Create: `apps/cli/src/resolve-design-system-pack.ts`
- Modify: `apps/cli/src/create-program.ts`
- Modify: `apps/cli/package.json`
- Modify: `apps/cli/src/create-program.test.ts`

**Interfaces:**

- Produces:

```ts
generateReactBundle(input: ReactGenerationInput): ReactGenerationBundle;
generateFromRun(input: {
  runId: string;
  workspaceDir: string;
  explicitPackPath?: string;
}): Promise<{ outputPath: string; status: "generated" | "blocked" }>;
writeGeneratedBundleAtomically(input): Promise<"written" | "identical">;
```

- [ ] **Step 1: Write failing pure bundle tests**

Assert:

- generated bundle contains root TSX/CSS and fallback pairs;
- file hashes and byte lengths match bytes;
- report statistics match model;
- blocked input contains zero source files and one blocking diagnostic;
- `targetTypecheck` is exactly `not-run`;
- two calls return byte-identical files and report.

- [ ] **Step 2: Write failing filesystem tests**

Using a temporary workspace, assert:

- run path traversal is rejected;
- artifacts are read from the selected run only;
- built-in pack ID is loaded;
- explicit pack ID/version/hash must match;
- first write creates the directory;
- second identical write changes no bytes;
- a conflicting directory remains untouched and emits
  `GENERATION_OUTPUT_CONFLICT`;
- a blocked run contains only `generation-report.json`;
- no file appears outside `.uig/runs/<run-id>/generated`.

- [ ] **Step 3: Verify red**

```bash
pnpm exec vitest run packages/generator-react/src/generate-react-bundle.test.ts apps/cli/src/generate-from-run.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement bundle generation**

Validate input. When `validateGenerationInput` returns a blocked result, return
the blocked report before model construction. For a valid non-blocked result,
build the model, emit source, validate syntax, hash files, and construct the
generated report.
The report excludes itself from `files`.

- [ ] **Step 5: Implement atomic writer**

Write a sibling temporary directory using exclusive file creation. Compare
complete relative-path/byte maps when destination exists. Rename only when the
destination is absent. Always clean the temporary directory on failure.

- [ ] **Step 6: Wire CLI**

Add:

```text
uig generate --run <run-id> [--design-system-pack <path>]
```

Print the generated path. Set exit code `2` for blocked, `1` for errors, and
`0` for written/identical output. Do not construct a Pixso client.

Move the built-in pack ID/path mapping into
`resolve-design-system-pack.ts` and reuse it from both `plan` and `generate`;
do not duplicate the Sber/MUI switch.

- [ ] **Step 7: Run package and CLI tests**

```bash
pnpm exec vitest run packages/generator-react/src apps/cli/src/generate-from-run.test.ts apps/cli/src/create-program.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/generator-react apps/cli pnpm-lock.yaml
git commit -m "feat: add React generation CLI"
```

---

### Task 17: Add dual-pack goldens, real blocked evidence, and operator docs

**Files:**

- Create: `apps/cli/src/react-generation-acceptance.test.ts`
- Create: `scripts/generate-react-acceptance-candidates.ts`
- Create: `fixtures/react-generation/modal/source.design-ir.json`
- Create: `fixtures/react-generation/modal/source.ui-manifest.json`
- Create: `fixtures/react-generation/modal/sber-space-ui/resolution-plan.json`
- Create: `fixtures/react-generation/modal/sber-space-ui/generated/*`
- Create: `fixtures/react-generation/modal/material-ui/resolution-plan.json`
- Create: `fixtures/react-generation/modal/material-ui/generated/*`
- Create: `fixtures/react-generation/pixso-4-314/sber-space-ui/generation-report.json`
- Create: `fixtures/react-generation/pixso-4-314/material-ui/generation-report.json`
- Modify: `apps/cli/src/offline-acceptance.test.ts`
- Modify: `apps/cli/src/readme-commands.test.ts`
- Modify: `README.md`
- Modify: `docs/contracts.md`
- Modify: `docs/design-system-packs.md`
- Modify: `docs/diagnostics.md`
- Modify: `docs/fixture-policy.md`
- Modify: `package.json`
- Modify: `scripts/verify-fixture-provenance.mjs`

**Interfaces:**

- Produces: reviewed offline proof for both design systems and current real
  blocked behavior.
- Produces: copyable `uig generate` documentation.

- [ ] **Step 1: Write the failing dual-pack acceptance test**

Create one complete neutral modal:

```text
dialog
├── heading
├── content
├── textInput
└── actionGroup
    ├── secondaryAction
    └── primaryAction
```

Include explicit content, layout anchors, and action interactions. Resolve the
same manifest through Sber and MUI, generate both bundles, and compare every
artifact with a committed golden.

Assert:

- source manifest stable bytes are unchanged;
- no Sber import appears in MUI;
- no MUI import appears in Sber;
- callback interfaces are semantically identical;
- generated sources contain no business-logic signatures;
- CSS contains no `!important` or internal selector;
- repeated generation is byte-identical.

- [ ] **Step 2: Verify red**

```bash
pnpm exec vitest run apps/cli/src/react-generation-acceptance.test.ts
```

Expected: FAIL because goldens do not exist.

- [ ] **Step 3: Generate candidates in a temporary directory**

Create `scripts/generate-react-acceptance-candidates.ts`. It must write to a
fresh OS temporary directory by default and print safe statistics: imports,
component name, prop names, CSS rule count, fallback count, output directory,
and hashes. It must refuse a destination under `fixtures/` so candidate review
cannot accidentally overwrite accepted evidence.

- [ ] **Step 4: Review and accept dual-pack candidates**

Manually inspect:

- every import;
- modal slot structure;
- text and callbacks;
- CSS policy compliance;
- report validation fields;
- absence of target-project claims.

Copy candidates into fixtures only after review, then rerun the acceptance test
to green.

- [ ] **Step 5: Add real `4:314` blocked reports**

Replay the recorded raw source through the v2 normalizer/planner/resolver.
Assert:

- Sber report contains the existing unresolved combobox blocker;
- MUI report contains `GENERATION_INPUT_INCOMPLETE` for missing semantic action
  children;
- neither directory contains TSX or CSS;
- the old Slice 1 goldens remain byte-identical.

- [ ] **Step 6: Add fixture provenance**

Extend fixture policy with hashes for all new source and golden files. Update
the provenance verifier to reject drift without formatting source artifacts.

- [ ] **Step 7: Update README tested commands**

Add a tested non-mutating command:

```bash
pnpm uig -- generate --help
```

The README command test must assert exit `0` without network or token. The
separate `generate-from-run.test.ts` remains the executable offline proof for a
temporary stored run fixture.

- [ ] **Step 8: Update contract, pack, diagnostic, and fixture docs**

Document:

- all v2 boundaries and historical-run behavior;
- recipes and style policy;
- all generation diagnostics;
- `targetTypecheck: not-run`;
- generated directory contents;
- Slice 2 versus Slice 3/4/5 boundaries.

- [ ] **Step 9: Run final verification twice**

Run:

```bash
pnpm format
pnpm verify
pnpm verify
pnpm uig -- --help
pnpm uig -- pack validate ./design-system-packs/sber-space-ui
pnpm uig -- pack validate ./design-system-packs/material-ui
git diff --check
git status --short
```

Expected:

- 0 failures in both full verification runs;
- both packs validate;
- help lists `generate`;
- only intended Task 17 files are uncommitted before commit.

- [ ] **Step 10: Commit**

```bash
git add fixtures apps/cli/src README.md docs package.json scripts
git commit -m "test: prove deterministic React generation"
```

- [ ] **Step 11: Record completion evidence**

Run:

```bash
git log --oneline --decorate -20
pnpm verify
git status --short --branch
```

Expected: all 17 task commits are present, verification passes, and the feature
worktree is clean.

---

## Implementation Checkpoints

Pause for review after these batches:

1. Tasks 1–4: all public v2 and generation contracts.
2. Tasks 5–10: loader, v2 normalizer/planner/resolver, built-in packs, and v2
   planning runs.
3. Tasks 11–13: validated generation model, imports, props, and composition.
4. Tasks 14–16: styles, emitters, bundle, and CLI.
5. Task 17: acceptance evidence and documentation.

Do not continue past a failed checkpoint. Fix the failing slice and rerun its
focused tests before proceeding.

## Final Definition of Done

- All 16 design-spec acceptance criteria have direct automated evidence.
- `pnpm verify` passes twice consecutively in the implementation worktree.
- Generated Sber and MUI bundles come from one unchanged neutral manifest.
- Current `4:314` remains blocked rather than partially generated.
- No normal test contacts Pixso or requires a token.
- No target React project is created or modified.
- No legacy Qwen, `/dsl-ui-direct`, or external generation workflow is used.
- The worktree is clean and the branch integration choice is left to the user.
