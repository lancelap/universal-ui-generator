# Render-Only Modal Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a deterministic presentation-only Sber Space UI React bundle for the real Pixso modal `4:314`, using verified pack recipes for `Autocomplete`, explicit reporting for render-only props and missing semantic children, and the ordinary `uig plan` → `uig generate` workflow.

**Architecture:** Versioned JSON pack contracts describe all component-specific JSX behavior. The catalog loader normalizes historical v1 recipes to an effective v2 model, the resolver selects verified components, and `generator-react` lowers the resolved semantic tree into typed React and CSS models without knowing Sber component names. The CLI reads a completed run, verifies its pack hash, writes a deterministic bundle atomically, and exposes the same workflow Qwen invokes.

**Tech Stack:** TypeScript 5.9, Node.js 22+, TypeBox closed schemas, Vitest, TypeScript Compiler API, Commander, pnpm workspaces, React TSX source generation, CSS Modules.

## Global Constraints

- Do not hardcode Sber Space UI, `combobox`, `Autocomplete`, or package names in `packages/generator-react`.
- Do not execute JavaScript or JSX supplied by a design-system pack.
- Do not generate `useState`, `useEffect`, API calls, form orchestration, option data, or business behavior.
- A blocked resolution still produces no TSX or CSS.
- An empty structural group is renderable only under `semanticChildrenPolicy: "render-only-optional"` and must produce a non-blocking diagnostic.
- Render-only prop values are limited to `literal`, `empty-array`, and `noop`.
- The emitter owns the fixed implementations of `empty-array` and `noop`.
- New outputs use `react-render-recipes/v2`, `react-generation-report/v2`, and `react-generation-bundle/v2`.
- Historical v1 recipes and reports remain readable.
- Every input run must match the exact design-system ID, version, and pack SHA-256 used during resolution.
- No normal test may contact Pixso or require `PIXSO_ACCESS_TOKEN`.
- The live Pixso/Qwen check is manual acceptance evidence and must not commit `.uig` artifacts or secrets.
- All source writes use existing atomic run/bundle boundaries.
- Use TDD for every behavior change and commit each task independently.

---

## File Structure

### Contract ownership

- Modify `packages/contracts/src/react-render-recipes.ts`
  - retain historical v1 schemas;
  - add v2 static-prop and semantic-children schemas.
- Modify `packages/contracts/src/react-generation.ts`
  - retain historical report v1;
  - add report/bundle v2 and integrity checks.
- Modify `packages/contracts/src/index.ts`
  - export the new schemas and types.
- Modify `packages/contracts/src/react-pack-contracts.test.ts`
  - prove recipe v1 compatibility and v2 closure.
- Modify `packages/contracts/src/react-generation.test.ts`
  - prove report/bundle v1 compatibility and v2 integrity.

### Pack loading and validation

- Modify `packages/component-catalog/src/load-pack.ts`
  - normalize a loaded v1 recipe document to effective v2.
- Create `packages/component-catalog/src/normalize-react-recipes.ts`
  - own the pure v1 → v2 migration.
- Modify `packages/component-catalog/src/validate-react-recipes.ts`
  - validate static props, noop targets, and v2 child policies.
- Modify `packages/component-catalog/src/validate-react-recipes.test.ts`
  - cover migration and all invalid pack cases.
- Modify `packages/component-catalog/src/index.ts`
  - export the effective v2 loaded-pack interface.

### Built-in packs

- Modify `design-system-packs/sber-space-ui/catalog.json`
  - add verified `base.Autocomplete`.
- Modify `design-system-packs/sber-space-ui/semantic-policy.json`
  - route `combobox` to `base.Autocomplete`.
- Modify `design-system-packs/sber-space-ui/react-render-recipes.json`
  - migrate to v2 and add render-only static props.
- Modify `design-system-packs/sber-space-ui/react-style-policy.json`
  - permit only documented outer layout hooks for `base.Autocomplete`.
- Modify `design-system-packs/sber-space-ui/verification.json`
  - add canonical proof.
- Modify `design-system-packs/material-ui/react-render-recipes.json`
  - migrate mechanically to v2.
- Modify the Sber `base.Stack` and Material UI `mui.Stack` recipes
  - use `render-only-optional`.
- Modify `packages/component-resolver/src/resolve-node.test.ts`
  - prove Sber combobox reuse.
- Modify `packages/component-resolver/src/resolve-ui-manifest-v2.test.ts`
  - prove stable v2 plan and new pack hash.
- Modify `fixtures/pixso/modal-4-314/expected.sber-space-ui.resolution-plan.json`
  - accept reviewed offline resolution evidence.

### React model and lowering

- Modify `packages/generator-react/src/generation-model.ts`
  - add `empty-array`, `noop`, render-only reports, diagnostics, and styles.
- Modify `packages/generator-react/src/build-props-model.ts`
  - lower static props with deterministic precedence.
- Modify `packages/generator-react/src/build-props-model.test.ts`
  - test render-only opcodes and replacement.
- Modify `packages/generator-react/src/build-react-generation-model.ts`
  - collect render-only metadata and missing-child warnings.
- Modify `packages/generator-react/src/build-react-generation-model.test.ts`
  - prove empty structural placeholder behavior.
- Create `packages/generator-react/src/build-style-model.ts`
  - lower normalized layout and permitted appearance.
- Create `packages/generator-react/src/build-style-model.test.ts`
  - prove policy-controlled styles.
- Create `packages/generator-react/src/build-fallback-model.ts`
  - construct permitted fallback components.
- Create `packages/generator-react/src/build-fallback-model.test.ts`
  - reject unapproved fallbacks.

### Source emission and bundle

- Create `packages/generator-react/src/emit-tsx.ts`
  - emit TSX with TypeScript AST nodes.
- Create `packages/generator-react/src/emit-tsx.test.ts`
  - prove escaping, opcodes, imports, and composition.
- Create `packages/generator-react/src/emit-css-module.ts`
  - serialize typed CSS rules deterministically.
- Create `packages/generator-react/src/emit-css-module.test.ts`
  - prove safe selectors and stable order.
- Create `packages/generator-react/src/validate-generated-source.ts`
  - parse and structurally validate emitted TSX.
- Create `packages/generator-react/src/generate-react-bundle.ts`
  - produce source files, hashes, v2 report, or blocked report.
- Create `packages/generator-react/src/generate-react-bundle.test.ts`
  - prove byte stability and honest reporting.
- Modify `packages/generator-react/src/index.ts`
  - export the completed compiler surface.

### CLI and acceptance

- Create `apps/cli/src/resolve-design-system-pack.ts`
  - share built-in pack ID/path resolution.
- Create `apps/cli/src/generate-from-run.ts`
  - load and validate stored artifacts, then call the pure generator.
- Create `apps/cli/src/write-generated-bundle.ts`
  - atomically install or compare the generated directory.
- Create `apps/cli/src/generate-from-run.test.ts`
  - prove filesystem boundaries and blocked behavior.
- Modify `apps/cli/src/create-program.ts`
  - add `uig generate`.
- Modify `apps/cli/src/create-program.test.ts`
  - prove command arguments, output, and exit codes.
- Create `apps/cli/src/react-generation-acceptance.test.ts`
  - prove dual-pack and real `4:314` offline results.
- Modify `README.md`, `docs/contracts.md`, `docs/design-system-packs.md`,
  `docs/diagnostics.md`, and `docs/fixture-policy.md`
  - document the public workflow and limitations.

---

### Task 1: Version render-recipe and generation-report contracts

**Files:**

- Modify: `packages/contracts/src/react-render-recipes.ts`
- Modify: `packages/contracts/src/react-generation.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/react-pack-contracts.test.ts`
- Test: `packages/contracts/src/react-generation.test.ts`

**Interfaces:**

- Consumes: existing `react-render-recipes/v1` and
  `react-generation-report/v1`.
- Produces:

```ts
type StaticRenderPropValue =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "empty-array" }
  | { kind: "noop" };

interface StaticRenderProp {
  target: string;
  value: StaticRenderPropValue;
  reason: "render-only";
}

type SemanticChildrenPolicyV2 =
  | "forbidden"
  | "optional"
  | "required"
  | "render-only-optional";

interface RenderOnlyPropReport {
  manifestNodeId: string;
  componentId: string;
  propNames: string[];
}
```

- New generator output uses:

```ts
interface ReactGenerationBundleV2 {
  schema: "react-generation-bundle/v2";
  status: "generated" | "blocked";
  sourceRunId: string;
  files: GeneratedSourceFile[];
  report: ReactGenerationReportV2;
}
```

- [ ] **Step 1: Write failing recipe v2 schema tests**

Add exact valid and invalid documents:

```ts
const validV2 = {
  schema: "react-render-recipes/v2",
  components: [
    {
      componentId: "base.Autocomplete",
      staticProps: [
        {
          target: "options",
          value: { kind: "empty-array" },
          reason: "render-only",
        },
        {
          target: "onChange",
          value: { kind: "noop" },
          reason: "render-only",
        },
      ],
      stateProps: [],
      eventProps: [{ source: "change", target: "onChange" }],
      semanticChildrenPolicy: "forbidden",
      wrapper: "allowed",
      provenance: { kind: "canonical-library-doc", source: "Autocomplete.md" },
    },
  ],
  compositions: [],
};
```

Assert that `source`, `expression`, non-empty array values, object values, and
unknown `kind` values fail closed-schema validation. Assert the existing v1
fixture still validates unchanged.

- [ ] **Step 2: Run recipe contract tests and verify red**

Run:

```bash
pnpm exec vitest run packages/contracts/src/react-pack-contracts.test.ts
```

Expected: FAIL because `ReactRenderRecipesV2Schema` is not exported.

- [ ] **Step 3: Implement v1/v2 recipe schemas**

Keep the current schemas as explicitly named v1 schemas. Add v2 schemas and a
read union:

```ts
export const ReactRenderRecipesSchema = Type.Union([
  ReactRenderRecipesV1Schema,
  ReactRenderRecipesV2Schema,
]);

export type ReactRenderRecipesV1 = Static<
  typeof ReactRenderRecipesV1Schema
>;
export type ReactRenderRecipesV2 = Static<
  typeof ReactRenderRecipesV2Schema
>;
export type ReactComponentRecipeV2 = Static<
  typeof ReactComponentRecipeV2Schema
>;
```

Do not add `staticProps` or `render-only-optional` to the v1 component schema.

- [ ] **Step 4: Write failing report v2 tests**

Construct a v2 generated report containing:

```ts
renderOnlyProps: [
  {
    manifestNodeId: "ui_combobox_4-316",
    componentId: "base.Autocomplete",
    propNames: ["mode", "onChange", "options", "value"],
  },
],
```

Assert:

- v2 requires `renderOnlyProps`;
- prop names must be non-empty strings;
- historical v1 reports validate without the new field;
- v2 bundle rejects a v1 report;
- integrity rejects blocked v2 output with source files.

- [ ] **Step 5: Run report tests and verify red**

Run:

```bash
pnpm exec vitest run packages/contracts/src/react-generation.test.ts
```

Expected: FAIL because v2 report and bundle schemas do not exist.

- [ ] **Step 6: Implement report/bundle v2**

Use separate common-property objects so the schema literal stays exact:

```ts
const ReportV2CommonProperties = {
  schema: Type.Literal("react-generation-report/v2"),
  sourceRunId: Type.String({ minLength: 1 }),
  designSystem: Type.String({ minLength: 1 }),
  statistics: StatisticsSchema,
  renderOnlyProps: Type.Array(RenderOnlyPropReportSchema),
};
```

Make `ReactGenerationReportSchema` a read union of v1 and v2. Make the current
generator-facing `ReactGenerationBundle` type point to v2, and export a
historical bundle v1 type separately.

- [ ] **Step 7: Run contract verification**

Run:

```bash
pnpm exec vitest run packages/contracts/src/react-pack-contracts.test.ts packages/contracts/src/react-generation.test.ts
pnpm typecheck
```

Expected: all selected tests pass and typecheck exits `0`.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts
git commit -m "feat: version render-only React contracts"
```

---

### Task 2: Normalize and validate effective v2 recipes

**Files:**

- Create: `packages/component-catalog/src/normalize-react-recipes.ts`
- Modify: `packages/component-catalog/src/load-pack.ts`
- Modify: `packages/component-catalog/src/validate-react-recipes.ts`
- Modify: `packages/component-catalog/src/index.ts`
- Test: `packages/component-catalog/src/validate-react-recipes.test.ts`
- Test: `packages/component-catalog/src/load-pack.test.ts`

**Interfaces:**

- Consumes:

```ts
ReactRenderRecipesV1 | ReactRenderRecipesV2
```

- Produces:

```ts
normalizeReactRenderRecipes(
  input: ReactRenderRecipesV1 | ReactRenderRecipesV2,
): ReactRenderRecipesV2;

interface LoadedDesignSystemPackV2 {
  reactRenderRecipes: ReactRenderRecipesV2;
}
```

- [ ] **Step 1: Write the failing pure migration test**

Use a one-component v1 document and assert:

```ts
expect(normalizeReactRenderRecipes(v1)).toEqual({
  schema: "react-render-recipes/v2",
  components: [
    {
      ...v1.components[0],
      staticProps: [],
    },
  ],
  compositions: v1.compositions,
});
```

Assert a v2 document is returned byte-equivalent after validation and is not
mutated.

- [ ] **Step 2: Write failing validation tests**

Add pack fixtures that must fail with exact codes:

```text
duplicate static target       → REACT_RECIPE_PROP_CONFLICT
noop target absent from event → REACT_RECIPE_PROP_CONFLICT
unknown component             → REACT_RECIPE_COMPONENT_MISSING
unknown child policy          → DESIGN_SYSTEM_PACK_INVALID
```

Also assert a static `onChange` noop and an event mapping to `onChange` are not
treated as a conflict: the static value is a lower-precedence default.

- [ ] **Step 3: Run tests and verify red**

Run:

```bash
pnpm exec vitest run packages/component-catalog/src/validate-react-recipes.test.ts packages/component-catalog/src/load-pack.test.ts
```

Expected: FAIL because migration and static validation are absent.

- [ ] **Step 4: Implement pure recipe normalization**

Implement only the structural migration:

```ts
export function normalizeReactRenderRecipes(
  input: ReactRenderRecipesV1 | ReactRenderRecipesV2,
): ReactRenderRecipesV2 {
  if (input.schema === "react-render-recipes/v2") {
    return structuredClone(input);
  }
  return {
    schema: "react-render-recipes/v2",
    components: input.components.map((recipe) => ({
      ...recipe,
      staticProps: [],
    })),
    compositions: structuredClone(input.compositions),
  };
}
```

Do not infer static values during migration.

- [ ] **Step 5: Normalize at the loader boundary**

In `loadV2Pack`, validate the stored document with the v1/v2 read union, then
normalize once:

```ts
const rawReactRenderRecipes = await readAndValidate(
  root,
  manifest.files.reactRenderRecipes,
  ReactRenderRecipesSchema,
);
const reactRenderRecipes =
  normalizeReactRenderRecipes(rawReactRenderRecipes);
```

Hash the normalized effective document. That makes the pack proof reflect the
actual recipe behavior used by the generator.

- [ ] **Step 6: Implement cross-document static validation**

For each v2 recipe:

```ts
const staticTargets = recipe.staticProps.map((prop) => prop.target);
if (new Set(staticTargets).size !== staticTargets.length) {
  recipeConflict(recipe.componentId, "duplicate static prop target");
}

const eventTargets = new Set(recipe.eventProps.map((prop) => prop.target));
for (const prop of recipe.staticProps) {
  if (prop.value.kind === "noop" && !eventTargets.has(prop.target)) {
    recipeConflict(recipe.componentId, `noop target ${prop.target} is not an event`);
  }
}
```

Keep duplicate checking within dynamic content/state/event/className targets.
Do not reject an intentional static-to-dynamic target overlap.

- [ ] **Step 7: Run loader and catalog tests**

Run:

```bash
pnpm exec vitest run packages/component-catalog/src
pnpm typecheck
```

Expected: all component-catalog tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/component-catalog
git commit -m "feat: normalize v2 React recipes"
```

---

### Task 3: Resolve Sber combobox to verified Autocomplete

**Files:**

- Modify: `design-system-packs/sber-space-ui/catalog.json`
- Modify: `design-system-packs/sber-space-ui/semantic-policy.json`
- Modify: `design-system-packs/sber-space-ui/react-render-recipes.json`
- Modify: `design-system-packs/sber-space-ui/react-style-policy.json`
- Modify: `design-system-packs/sber-space-ui/verification.json`
- Modify: `design-system-packs/material-ui/react-render-recipes.json`
- Test: `packages/component-resolver/src/resolve-node.test.ts`
- Test: `packages/component-resolver/src/resolve-ui-manifest-v2.test.ts`
- Test: `packages/component-catalog/src/load-pack.test.ts`
- Modify: `fixtures/pixso/modal-4-314/expected.sber-space-ui.resolution-plan.json`

**Interfaces:**

- Produces the verified binding:

```ts
{
  componentId: "base.Autocomplete",
  package: "@sber-space-ui/autocomplete",
  export: "Autocomplete",
  exportKind: "named",
}
```

- Produces a `reuse` resolution for role `combobox`.

- [ ] **Step 1: Change the resolver expectation first**

Update the Sber matrix in `resolve-node.test.ts`:

```ts
["combobox", "reuse", "base.Autocomplete"]
```

Add exact assertions for package, export, and absence of fallback.

- [ ] **Step 2: Run resolver test and verify red**

Run:

```bash
pnpm exec vitest run packages/component-resolver/src/resolve-node.test.ts
```

Expected: FAIL with the current `NATIVE_FALLBACK_FORBIDDEN` or blocked decision.

- [ ] **Step 3: Add the verified catalog and policy entries**

Add `base.Autocomplete` exactly as specified in the approved addendum. Add the
matching verification record:

```json
{
  "componentId": "base.Autocomplete",
  "status": "verified",
  "source": "gigacode-mcp/resources/sber-space-ui/library-docs/@sber-space-ui/Autocomplete/Autocomplete.md"
}
```

Change only the `combobox` policy candidate list and allowed decisions.

- [ ] **Step 4: Migrate both recipe documents to v2**

Set:

```json
"schema": "react-render-recipes/v2"
```

Add `"staticProps": []` to every existing recipe. Add the approved
`base.Autocomplete` recipe with:

```json
[
  {
    "target": "mode",
    "value": { "kind": "literal", "value": "dropdown" },
    "reason": "render-only"
  },
  {
    "target": "value",
    "value": { "kind": "literal", "value": "" },
    "reason": "render-only"
  },
  {
    "target": "options",
    "value": { "kind": "empty-array" },
    "reason": "render-only"
  },
  {
    "target": "onChange",
    "value": { "kind": "noop" },
    "reason": "render-only"
  }
]
```

Set the Sber `base.Stack` and Material UI `mui.Stack` recipes to:

```json
"semanticChildrenPolicy": "render-only-optional"
```

- [ ] **Step 5: Add the Autocomplete style entry**

Permit only outer layout properties already allowed for equivalent controls:

```json
{
  "componentId": "base.Autocomplete",
  "layout": {
    "allowed": ["width", "minWidth", "maxWidth", "alignSelf"]
  },
  "appearance": { "allowed": [] },
  "wrapper": "allowed"
}
```

Do not authorize internal selectors or appearance overrides.

- [ ] **Step 6: Run pack and resolver tests**

Run:

```bash
pnpm uig -- pack validate ./design-system-packs/sber-space-ui
pnpm uig -- pack validate ./design-system-packs/material-ui
pnpm exec vitest run packages/component-catalog/src packages/component-resolver/src
```

Expected: both packs validate; Sber combobox resolves to
`base.Autocomplete`.

- [ ] **Step 7: Regenerate the offline `4:314` resolution candidate**

Use the recorded fixture only:

```bash
pnpm exec vitest run apps/cli/src/offline-acceptance.test.ts
```

Expected first run: FAIL with a golden difference showing:

```text
blocked: 1 → 0
reuse: 2 → 3
ui_combobox_4-316: blocked → base.Autocomplete
packSha256: old → new
```

Review the complete candidate. Update only
`expected.sber-space-ui.resolution-plan.json`; do not format or rewrite
`source.json`.

- [ ] **Step 8: Re-run the offline acceptance test**

Run:

```bash
pnpm exec vitest run apps/cli/src/offline-acceptance.test.ts
pnpm verify:fixtures
```

Expected: pass with updated provenance.

- [ ] **Step 9: Commit**

```bash
git add design-system-packs packages/component-resolver fixtures/pixso/modal-4-314 scripts/verify-fixture-provenance.mjs
git commit -m "feat: resolve Sber autocomplete controls"
```

---

### Task 4: Lower render-only props and empty structural groups

**Files:**

- Modify: `packages/generator-react/src/generation-model.ts`
- Modify: `packages/generator-react/src/build-props-model.ts`
- Modify: `packages/generator-react/src/build-react-generation-model.ts`
- Test: `packages/generator-react/src/build-props-model.test.ts`
- Test: `packages/generator-react/src/build-react-generation-model.test.ts`

**Interfaces:**

- Extends:

```ts
type ReactPropValueModel =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "empty-array" }
  | { kind: "noop" }
  | { kind: "external-prop"; propName: string }
  | { kind: "class-name"; className: string };

interface ReactPropsBuildResult {
  elementProps: ReactPropModel[];
  externalProps: GeneratedPropModel[];
  renderOnlyPropNames: string[];
  textChild?: ReactTextChildModel;
}

interface ReactGenerationModel {
  imports: ReactImportModel[];
  externalProps: GeneratedPropModel[];
  renderOnlyProps: RenderOnlyPropReport[];
  diagnostics: Diagnostic[];
  root: ReactElementModel;
}
```

- [ ] **Step 1: Write failing static-prop lowering tests**

Build a recipe with all three opcodes. Assert exact sorted output:

```ts
expect(result.elementProps).toEqual([
  { name: "mode", value: { kind: "literal", value: "dropdown" } },
  { name: "onChange", value: { kind: "noop" } },
  { name: "options", value: { kind: "empty-array" } },
  { name: "value", value: { kind: "literal", value: "" } },
]);
expect(result.renderOnlyPropNames).toEqual([
  "mode",
  "onChange",
  "options",
  "value",
]);
```

Add precedence cases:

- resolution default replaces static literal;
- semantic state replaces resolution default;
- real `change` interaction replaces static noop with `external-prop`;
- replaced static names are removed from `renderOnlyPropNames`.

- [ ] **Step 2: Run prop tests and verify red**

Run:

```bash
pnpm exec vitest run packages/generator-react/src/build-props-model.test.ts
```

Expected: FAIL because static props are ignored.

- [ ] **Step 3: Implement deterministic prop lowering**

Initialize static props first:

```ts
for (const prop of recipe.staticProps) {
  setElementProp(elementProps, {
    name: prop.target,
    value:
      prop.value.kind === "literal"
        ? { kind: "literal", value: prop.value.value }
        : { kind: prop.value.kind },
  });
  renderOnlyNames.add(prop.target);
}
```

Whenever a higher-precedence source replaces a target, call:

```ts
renderOnlyNames.delete(target);
```

Sort both `elementProps` and `renderOnlyPropNames` before returning.

- [ ] **Step 4: Write failing empty-group model tests**

Construct an `actionGroup` with zero children and a Stack recipe using
`render-only-optional`. Assert:

```ts
expect(model.root).toMatchObject({
  kind: "reuse",
  componentId: "base.Stack",
  children: [],
});
expect(model.diagnostics).toContainEqual({
  severity: "warning",
  blocking: false,
  stage: "react-generation",
  code: "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
  message: "Render-only structural group has no semantic children",
  evidence: {
    manifestNodeId: "ui_action_group",
    semanticRole: "actionGroup",
  },
});
```

Assert `required` still throws `GENERATION_INPUT_INCOMPLETE`, `forbidden`
still rejects children, and a non-empty `render-only-optional` group has no
warning.

- [ ] **Step 5: Run model tests and verify red**

Run:

```bash
pnpm exec vitest run packages/generator-react/src/build-react-generation-model.test.ts
```

Expected: FAIL because the fourth child policy is not handled.

- [ ] **Step 6: Implement render-only metadata aggregation**

Change child-policy enforcement to return zero or one diagnostic instead of
only throwing:

```ts
function evaluateChildrenPolicy(
  node: UiNodeV2,
  recipe: ReactComponentRecipeV2,
): Diagnostic | undefined;
```

Collect render-only props by manifest node and component ID:

```ts
renderOnlyProps.push({
  manifestNodeId: node.id,
  componentId: rootBinding.componentId,
  propNames: props.renderOnlyPropNames,
});
```

Omit entries with no remaining render-only names. Sort by
`manifestNodeId`, then `componentId`.

- [ ] **Step 7: Run focused generator tests**

Run:

```bash
pnpm exec vitest run packages/generator-react/src/build-props-model.test.ts packages/generator-react/src/build-react-generation-model.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/generator-react
git commit -m "feat: lower render-only React recipes"
```

---

### Task 5: Build policy-controlled styles and fallbacks

**Files:**

- Create: `packages/generator-react/src/build-style-model.ts`
- Create: `packages/generator-react/src/build-style-model.test.ts`
- Create: `packages/generator-react/src/build-fallback-model.ts`
- Create: `packages/generator-react/src/build-fallback-model.test.ts`
- Modify: `packages/generator-react/src/generation-model.ts`
- Modify: `packages/generator-react/src/build-react-generation-model.ts`

**Interfaces:**

- Produces:

```ts
interface StyleDeclarationModel {
  property: LayoutStyleProperty | AppearanceStyleProperty;
  value: string;
}

interface StyleRuleModel {
  className: string;
  declarations: StyleDeclarationModel[];
}

interface StyleBuildResult {
  rules: StyleRuleModel[];
  diagnostics: Diagnostic[];
}

buildStyleModel(input: {
  node: UiNodeV2;
  designNode: DesignNodeV2;
  componentId?: string;
  recipe: ReactComponentRecipeV2;
  policy: ReactStylePolicy;
}): StyleBuildResult;
```

- [ ] **Step 1: Write failing flow-layout tests**

Assert exact ordered declarations:

```ts
expect(rule.declarations).toEqual([
  { property: "display", value: "flex" },
  { property: "flexDirection", value: "column" },
  { property: "gap", value: "10px" },
  { property: "padding", value: "20px 16px" },
]);
```

Cover horizontal flow, alignment, wrap, legal dimensions, and omission of
forbidden width.

- [ ] **Step 2: Write failing positioning and appearance tests**

Assert:

- no explicit position fact never becomes absolute;
- explicit flow remains normal flow;
- explicit absolute emits only normalized inset values;
- forbidden required layout throws `GENERATION_LAYOUT_UNSUPPORTED`;
- forbidden non-structural appearance emits
  `GENERATION_STYLE_OVERRIDE_FORBIDDEN`;
- no style model contains `!important`, descendant selectors, or arbitrary
  property names.

- [ ] **Step 3: Write failing fallback tests**

Assert a permitted fallback builds stable names:

```ts
expect(model.localComponentName).toBe("GeneratedWarning");
expect(model.className).toBe("ui_warning");
```

Assert a reuse/compose decision cannot enter the fallback builder and an
unapproved fallback throws `GENERATION_FALLBACK_FORBIDDEN`.

- [ ] **Step 4: Run tests and verify red**

Run:

```bash
pnpm exec vitest run packages/generator-react/src/build-style-model.test.ts packages/generator-react/src/build-fallback-model.test.ts
```

Expected: FAIL because both modules are absent.

- [ ] **Step 5: Implement fixed style lowering**

Use an explicit property order:

```ts
const propertyOrder = [
  "display",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "alignSelf",
  "gap",
  "padding",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "position",
  "inset",
  "background",
  "color",
  "border",
  "borderRadius",
  "boxShadow",
  "opacity",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
] as const;
```

Read only typed normalized DesignIR properties. Never iterate arbitrary input
keys into CSS names.

- [ ] **Step 6: Integrate styles and fallbacks into the generation model**

Add:

```ts
styles: StyleRuleModel[];
fallbacks: FallbackComponentModel[];
```

Merge and sort diagnostics from child-policy and style lowering. Deduplicate
rules by class name and reject differing duplicate declarations.

- [ ] **Step 7: Run focused and model tests**

Run:

```bash
pnpm exec vitest run packages/generator-react/src/build-style-model.test.ts packages/generator-react/src/build-fallback-model.test.ts packages/generator-react/src/build-react-generation-model.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/generator-react
git commit -m "feat: build policy controlled React styles"
```

---

### Task 6: Emit deterministic TSX and CSS Modules

**Files:**

- Create: `packages/generator-react/src/emit-tsx.ts`
- Create: `packages/generator-react/src/emit-tsx.test.ts`
- Create: `packages/generator-react/src/emit-css-module.ts`
- Create: `packages/generator-react/src/emit-css-module.test.ts`
- Create: `packages/generator-react/src/validate-generated-source.ts`
- Modify: `packages/generator-react/src/index.ts`

**Interfaces:**

- Produces:

```ts
emitTsx(model: ReactGenerationModel, componentName: string): string;
emitCssModule(styles: StyleRuleModel[]): string;
validateGeneratedTsx(
  source: string,
  expectation: {
    componentName: string;
    packages: string[];
    localNames: string[];
  },
): void;
```

- [ ] **Step 1: Write failing TSX golden tests**

Use a model containing:

- grouped named imports;
- one default import;
- a composition with slots;
- external callback props;
- Cyrillic and hostile JSX text;
- literal, empty-array, noop, and class-name props.

Assert exact expressions:

```tsx
options={[]}
onChange={() => undefined}
```

Assert the source does not contain:

```text
useState
useEffect
fetch(
axios
dangerouslySetInnerHTML
```

- [ ] **Step 2: Write failing CSS serialization tests**

Assert exact output:

```css
.ui_dialog_4-314 {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

Assert reordered input rules/declarations produce byte-identical output and
unsafe selectors or unknown properties are rejected before serialization.

- [ ] **Step 3: Run emitter tests and verify red**

Run:

```bash
pnpm exec vitest run packages/generator-react/src/emit-tsx.test.ts packages/generator-react/src/emit-css-module.test.ts
```

Expected: FAIL because emitters are absent.

- [ ] **Step 4: Implement TSX through TypeScript factory nodes**

Map opcodes without parsing strings:

```ts
case "empty-array":
  return factory.createJsxExpression(
    undefined,
    factory.createArrayLiteralExpression(),
  );
case "noop":
  return factory.createJsxExpression(
    undefined,
    factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      factory.createIdentifier("undefined"),
    ),
  );
```

Use `typescript.createPrinter` and end the file with exactly one newline.

- [ ] **Step 5: Implement CSS serialization**

Map camel-case typed properties to a fixed kebab-case table. Sort by class name
and the style-model property order. Reject a class name that does not match:

```text
^[A-Za-z_][A-Za-z0-9_-]*$
```

- [ ] **Step 6: Implement source validation**

Parse with:

```ts
ts.createSourceFile(
  `${componentName}.tsx`,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
```

Reject `parseDiagnostics`. Walk imports and JSX tag identifiers, comparing
them with the expected model sets. Throw `GENERATION_SOURCE_INVALID` on any
mismatch.

- [ ] **Step 7: Run emitter verification**

Run:

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

### Task 7: Generate v2 bundles and add `uig generate`

**Files:**

- Create: `packages/generator-react/src/generate-react-bundle.ts`
- Create: `packages/generator-react/src/generate-react-bundle.test.ts`
- Modify: `packages/generator-react/src/index.ts`
- Create: `apps/cli/src/resolve-design-system-pack.ts`
- Create: `apps/cli/src/generate-from-run.ts`
- Create: `apps/cli/src/write-generated-bundle.ts`
- Create: `apps/cli/src/generate-from-run.test.ts`
- Modify: `apps/cli/src/create-program.ts`
- Modify: `apps/cli/src/create-program.test.ts`
- Modify: `apps/cli/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces:

```ts
generateReactBundle(
  input: ReactGenerationInput,
): ReactGenerationBundleV2;

generateFromRun(input: {
  runId: string;
  workspaceDir: string;
  explicitPackPath?: string;
}): Promise<{
  outputPath: string;
  status: "generated" | "blocked";
  writeStatus: "written" | "identical";
}>;

writeGeneratedBundleAtomically(input: {
  destination: string;
  bundle: ReactGenerationBundleV2;
}): Promise<"written" | "identical">;
```

- [ ] **Step 1: Write failing pure bundle tests**

Assert a generated bundle contains:

```text
GeneratedModal.tsx
GeneratedModal.module.css
generation-report.json
```

Assert:

- report schema is `react-generation-report/v2`;
- bundle schema is `react-generation-bundle/v2`;
- `renderOnlyProps` is sorted;
- warning diagnostics include the empty action group;
- file SHA-256 and byte length match actual bytes;
- report excludes itself from `files`;
- `targetTypecheck` is `not-run`;
- two invocations are byte-identical.

For a blocked input, assert `bundle.files` is empty. The filesystem writer is
responsible for writing only `generation-report.json`.

- [ ] **Step 2: Run pure bundle test and verify red**

Run:

```bash
pnpm exec vitest run packages/generator-react/src/generate-react-bundle.test.ts
```

Expected: FAIL because bundle generation is absent.

- [ ] **Step 3: Implement pure bundle generation**

Use this order:

```text
validateGenerationInput
→ blocked report OR buildReactGenerationModel
→ emit TSX/CSS/fallbacks
→ validate TSX
→ hash files
→ build and integrity-check v2 report
→ return v2 bundle
```

For generated results, merge model diagnostics with non-blocking generation
diagnostics and sort by `stage`, `code`, then serialized evidence.

- [ ] **Step 4: Write failing run/filesystem tests**

Create temporary run artifacts with real v2 schemas. Assert:

- traversal in `runId` is rejected;
- artifact paths must remain in the chosen run;
- exact pack ID/version/hash is required;
- stale pre-Autocomplete runs fail `GENERATION_INPUT_INVALID`;
- first output is `written`;
- identical rerun is `identical` with unchanged bytes;
- conflict leaves existing destination untouched;
- no output appears outside `.uig/runs/<run-id>/generated`;
- no Pixso client is constructed by generate.

- [ ] **Step 5: Run CLI tests and verify red**

Run:

```bash
pnpm exec vitest run apps/cli/src/generate-from-run.test.ts apps/cli/src/create-program.test.ts
```

Expected: FAIL because the command and writer are absent.

- [ ] **Step 6: Implement shared pack resolution**

Move the existing ID/path logic from `create-program.ts` into:

```ts
export function resolveDesignSystemPackPath(value: string): string;
```

Reuse it from both `plan` and `generate`. Do not duplicate a Sber/MUI switch.

- [ ] **Step 7: Implement safe run loading**

Read and validate:

```text
run.json
<run.artifacts.designIr>
<run.artifacts.uiManifest>
<run.artifacts.resolutionPlan>
```

Resolve the pack from the plan target unless an explicit path is supplied.
Then call `generateReactBundle`. Do not read `snapshot.json` or construct a
Pixso client.

- [ ] **Step 8: Implement atomic output installation**

Build a sibling temporary directory, write files using exclusive creation, and
write `generation-report.json` with `stableStringify`. If destination exists,
compare the full relative-path/byte map:

```text
identical map → return "identical"
different map → throw GENERATION_OUTPUT_CONFLICT
```

Rename only when the destination is absent. Always clean the temporary
directory after an error.

- [ ] **Step 9: Wire the CLI command**

Add:

```text
uig generate --run <run-id> [--design-system-pack <path>]
```

Print one stable JSON line so Qwen can read the result:

```json
{
  "status": "generated",
  "runId": "run_...",
  "outputPath": ".uig/runs/run_.../generated",
  "writeStatus": "written"
}
```

Use exit `0` for generated/identical, `2` for blocked, and `1` for unexpected
errors. A blocked result must still print its structured JSON before setting
exit `2`.

- [ ] **Step 10: Run package and CLI verification**

Run:

```bash
pnpm exec vitest run packages/generator-react/src apps/cli/src/generate-from-run.test.ts apps/cli/src/create-program.test.ts
pnpm typecheck
pnpm uig -- generate --help
```

Expected: tests and typecheck pass; help exits `0` without Pixso or token.

- [ ] **Step 11: Commit**

```bash
git add packages/generator-react apps/cli pnpm-lock.yaml
git commit -m "feat: add React generation CLI"
```

---

### Task 8: Prove real `4:314`, document limits, and rerun through Qwen

**Files:**

- Create: `apps/cli/src/react-generation-acceptance.test.ts`
- Create: `scripts/generate-react-acceptance-candidates.ts`
- Create: `fixtures/react-generation/modal/source.design-ir.json`
- Create: `fixtures/react-generation/modal/source.ui-manifest.json`
- Create: `fixtures/react-generation/modal/sber-space-ui/resolution-plan.json`
- Create: `fixtures/react-generation/modal/sber-space-ui/generated/*`
- Create: `fixtures/react-generation/modal/material-ui/resolution-plan.json`
- Create: `fixtures/react-generation/modal/material-ui/generated/*`
- Create: `fixtures/react-generation/pixso-4-314/sber-space-ui/generated/*`
- Modify: `apps/cli/src/offline-acceptance.test.ts`
- Modify: `apps/cli/src/readme-commands.test.ts`
- Modify: `README.md`
- Modify: `docs/contracts.md`
- Modify: `docs/design-system-packs.md`
- Modify: `docs/diagnostics.md`
- Modify: `docs/fixture-policy.md`
- Modify: `scripts/verify-fixture-provenance.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces reviewed offline evidence for:
  - neutral modal generation through Sber and Material UI;
  - real `4:314` Sber render-only generation;
  - explicit warning for absent action children.
- Produces the tested operator flow:

```bash
pnpm uig -- plan --url "<pixso-url>" --design-system sber-space-ui
pnpm uig -- generate --run "<run-id>"
```

- [ ] **Step 1: Write the failing neutral dual-pack acceptance test**

Use one unchanged manifest:

```text
dialog
├── heading
├── content
├── textInput
└── actionGroup
    ├── secondaryAction
    └── primaryAction
```

Assert:

- imports come only from the selected pack;
- both callback interfaces are semantically equivalent;
- source contains no business-logic signatures;
- CSS contains no `!important` or internal selector;
- repeated generation is byte-identical.

- [ ] **Step 2: Write the failing real `4:314` offline test**

Replay only committed `fixtures/pixso/modal-4-314/source.json`. Assert:

```ts
expect(plan.summary.blocked).toBe(0);
expect(generated.report.renderOnlyProps).toEqual([
  {
    manifestNodeId: "ui_combobox_4-316",
    componentId: "base.Autocomplete",
    propNames: ["mode", "onChange", "options", "value"],
  },
]);
expect(generated.report.diagnostics).toContainEqual(
  expect.objectContaining({
    code: "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
    blocking: false,
    evidence: {
      manifestNodeId: "ui_actionGroup_4-317",
      semanticRole: "actionGroup",
    },
  }),
);
```

Assert TSX contains the verified Autocomplete import, `options={[]}`, and the
fixed noop; it must not contain invented buttons.

- [ ] **Step 3: Run acceptance tests and verify red**

Run:

```bash
pnpm exec vitest run apps/cli/src/react-generation-acceptance.test.ts
```

Expected: FAIL because reviewed goldens do not exist.

- [ ] **Step 4: Generate candidates outside fixtures**

The candidate script must default to a fresh OS temporary directory and refuse
any destination inside `fixtures/`. Print only:

```text
component name
import packages
external prop names
render-only prop names
diagnostic codes
CSS rule count
file hashes
candidate directory
```

Do not print raw DSL or access tokens.

- [ ] **Step 5: Review and accept candidate files**

Inspect every import, JSX component, slot, static prop, CSS rule, diagnostic,
and report validation field. Copy candidates into fixtures only after review.
Update fixture provenance hashes without reformatting raw Pixso sources.

- [ ] **Step 6: Document contracts and limitations**

Document exactly:

- recipe/report/bundle v1 versus v2;
- `literal`, `empty-array`, and `noop`;
- `render-only-optional`;
- `GENERATION_RENDER_ONLY_CHILDREN_MISSING`;
- `targetTypecheck: "not-run"`;
- generated directory contents;
- stale run/pack hash behavior;
- no state, API, form, or target-project integration;
- `uig generate` does not contact Pixso.

- [ ] **Step 7: Run full offline verification twice**

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

- both `pnpm verify` runs have zero failures;
- both packs validate;
- help lists `generate`;
- only intended Task 8 files are uncommitted.

- [ ] **Step 8: Commit offline acceptance evidence**

```bash
git add fixtures apps/cli/src README.md docs package.json scripts
git commit -m "test: prove render-only modal generation"
```

- [ ] **Step 9: Replan the live Pixso node**

Run in a login shell so the existing environment-backed token is available:

```bash
pnpm uig -- plan \
  --url "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314" \
  --design-system sber-space-ui
```

Expected:

- a new run ID;
- `status` is `completed` or `completed-with-warnings`;
- resolution has `blocked: 0`;
- the new pack SHA-256 matches the current loaded Sber pack.

Do not reuse `run_20260726T153814020Z_4-314`; its pack proof is stale by
design.

- [ ] **Step 10: Generate the live bundle directly**

Run:

```bash
pnpm uig -- generate --run "<new-run-id>"
```

Expected JSON status: `generated`. Inspect the local generated TSX, CSS, and
report. Confirm no raw DSL or token appears in generated output.

- [ ] **Step 11: Repeat the same workflow through Qwen**

Launch Qwen from a login shell and instruct it to invoke only the repository
commands:

```text
Run the repository-owned workflow for Pixso item 4:314:
1. pnpm uig -- plan --url "<url>" --design-system sber-space-ui
2. read the structured run result
3. pnpm uig -- generate --run "<run-id>"
4. report the generated path, status, component imports, render-only props,
   and diagnostic codes.
Do not fetch raw DSL yourself and do not synthesize React code.
```

Expected:

- Qwen reports `generated`;
- Qwen names `@sber-space-ui/autocomplete`;
- Qwen reports render-only props and the empty-action warning;
- Qwen does not claim business logic is implemented;
- output hashes match a direct invocation from the same run.

The `.uig` live run remains ignored and uncommitted.

- [ ] **Step 12: Record final evidence**

Run:

```bash
git log --oneline --decorate -20
pnpm verify
git status --short --branch
```

Expected: all plan commits exist, verification passes, and the feature
worktree is clean. Preserve the Qwen/live run path in the handoff message, not
in committed fixtures.

---

## Implementation Checkpoints

Pause for review after:

1. Tasks 1–2: versioned contracts and normalized effective recipes.
2. Tasks 3–4: verified Sber Autocomplete resolution and render-only lowering.
3. Tasks 5–7: styles, emitters, bundle, and CLI.
4. Task 8: offline acceptance, documentation, live Pixso, and Qwen evidence.

Do not continue past a failed checkpoint. Fix the focused slice, rerun its
tests, and present the exact failure or passing evidence before starting the
next batch.

## Final Definition of Done

- `ui_combobox_4-316` resolves to verified `base.Autocomplete`.
- The real `4:314` Sber plan contains no blocking resolution.
- Generated TSX uses only imports authorized by the current pack.
- Autocomplete render-only props are declared by the pack and disclosed in the
  v2 report.
- The empty action group is rendered only under
  `render-only-optional` and produces a warning.
- No action buttons, state, option data, callbacks, or business behavior are
  invented.
- Stale runs fail exact pack-proof validation.
- New TSX passes syntax validation.
- CSS follows the selected pack policy.
- Generated source and reports are byte-identical across repeated runs.
- `uig generate` never constructs a Pixso client.
- Both built-in packs validate.
- `pnpm verify` passes twice consecutively before the acceptance commit.
- A fresh live Pixso run generates both directly and through Qwen.
- No token, raw DSL, or ignored `.uig` artifact is committed.
- The worktree is clean and integration remains a separate user choice.
