# Pixso Instance Materialization and Action-Group Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover Pixso component-default content, preserve value-level provenance, and project the two proven footer actions from node `4:314` into deterministic Sber Space UI React output.

**Architecture:** Add a pure Pixso effective-instance materializer before the existing provider-neutral normalizer. Keep `design-ir/v2` unchanged, write provenance as a sibling run artifact, and introduce a versioned pack-declared compound projection that exposes only verified semantic actions through an otherwise opaque exact component boundary.

**Tech Stack:** TypeScript 5.9, Node.js 22+, TypeBox, Vitest, pnpm 10.33.0, existing `@uig/*` monorepo packages, esbuild Qwen bundle.

## Global Constraints

- The source design is Pixso document `WSLukjrKancvZG0zbaMnyA`, root node `4:314`.
- Do not add branches based on node IDs, Russian strings, modal names, or Sber component names in the normalizer or semantic planner.
- Recover `Отмена` from the Pixso component definition; never add it as recipe-default content.
- Preserve both component-default and instance-override provenance.
- Keep `design-ir/v2` and `ui-manifest/v2` unchanged.
- Introduce `normalization-provenance/v1` as a sibling artifact.
- Introduce `pixso-map/v2`; continue accepting `pixso-map/v1`.
- Exact mappings without projection remain opaque.
- Incomplete declared projection is blocking and must not produce invented semantic children.
- Packs may declare closed data only; no selectors, source code, JSX, or executable callbacks.
- Concrete imports and component props remain owned by verified design-system catalogs and React recipes.
- Business logic, real form state, and data loading remain out of scope.
- Raw Pixso DSL and full provenance never enter Qwen model context.
- The direct CLI and Qwen extension must execute the same repository-owned workflow.
- Every implementation task follows red-green-refactor and ends with a focused commit.
- Final verification is `pnpm verify`, followed by a rebuilt Qwen bundle and a real extension run.

---

## File map

### New files

- `packages/contracts/src/normalization-provenance.ts` — closed public
  `normalization-provenance/v1` schema and types.
- `packages/contracts/src/normalization-provenance.test.ts` — contract
  acceptance and closed-schema tests.
- `packages/design-normalizer/src/materialize-pixso-instance.ts` — pure Pixso
  component-default/instance-override merger and flattened-property tree
  reconstruction.
- `packages/design-normalizer/src/materialize-pixso-instance.test.ts` —
  focused inheritance, ordering, safety, and mutation tests.
- `packages/semantic-planner/src/project-compound-boundary.ts` — bounded
  semantic projection for exact compound mappings.
- `packages/semantic-planner/src/project-compound-boundary.test.ts` —
  action-candidate and incomplete-projection tests.

### Modified files

- `packages/contracts/src/index.ts` — export the provenance contract.
- `packages/contracts/src/ui-manifest.ts` — define common exact mapping fields,
  v2 projection data, and v1/v2 mapping types.
- `packages/contracts/src/design-system-pack.ts` — validate the union of
  `pixso-map/v1` and `pixso-map/v2`.
- `packages/contracts/src/contracts.test.ts` — verify v1 compatibility and v2
  projection rejection rules.
- `packages/design-normalizer/src/pixso-types.ts` — add stable materialization
  error codes.
- `packages/design-normalizer/src/normalize-node.ts` — translate raw value
  origins into normalized JSON-pointer origins.
- `packages/design-normalizer/src/normalize-design.ts` — invoke the
  materializer for v2 and expose a result containing `designIr` plus
  provenance.
- `packages/design-normalizer/src/index.ts` — export the new public
  normalization result.
- `packages/design-normalizer/src/normalize-design.test.ts` — prove v2
  compatibility and normalized provenance.
- `packages/component-catalog/src/load-pack.ts` — accept both map document
  versions and retain v2 projection data.
- `packages/component-catalog/src/hash-loaded-pack.ts` — type the hashed Pixso
  map as the v1/v2 union without changing hash semantics.
- `packages/component-catalog/src/load-pack.test.ts` — load v1 and v2 maps and
  reject malformed projection data.
- `packages/semantic-planner/src/exact-component-recognizer.ts` — return the
  selected exact mapping alongside recognition evidence.
- `packages/semantic-planner/src/exact-component-recognizer.test.ts` — verify
  selected mapping identity.
- `packages/semantic-planner/src/build-ui-manifest-v2.ts` — lower projected
  semantic actions into `UiNodeV2` children and append projection diagnostics.
- `packages/semantic-planner/src/build-ui-manifest-v2.test.ts` — preserve opaque
  behavior and verify projected action nodes and interactions.
- `apps/cli/src/run-layout.ts` — add the stable sibling filename
  `normalization-provenance.json`.
- `apps/cli/src/plan-from-snapshot.ts` — write the provenance document.
- `apps/cli/src/plan-v2-artifacts.test.ts` — validate the new artifact while
  retaining `generation-run/v1`.
- `apps/cli/src/plan-from-url.test.ts` — inspect the new file and continue
  checking path/secret isolation.
- `design-system-packs/sber-space-ui/pixso-map.json` — migrate the Sber map to
  v2 and declare action-group role order.
- `apps/cli/src/react-generation-acceptance.test.ts` — prove two Sber buttons
  replace the empty render-only footer.
- `dist/qwen-adapter.mjs` — regenerated portable extension bundle.

---

### Task 1: Add the normalization-provenance public contract

**Files:**

- Create: `packages/contracts/src/normalization-provenance.ts`
- Create: `packages/contracts/src/normalization-provenance.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Consumes: `closedObject` and TypeBox patterns from `@uig/contracts`.
- Produces:

```ts
export type NormalizationOriginKind =
  | "instance-value"
  | "instance-override"
  | "component-default";

export interface NormalizationValueOrigin {
  targetNodeId: string;
  targetPath: string;
  kind: NormalizationOriginKind;
  sourceNodeId: string;
  componentKey?: string;
  componentDefinitionNodeId?: string;
  sourcePropertyPath?: string;
}

export interface NormalizationProvenanceV1 {
  schema: "normalization-provenance/v1";
  sourceArtifactId: string;
  values: NormalizationValueOrigin[];
}
```

- Later tasks import `NormalizationProvenanceV1` and
  `NormalizationProvenanceV1Schema`.

- [ ] **Step 1: Write the failing contract tests**

Create `packages/contracts/src/normalization-provenance.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  NormalizationProvenanceV1Schema,
  validateWithSchema,
} from "./index.js";

const valid = {
  schema: "normalization-provenance/v1",
  sourceArtifactId: "pixso_doc_4_314_hash",
  values: [
    {
      targetNodeId: "4:557/4:460/4:557",
      targetPath: "/text/value",
      kind: "component-default",
      sourceNodeId: "4:557",
      componentKey: "af0f129be938c583514d48eb0a0544bcc6015135",
      componentDefinitionNodeId: "4:445",
      sourcePropertyPath: "4:460/4:557",
    },
    {
      targetNodeId: "4:599/4:461/4:599",
      targetPath: "/text/value",
      kind: "instance-override",
      sourceNodeId: "4:599",
      sourcePropertyPath: "4:461/4:599",
    },
  ],
};

describe("NormalizationProvenanceV1Schema", () => {
  it("accepts deterministic value-level origins", () => {
    expect(validateWithSchema(NormalizationProvenanceV1Schema, valid)).toEqual(
      valid,
    );
  });

  it("rejects unknown fields and unsupported origin kinds", () => {
    expect(() =>
      validateWithSchema(NormalizationProvenanceV1Schema, {
        ...valid,
        rawDsl: {},
      }),
    ).toThrow(/rawDsl/);
    expect(() =>
      validateWithSchema(NormalizationProvenanceV1Schema, {
        ...valid,
        values: [{ ...valid.values[0], kind: "guessed" }],
      }),
    ).toThrow(/kind/);
  });
});
```

- [ ] **Step 2: Run the test and confirm the contract is missing**

Run:

```bash
pnpm exec vitest run packages/contracts/src/normalization-provenance.test.ts
```

Expected: FAIL because `NormalizationProvenanceV1Schema` is not exported.

- [ ] **Step 3: Implement the closed schema**

Create `packages/contracts/src/normalization-provenance.ts`:

```ts
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

export const NormalizationOriginKindSchema = Type.Union([
  Type.Literal("instance-value"),
  Type.Literal("instance-override"),
  Type.Literal("component-default"),
]);

export const NormalizationValueOriginSchema = closedObject({
  targetNodeId: Type.String({ minLength: 1 }),
  targetPath: Type.String({ pattern: "^/" }),
  kind: NormalizationOriginKindSchema,
  sourceNodeId: Type.String({ minLength: 1 }),
  componentKey: Type.Optional(Type.String({ minLength: 1 })),
  componentDefinitionNodeId: Type.Optional(Type.String({ minLength: 1 })),
  sourcePropertyPath: Type.Optional(Type.String({ minLength: 1 })),
});

export const NormalizationProvenanceV1Schema = closedObject({
  schema: Type.Literal("normalization-provenance/v1"),
  sourceArtifactId: Type.String({ minLength: 1 }),
  values: Type.Array(NormalizationValueOriginSchema),
});

export type NormalizationOriginKind = Static<
  typeof NormalizationOriginKindSchema
>;
export type NormalizationValueOrigin = Static<
  typeof NormalizationValueOriginSchema
>;
export type NormalizationProvenanceV1 = Static<
  typeof NormalizationProvenanceV1Schema
>;
```

Export it from `packages/contracts/src/index.ts`:

```ts
export * from "./normalization-provenance.js";
```

- [ ] **Step 4: Run focused contracts tests**

Run:

```bash
pnpm exec vitest run \
  packages/contracts/src/normalization-provenance.test.ts \
  packages/contracts/src/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  packages/contracts/src/index.ts \
  packages/contracts/src/normalization-provenance.ts \
  packages/contracts/src/normalization-provenance.test.ts
git commit -m "feat: add normalization provenance contract"
```

---

### Task 2: Materialize component defaults and instance overrides

**Files:**

- Create: `packages/design-normalizer/src/materialize-pixso-instance.ts`
- Create: `packages/design-normalizer/src/materialize-pixso-instance.test.ts`
- Modify: `packages/design-normalizer/src/pixso-types.ts`

**Interfaces:**

- Consumes:

```ts
interface MaterializePixsoRootInput {
  root: PixsoRecord;
  componentDefinitions: unknown[];
}
```

- Produces:

```ts
export interface RawMaterializationOrigin {
  kind: "instance-value" | "instance-override" | "component-default";
  sourceNodeId: string;
  componentKey?: string;
  componentDefinitionNodeId?: string;
  sourcePropertyPath?: string;
}

export interface PixsoMaterializationResult {
  root: PixsoRecord;
  origins: WeakMap<
    object,
    ReadonlyMap<string, RawMaterializationOrigin>
  >;
}

export function materializePixsoRoot(
  input: MaterializePixsoRootInput,
): PixsoMaterializationResult;
```

- Origin-map keys are cloned effective raw records. Inner keys are raw field
  names such as `nodeText`.
- The function never mutates `root` or component definitions.

- [ ] **Step 1: Write failing default/override tests**

Create a minimal component definition and instance in
`materialize-pixso-instance.test.ts`:

```ts
const definition = {
  guid: "definition",
  componentKey: "ActionGroup",
  type: "SYMBOL",
  childNode: [
    {
      guid: "secondary",
      type: "INSTANCE",
      props: [
        {
          componentId: "secondary-label",
          pathString: "secondary-label",
          type: "TEXT",
          nodeText: "Cancel default",
          visible: true,
          left: 16,
          top: 12,
          width: 80,
          height: 16,
        },
      ],
    },
    {
      guid: "primary",
      type: "INSTANCE",
      props: [
        {
          componentId: "primary-label",
          pathString: "primary-label",
          type: "TEXT",
          nodeText: "Save default",
          visible: true,
          left: 16,
          top: 12,
          width: 80,
          height: 16,
        },
      ],
    },
  ],
};

const instance = {
  guid: "actions",
  componentKey: "ActionGroup",
  type: "INSTANCE",
  props: [
    {
      componentId: "secondary-label",
      pathString: "secondary/secondary-label",
      type: "TEXT",
      visible: true,
      left: 16,
      top: 12,
      width: 80,
      height: 16,
    },
    {
      componentId: "primary-label",
      pathString: "primary/primary-label",
      type: "TEXT",
      nodeText: "Confirm override",
      visible: true,
      left: 16,
      top: 12,
      width: 120,
      height: 16,
    },
  ],
};
```

Assert:

```ts
const source = structuredClone({ definition, instance });
const result = materializePixsoRoot({
  root: instance,
  componentDefinitions: [definition],
});
const records = flattenEffectiveRecords(result.root);
const secondary = records.get("secondary/secondary-label")!;
const primary = records.get("primary/primary-label")!;

expect(secondary.nodeText).toBe("Cancel default");
expect(primary.nodeText).toBe("Confirm override");
expect(result.origins.get(secondary)?.get("nodeText")).toMatchObject({
  kind: "component-default",
  sourceNodeId: "secondary-label",
  componentDefinitionNodeId: "definition",
});
expect(result.origins.get(primary)?.get("nodeText")).toMatchObject({
  kind: "instance-override",
  sourceNodeId: "primary-label",
});
expect({ definition, instance }).toEqual(source);
```

Add a parameterized merge case proving that `false`, `0`, `""`, `[]`, and
`null` are explicit overrides rather than missing values.

- [ ] **Step 2: Run the test and confirm the materializer is missing**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src/materialize-pixso-instance.test.ts
```

Expected: FAIL because `materializePixsoRoot` does not exist.

- [ ] **Step 3: Implement definition indexing and field merge**

In `materialize-pixso-instance.ts`, implement these focused helpers:

```ts
function buildDefinitionsByKey(
  values: unknown[],
): ReadonlyMap<string, PixsoRecord>;

function collectDefinitionDefaults(
  definition: PixsoRecord,
): ReadonlyMap<string, DefinitionDefault>;

function mergeEffectiveRecord(
  instance: PixsoRecord,
  fallback: DefinitionDefault | undefined,
  origins: WeakMap<object, Map<string, RawMaterializationOrigin>>,
): PixsoRecord;
```

Use own-property presence, never truthiness:

```ts
const hasInstanceValue = Object.prototype.hasOwnProperty.call(
  instance,
  field,
);
const value = hasInstanceValue ? instance[field] : fallback?.record[field];
```

Implement recursive plain-object merge and atomic array replacement:

```ts
function mergeValue(fallback: unknown, override: unknown): unknown {
  if (isPlainRecord(fallback) && isPlainRecord(override)) {
    return Object.fromEntries(
      [...new Set([...Object.keys(fallback), ...Object.keys(override)])]
        .sort()
        .map((key) => [
          key,
          Object.prototype.hasOwnProperty.call(override, key)
            ? mergeValue(fallback[key], override[key])
            : structuredClone(fallback[key]),
        ]),
    );
  }
  return structuredClone(override);
}
```

Exclude `childNode`, `props`, `guid`, and definition-root identity from
ordinary fallback copying. Preserve instance identity and placement fields.
Only an array-valued `props` field is a flattened visual-property list; an
object-valued `props` field remains ordinary component property data.

Classify each emitted origin deterministically:

```text
field exists only on the instance record       → instance-value
field exists on instance and matching default  → instance-override
field exists only on the matching default      → component-default
```

- [ ] **Step 4: Add stable materialization error codes**

Extend `DesignNormalizationErrorCode` in `pixso-types.ts` with:

```ts
| "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS"
| "PIXSO_COMPONENT_INHERITANCE_CYCLE"
| "PIXSO_PROPERTY_IDENTITY_CONFLICT"
| "PIXSO_PROPERTY_PATH_INVALID"
```

Throw `DesignNormalizationError` with the specific code at the point each
condition is detected; do not collapse these failures into
`DESIGN_DSL_UNSUPPORTED`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec vitest run \
  packages/design-normalizer/src/materialize-pixso-instance.test.ts \
  packages/design-normalizer/src/normalize-design.test.ts
```

Expected: PASS, including existing normalizer tests.

- [ ] **Step 6: Commit**

```bash
git add \
  packages/design-normalizer/src/materialize-pixso-instance.ts \
  packages/design-normalizer/src/materialize-pixso-instance.test.ts \
  packages/design-normalizer/src/pixso-types.ts
git commit -m "feat: materialize Pixso instance values"
```

---

### Task 3: Reconstruct flattened property hierarchy and harden materialization

**Files:**

- Modify: `packages/design-normalizer/src/materialize-pixso-instance.ts`
- Modify: `packages/design-normalizer/src/materialize-pixso-instance.test.ts`

**Interfaces:**

- Consumes and preserves `materializePixsoRoot` from Task 2.
- Produces an effective `root` whose `props` entries have been converted into
  nested `childNode` trees ordered deterministically.
- Does not change the origin registry interface.

- [ ] **Step 1: Write failing hierarchy and order tests**

Build an instance with shuffled flat properties:

```ts
const instance = {
  guid: "actions",
  componentKey: "ActionGroup",
  type: "INSTANCE",
  props: [
    visual("secondary/label", "secondary-label", 16, 12, 80, 16),
    visual("primary", "primary-symbol", 329, 0, 231, 40),
    visual("secondary", "secondary-symbol", 207, 0, 114, 40),
    visual("primary/label", "primary-label", 48, 12, 167, 16),
  ],
};
```

Assert:

```ts
const { root } = materializePixsoRoot({
  root: instance,
  componentDefinitions: [],
});

expect(root.props).toBeUndefined();
expect(
  (root.childNode as PixsoRecord[]).map((node) => node.pathString),
).toEqual(["secondary", "primary"]);
expect(
  ((root.childNode as PixsoRecord[])[0]!.childNode as PixsoRecord[]).map(
    (node) => node.pathString,
  ),
).toEqual(["secondary/label"]);
```

Run the same assertion for all permutations of the four source properties and
compare `stableStringify(root)`.

- [ ] **Step 2: Run the hierarchy test and confirm it fails**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src/materialize-pixso-instance.test.ts
```

Expected: FAIL because properties are still flat.

- [ ] **Step 3: Implement canonical paths and property forest**

Add:

```ts
function canonicalPropertyPath(value: unknown): {
  path: string;
  segments: string[];
};

function buildPropertyForest(
  properties: PixsoRecord[],
): PixsoRecord[];

function compareVisualThenPath(
  left: PixsoRecord,
  right: PixsoRecord,
): number;
```

Canonicalization rules:

```ts
const segments = pathString.split("/");
if (
  segments.length === 0 ||
  segments.some((segment) => segment === "" || segment === "." || segment === "..")
) {
  throw new DesignNormalizationError(
    "PIXSO_PROPERTY_PATH_INVALID",
    `Pixso property path is invalid: ${JSON.stringify(pathString)}`,
  );
}
```

Parent selection is the longest existing proper prefix. Sort siblings by
finite `top`, finite `left`, then canonical path. Records without a property
parent attach to the owning instance.

- [ ] **Step 4: Write failing safety tests**

Add explicit cases for:

```text
duplicate canonical path with incompatible componentId
duplicate canonical path with incompatible type
component-key definition ambiguity
definition A → nested definition B → nested definition A cycle
empty path segment
`.` segment
`..` segment
```

Each assertion must match its exact `DesignNormalizationError.code`.

- [ ] **Step 5: Implement bounded recursive definition traversal**

Use an active component-key stack:

```ts
function materializeInstance(
  instance: PixsoRecord,
  context: MaterializationContext,
  activeKeys: readonly string[],
): PixsoRecord {
  const key =
    typeof instance.componentKey === "string" ? instance.componentKey : undefined;
  if (key && activeKeys.includes(key)) {
    throw new DesignNormalizationError(
      "PIXSO_COMPONENT_INHERITANCE_CYCLE",
      `Pixso component inheritance cycle: ${[...activeKeys, key].join(" -> ")}`,
    );
  }
  // Resolve defaults, merge properties, build the property forest, and recurse.
}
```

Reuse the parsed DSL only; do not perform I/O or evaluate raw values.

- [ ] **Step 6: Run design-normalizer tests**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  packages/design-normalizer/src/materialize-pixso-instance.ts \
  packages/design-normalizer/src/materialize-pixso-instance.test.ts
git commit -m "feat: rebuild Pixso property hierarchy"
```

---

### Task 4: Integrate materialization into DesignIR v2 and write provenance

**Files:**

- Modify: `packages/design-normalizer/src/normalize-node.ts`
- Modify: `packages/design-normalizer/src/normalize-design.ts`
- Modify: `packages/design-normalizer/src/index.ts`
- Modify: `packages/design-normalizer/src/normalize-design.test.ts`
- Modify: `apps/cli/src/run-layout.ts`
- Modify: `apps/cli/src/plan-from-snapshot.ts`
- Modify: `apps/cli/src/plan-v2-artifacts.test.ts`
- Modify: `apps/cli/src/plan-from-url.test.ts`

**Interfaces:**

- Produces:

```ts
export interface NormalizePixsoDesignV2Result {
  designIr: DesignIRV2;
  provenance: NormalizationProvenanceV1;
}

export function normalizePixsoDesignV2WithProvenance(input: {
  artifactId: string;
  rootNodeId?: string;
  rawDsl: unknown;
}): NormalizePixsoDesignV2Result;
```

- Preserves:

```ts
export function normalizePixsoDesignV2(input): DesignIRV2;
```

as a compatibility wrapper returning `.designIr`.

- `RunLayout.files.normalizationProvenance` is always
  `"normalization-provenance.json"`.
- `generation-run/v1` remains unchanged and does not index the new sibling
  artifact.

- [ ] **Step 1: Write failing normalized-provenance tests**

Add a minimal definition-backed DSL case to `normalize-design.test.ts` and
assert:

```ts
const result = normalizePixsoDesignV2WithProvenance({
  artifactId,
  rootNodeId: "actions",
  rawDsl,
});

const secondary = Object.values(result.designIr.nodes).find(
  (node) => node.text?.value === "Cancel default",
)!;
const primary = Object.values(result.designIr.nodes).find(
  (node) => node.text?.value === "Confirm override",
)!;

expect(result.provenance.values).toContainEqual(
  expect.objectContaining({
    targetNodeId: secondary.id,
    targetPath: "/text/value",
    kind: "component-default",
    sourceNodeId: "secondary-label",
  }),
);
expect(result.provenance.values).toContainEqual(
  expect.objectContaining({
    targetNodeId: primary.id,
    targetPath: "/text/value",
    kind: "instance-override",
    sourceNodeId: "primary-label",
  }),
);
expect(normalizePixsoDesignV2(input)).toEqual(result.designIr);
```

- [ ] **Step 2: Run the test and confirm the result API is missing**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src/normalize-design.test.ts
```

Expected: FAIL because
`normalizePixsoDesignV2WithProvenance` is not exported.

- [ ] **Step 3: Record normalized value origins**

Extend `NormalizeNodeContext`:

```ts
interface NormalizeNodeContext {
  artifactId: string;
  diagnostics: Diagnostic[];
  nodeId?: string;
  rawOrigins?: ReadonlyMap<string, RawMaterializationOrigin>;
  provenance?: NormalizationValueOrigin[];
}
```

After constructing the normalized node, walk this closed raw-field mapping:

```ts
const normalizedTargetsByRawField = {
  visible: ["/visible"],
  left: ["/geometry/x", "/position/inset/left"],
  top: ["/geometry/y", "/position/inset/top"],
  width: ["/geometry/width"],
  height: ["/geometry/height"],
  nodeText: ["/text/value"],
  fontSize: ["/text/fontSize"],
  cornerRadius: [
    "/appearance/radii/topLeft",
    "/appearance/radii/topRight",
    "/appearance/radii/bottomRight",
    "/appearance/radii/bottomLeft",
  ],
  fills: ["/appearance/fills"],
  fillPaints: ["/appearance/fills"],
  strokes: ["/appearance/borders"],
  strokePaints: ["/appearance/borders"],
  strokeWeight: ["/appearance/borders"],
  effects: ["/appearance/shadows"],
  opacity: ["/appearance/opacity"],
  autoLayout: ["/layout"],
  autoLayoutAbsolutePos: ["/position/mode"],
  componentKey: ["/component/key"],
  componentNormName: ["/component/variant"],
  props: ["/component/properties"],
} as const;
```

For each raw field present in `context.rawOrigins`, append an origin only when
the target JSON pointer exists on the normalized node:

```ts
for (const [rawField, targets] of Object.entries(
  normalizedTargetsByRawField,
)) {
  const origin = context.rawOrigins?.get(rawField);
  if (!origin) continue;
  for (const targetPath of targets) {
    if (hasJsonPointer(normalized, targetPath)) {
      context.provenance?.push({
        targetNodeId: normalized.id,
        targetPath,
        ...origin,
      });
    }
  }
}
```

This records every inherited or overridden raw value that survives into the
current `DesignIR` vocabulary without changing paint, effect, layout, or
position normalizer signatures. Sort final provenance values by
`targetNodeId`, `targetPath`, `kind`, and `sourceNodeId`.

- [ ] **Step 4: Integrate the effective tree for v2**

In `normalizePixsoDesignV2WithProvenance`:

```ts
const envelope = readPixsoEnvelope(input.rawDsl);
const selected = selectRoot(envelope.dsl.pixTreeDslNodes, input.rootNodeId);
const materialized = materializePixsoRoot({
  root: assertPixsoRecord(selected),
  componentDefinitions: envelope.dsl.pixComponentTreeDslNodes,
});
const designIr = normalizeSelectedRootV2({
  artifactId: input.artifactId,
  dslVersion: envelope.dsl.dslVersion,
  root: materialized.root,
  origins: materialized.origins,
});
return {
  designIr,
  provenance: validateWithSchema(NormalizationProvenanceV1Schema, {
    schema: "normalization-provenance/v1",
    sourceArtifactId: input.artifactId,
    values: sortedOrigins,
  }),
};
```

Do not materialize the historical `normalizePixsoDesign` v1 path. Preserve its
golden fixture behavior.

- [ ] **Step 5: Write the failing run-artifact test**

In `plan-v2-artifacts.test.ts`, read:

```ts
const normalizationProvenance = await readJson(
  join(runDir, "normalization-provenance.json"),
);
expect(
  validateWithSchema(
    NormalizationProvenanceV1Schema,
    normalizationProvenance,
  ).sourceArtifactId,
).toBe(stored.artifactId);
expect(runIndex.schema).toBe("generation-run/v1");
expect(runIndex.artifacts.normalizationProvenance).toBeUndefined();
```

In `plan-from-url.test.ts`, include
`normalizationProvenance: "normalization-provenance.json"` in the local files
read for leak checks, but keep `run.artifacts` unchanged.

- [ ] **Step 6: Write the sibling artifact**

Add to `RunLayout.files`:

```ts
normalizationProvenance: string;
```

and initialize it as:

```ts
normalizationProvenance: "normalization-provenance.json",
```

Change `planFromSnapshot` to call
`normalizePixsoDesignV2WithProvenance`, use `normalized.designIr` downstream,
and include:

```ts
[layout.files.normalizationProvenance]: normalized.provenance,
```

in `writeRunArtifacts`.

- [ ] **Step 7: Run normalizer and CLI artifact tests**

Run:

```bash
pnpm exec vitest run \
  packages/design-normalizer/src \
  apps/cli/src/plan-v2-artifacts.test.ts \
  apps/cli/src/plan-from-url.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add \
  packages/design-normalizer/src/index.ts \
  packages/design-normalizer/src/normalize-design.ts \
  packages/design-normalizer/src/normalize-design.test.ts \
  packages/design-normalizer/src/normalize-node.ts \
  apps/cli/src/run-layout.ts \
  apps/cli/src/plan-from-snapshot.ts \
  apps/cli/src/plan-v2-artifacts.test.ts \
  apps/cli/src/plan-from-url.test.ts
git commit -m "feat: persist Pixso normalization provenance"
```

---

### Task 5: Add the versioned exact compound-projection pack contract

**Files:**

- Modify: `packages/contracts/src/ui-manifest.ts`
- Modify: `packages/contracts/src/design-system-pack.ts`
- Modify: `packages/contracts/src/contracts.test.ts`
- Modify: `packages/component-catalog/src/load-pack.ts`
- Modify: `packages/component-catalog/src/hash-loaded-pack.ts`
- Modify: `packages/component-catalog/src/load-pack.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ActionGroupProjection {
  kind: "action-group";
  candidate: "button-shape-with-visible-label";
  order: "visual";
  roles: string[];
}

export type PixsoSemanticMapping =
  | PixsoSemanticMappingV1
  | PixsoSemanticMappingV2;

export type PixsoMap = PixsoMapV1 | PixsoMapV2;
```

- `PixsoMapV1Schema` accepts only old fields.
- `PixsoMapV2Schema` accepts optional `projection` on mappings and requires at
  least one non-empty role when projection is present.
- Loaded packs retain the selected v2 mapping object unchanged.

- [ ] **Step 1: Write failing v1/v2 contract tests**

Add to `contracts.test.ts`:

```ts
const v1Map = {
  schema: "pixso-map/v1",
  mappings: [
    {
      componentKey: "ActionGroup",
      kind: "group",
      role: "actionGroup",
    },
  ],
};

const v2Map = {
  schema: "pixso-map/v2",
  mappings: [
    {
      componentKey: "ActionGroup",
      kind: "group",
      role: "actionGroup",
      projection: {
        kind: "action-group",
        candidate: "button-shape-with-visible-label",
        order: "visual",
        roles: ["secondaryAction", "primaryAction"],
      },
    },
  ],
};

expect(validateWithSchema(PixsoMapSchema, v1Map)).toEqual(v1Map);
expect(validateWithSchema(PixsoMapSchema, v2Map)).toEqual(v2Map);
expect(() =>
  validateWithSchema(PixsoMapSchema, {
    ...v1Map,
    mappings: [{ ...v1Map.mappings[0], projection: v2Map.mappings[0].projection }],
  }),
).toThrow(/projection/);
expect(() =>
  validateWithSchema(PixsoMapSchema, {
    ...v2Map,
    mappings: [
      {
        ...v2Map.mappings[0],
        projection: { ...v2Map.mappings[0].projection, roles: [] },
      },
    ],
  }),
).toThrow(/roles/);
```

- [ ] **Step 2: Run contracts tests and confirm v2 is unsupported**

Run:

```bash
pnpm exec vitest run packages/contracts/src/contracts.test.ts
```

Expected: FAIL for `pixso-map/v2`.

- [ ] **Step 3: Implement mapping schemas**

Split the current mapping fields into reusable schema literals and define:

```ts
export const ActionGroupProjectionSchema = closedObject({
  kind: Type.Literal("action-group"),
  candidate: Type.Literal("button-shape-with-visible-label"),
  order: Type.Literal("visual"),
  roles: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export const PixsoSemanticMappingV1Schema = closedObject(commonMappingFields);
export const PixsoSemanticMappingV2Schema = closedObject({
  ...commonMappingFields,
  projection: Type.Optional(ActionGroupProjectionSchema),
});
```

Define `PixsoMapV1Schema`, `PixsoMapV2Schema`, and:

```ts
export const PixsoMapSchema = Type.Union([
  PixsoMapV1Schema,
  PixsoMapV2Schema,
]);
```

Keep the existing exported names as union types so downstream code has one
read interface.

- [ ] **Step 4: Write failing loader tests**

In `load-pack.test.ts`, copy the Sber pack to a temporary directory, replace
its map with the v2 document above, and assert:

```ts
const loaded = await loadDesignSystemPackV2(pack);
expect(
  loaded.exactPixsoMappings.find(
    (mapping) => mapping.componentKey === "ActionGroup",
  ),
).toMatchObject({
  projection: {
    kind: "action-group",
    roles: ["secondaryAction", "primaryAction"],
  },
});
```

Add a malformed v2 projection case and expect
`DESIGN_SYSTEM_PACK_INVALID`.

Also reject projection data when:

```text
mapping.kind is not "group"
mapping.role is not "actionGroup"
projection.roles contains a duplicate role
```

- [ ] **Step 5: Update loader and pack hashing types**

Validate common Pixso map documents against the union `PixsoMapSchema`. Keep
the full validated document in `LoadedDesignSystemPackDocuments.pixsoMap` so
its schema version and projection data continue contributing to `pack.sha256`.
Do not normalize v2 back to v1.

After schema validation, perform the closed semantic checks:

```ts
for (const mapping of pixsoMap.mappings) {
  if (!("projection" in mapping) || mapping.projection === undefined) {
    continue;
  }
  if (mapping.kind !== "group" || mapping.role !== "actionGroup") {
    invalidPack("Action-group projection requires group/actionGroup mapping");
  }
  if (
    new Set(mapping.projection.roles).size !==
    mapping.projection.roles.length
  ) {
    invalidPack("Action-group projection roles must be unique");
  }
}
```

- [ ] **Step 6: Run contracts and catalog tests**

Run:

```bash
pnpm exec vitest run \
  packages/contracts/src/contracts.test.ts \
  packages/component-catalog/src/load-pack.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  packages/contracts/src/ui-manifest.ts \
  packages/contracts/src/design-system-pack.ts \
  packages/contracts/src/contracts.test.ts \
  packages/component-catalog/src/load-pack.ts \
  packages/component-catalog/src/hash-loaded-pack.ts \
  packages/component-catalog/src/load-pack.test.ts
git commit -m "feat: add Pixso compound projection contract"
```

---

### Task 6: Project proven actions through an exact action-group boundary

**Files:**

- Create: `packages/semantic-planner/src/project-compound-boundary.ts`
- Create: `packages/semantic-planner/src/project-compound-boundary.test.ts`
- Modify: `packages/semantic-planner/src/exact-component-recognizer.ts`
- Modify: `packages/semantic-planner/src/exact-component-recognizer.test.ts`
- Modify: `packages/semantic-planner/src/build-ui-manifest-v2.ts`
- Modify: `packages/semantic-planner/src/build-ui-manifest-v2.test.ts`

**Interfaces:**

- Exact matching produces:

```ts
export interface ExactComponentMatch {
  mapping: PixsoSemanticMapping;
  recognition: SemanticRecognition;
}

export interface ExactComponentRecognizer {
  match(node: DesignNode): ExactComponentMatch | undefined;
}
```

- Compound projection produces provider-neutral facts:

```ts
export interface ProjectedSemanticChild {
  kind: "action";
  role: string;
  boundaryNodeId: string;
  labelNodeId: string;
  label: string;
}

export interface CompoundProjectionResult {
  children: ProjectedSemanticChild[];
  diagnostics: Diagnostic[];
}

export function projectCompoundBoundary(input: {
  boundary: DesignNodeV2;
  mapping: PixsoSemanticMapping;
  ir: DesignIRV2;
}): CompoundProjectionResult;
```

- Mappings without projection return empty children and diagnostics.

- [ ] **Step 1: Write failing candidate-projection tests**

Build a provider-neutral DesignIR:

```text
actions (560x81)
└── row (560x40)
    ├── secondary (114x40 at x=207)
    │   ├── icon
    │   └── secondary-label "Cancel"
    └── primary (231x40 at x=329)
        ├── icon
        └── primary-label "Confirm and finish"
```

Call `projectCompoundBoundary` with:

```ts
const mapping = {
  componentKey: "ActionGroup",
  kind: "group",
  role: "actionGroup",
  projection: {
    kind: "action-group",
    candidate: "button-shape-with-visible-label",
    order: "visual",
    roles: ["secondaryAction", "primaryAction"],
  },
} as const;
```

Assert:

```ts
expect(result.diagnostics).toEqual([]);
expect(result.children).toEqual([
  {
    kind: "action",
    role: "secondaryAction",
    boundaryNodeId: "secondary",
    labelNodeId: "secondary-label",
    label: "Cancel",
  },
  {
    kind: "action",
    role: "primaryAction",
    boundaryNodeId: "primary",
    labelNodeId: "primary-label",
    label: "Confirm and finish",
  },
]);
```

Include decorative text nested under an icon instance and verify only one
direct visible text child of the candidate boundary is used as its label.

- [ ] **Step 2: Run the projector test and confirm it is missing**

Run:

```bash
pnpm exec vitest run packages/semantic-planner/src/project-compound-boundary.test.ts
```

Expected: FAIL because the projector does not exist.

- [ ] **Step 3: Implement bounded candidate discovery**

Use:

```ts
function buttonCandidate(
  node: DesignNodeV2,
  ir: DesignIRV2,
): ProjectedCandidate | undefined {
  const directLabels = node.children
    .map((id) => ir.nodes[id])
    .filter(
      (child): child is DesignNodeV2 =>
        Boolean(child?.visible && child.text?.value.trim()),
    );
  const buttonLike =
    node.visible &&
    node.geometry.height > 0 &&
    node.geometry.width >= node.geometry.height * 1.5;
  return buttonLike && directLabels.length === 1
    ? {
        boundaryNodeId: node.id,
        labelNodeId: directLabels[0]!.id,
        label: directLabels[0]!.text!.value,
      }
    : undefined;
}
```

Traverse descendants depth-first. When a node is accepted as a candidate, do
not descend into it. Sort accepted candidates by `geometry.y`, then
`geometry.x`, then normalized node ID.

Before positional role assignment, compare accepted candidate rectangles.
When two accepted rectangles overlap, reject both candidates and include both
node IDs in rejected-candidate evidence.

- [ ] **Step 4: Write failing incomplete-projection tests**

Cover:

```text
one candidate for two declared roles
three candidates for two declared roles
one button boundary with two direct visible labels
two accepted boundaries with overlapping geometry
hidden button
mapping with no projection
```

For incomplete projection, assert:

```ts
expect(result.diagnostics).toContainEqual(
  expect.objectContaining({
    severity: "error",
    blocking: true,
    stage: "semantic-planning",
    code: "SEMANTIC_COMPOUND_PROJECTION_INCOMPLETE",
    source: {
      artifactId: design.sourceArtifactId,
      nodeId: "actions",
    },
    evidence: expect.objectContaining({
      expectedRoles: ["secondaryAction", "primaryAction"],
      acceptedCandidateNodeIds: ["primary"],
    }),
  }),
);
```

Return only proven children; never synthesize the missing role.

- [ ] **Step 5: Return the selected exact mapping**

Replace `recognize(node)` with `match(node)` in
`exact-component-recognizer.ts`. Preserve the existing conflict detection and
recognition evidence, and include the exact selected mapping object in the
result.

Update its unit tests to assert the variant-specific mapping wins and its
projection data survives unchanged.

- [ ] **Step 6: Lower projected facts into UiManifest v2**

In `build-ui-manifest-v2.ts`:

```ts
const exactMatch = exact.match(node);
const exactRecognition = exactMatch?.recognition;
const projection = exactMatch
  ? projectCompoundBoundary({
      boundary: node,
      mapping: exactMatch.mapping,
      ir: input.ir,
    })
  : { children: [], diagnostics: [] };
diagnostics.push(...projection.diagnostics);
```

Lower each projected fact into:

```ts
{
  id: nextUiId(`ui_${projected.role}_${sanitize(projected.boundaryNodeId)}`),
  kind: "action",
  role: projected.role,
  sourceNodeIds: [projected.boundaryNodeId, projected.labelNodeId],
  layoutSourceNodeId: projected.boundaryNodeId,
  confidence: 1,
  evidence: [
    { kind: "compound-boundary", value: node.id },
    { kind: "projected-label-source-node", value: projected.labelNodeId },
    { kind: "pack-declared-role", value: projected.role },
  ],
  content: { text: projected.label, label: projected.label },
  children: [],
}
```

Exact boundaries use projected children when projection is declared and `[]`
otherwise. Continue calling `attachActivateInteractions(root)` once after the
whole tree is built.

- [ ] **Step 7: Verify opaque and projected manifest behavior**

Add assertions to `build-ui-manifest-v2.test.ts`:

```ts
expect(findRole(manifest.root, "secondaryAction")).toMatchObject({
  content: { label: "Cancel" },
  interactions: [
    { key: "secondaryAction", event: "activate", valueType: "void" },
  ],
});
expect(findRole(manifest.root, "primaryAction")).toMatchObject({
  content: { label: "Confirm and finish" },
  interactions: [
    { key: "primaryAction", event: "activate", valueType: "void" },
  ],
});
expect(
  allNodes(manifest.root).some((node) => node.role === "unresolved"),
).toBe(false);
```

Keep the existing test proving a v1 exact action group has `children: []`.

- [ ] **Step 8: Run semantic-planner tests**

Run:

```bash
pnpm exec vitest run packages/semantic-planner/src
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add \
  packages/semantic-planner/src/project-compound-boundary.ts \
  packages/semantic-planner/src/project-compound-boundary.test.ts \
  packages/semantic-planner/src/exact-component-recognizer.ts \
  packages/semantic-planner/src/exact-component-recognizer.test.ts \
  packages/semantic-planner/src/build-ui-manifest-v2.ts \
  packages/semantic-planner/src/build-ui-manifest-v2.test.ts
git commit -m "feat: project exact action group children"
```

---

### Task 7: Migrate the Sber mapping and prove the real modal acceptance path

**Files:**

- Modify: `design-system-packs/sber-space-ui/pixso-map.json`
- Modify: `apps/cli/src/react-generation-acceptance.test.ts`

**Interfaces:**

- Consumes the real committed fixture:
  `fixtures/pixso/modal-4-314/source.json`.
- Produces two semantic Sber button resolutions through the existing
  `base.Button` catalog entry and recipe.
- Leaves the Material UI map on `pixso-map/v1`.

- [ ] **Step 1: Write the failing real-modal assertions**

Change the current footer expectations in
`react-generation-acceptance.test.ts`:

```ts
const allManifestNodes = flattenUiNodes(uiManifest.root);
expect(
  allManifestNodes.find((node) => node.role === "secondaryAction"),
).toMatchObject({
  content: { label: "Отмена" },
});
expect(
  allManifestNodes.find((node) => node.role === "primaryAction"),
).toMatchObject({
  content: { label: "Подтвердить и закончить" },
});
expect(plan.summary.blocked).toBe(0);
expect(
  generated.report.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === "GENERATION_RENDER_ONLY_CHILDREN_MISSING" &&
      diagnostic.evidence?.manifestNodeId === "ui_actionGroup_4-317",
  ),
).toEqual([]);

const tsx = source(generated, ".tsx");
expect(tsx).toContain(
  'import { Button } from "@sber-space-ui/button";',
);
expect(tsx).toContain("Отмена");
expect(tsx).toContain("Подтвердить и закончить");
expect((tsx.match(/<Button\\b/g) ?? [])).toHaveLength(2);
```

Also call `normalizePixsoDesignV2WithProvenance` and assert the two
`/text/value` origins:

```ts
expect(provenance.values).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      targetPath: "/text/value",
      kind: "component-default",
      sourceNodeId: "4:557",
    }),
    expect.objectContaining({
      targetPath: "/text/value",
      kind: "instance-override",
      sourceNodeId: "4:599",
    }),
  ]),
);
```

- [ ] **Step 2: Run acceptance and confirm the old opaque mapping fails**

Run:

```bash
pnpm exec vitest run apps/cli/src/react-generation-acceptance.test.ts
```

Expected: FAIL because the Sber exact action-group mapping is still opaque.

- [ ] **Step 3: Migrate only the Sber Pixso map to v2**

Change the document schema:

```json
"schema": "pixso-map/v2"
```

Extend only the verified action-group mapping:

```json
{
  "componentKey": "6dabeb3a9d03214e88b1f6b11513ea08ca3889cb",
  "variant": "VariantDefault",
  "kind": "group",
  "role": "actionGroup",
  "projection": {
    "kind": "action-group",
    "candidate": "button-shape-with-visible-label",
    "order": "visual",
    "roles": ["secondaryAction", "primaryAction"]
  }
}
```

Do not add footer labels, Pixso node IDs, component imports, or React props to
the map.

- [ ] **Step 4: Run pack, acceptance, and parity tests**

Run:

```bash
pnpm exec vitest run \
  packages/component-catalog/src/load-pack.test.ts \
  apps/cli/src/react-generation-acceptance.test.ts \
  extensions/qwen-cli/tests/parity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Inspect the generated acceptance source**

Run:

```bash
pnpm generate:react-acceptance-candidates
rg -n \
  'Отмена|Подтвердить и закончить|@sber-space-ui/button|<Button' \
  fixtures/candidates
```

Expected: the Sber candidate contains both labels and exactly two generated
`Button` elements. Inspect the actual candidate directory printed by the
script if its stable root differs from `fixtures/candidates`; do not promote
or overwrite reviewed fixtures as part of this step.

- [ ] **Step 6: Commit**

```bash
git add \
  design-system-packs/sber-space-ui/pixso-map.json \
  apps/cli/src/react-generation-acceptance.test.ts
git commit -m "feat: generate Sber modal footer actions"
```

---

### Task 8: Full verification, bundle rebuild, and real Qwen run

**Files:**

- Modify: `dist/qwen-adapter.mjs`
- Inspect: `.uig/runs/<new-run-id>/normalization-provenance.json`
- Inspect: `.uig/runs/<new-run-id>/design-ir.json`
- Inspect: `.uig/runs/<new-run-id>/ui-manifest.json`
- Inspect: `.uig/runs/<new-run-id>/resolution-plan.sber-space-ui.json`
- Inspect: `.uig/runs/<new-run-id>/generated/*.tsx`

**Interfaces:**

- Consumes all tasks above.
- Produces a committed portable Qwen bundle and a verified live run.
- Does not commit `.uig` run artifacts.

- [ ] **Step 1: Run formatting and type checking**

Run:

```bash
pnpm format
pnpm typecheck
```

Expected: both commands exit zero.

Review the formatting diff and ensure it contains only files from this plan.

- [ ] **Step 2: Run the complete repository verification gate**

Run:

```bash
pnpm verify
```

Expected: `format:check`, `typecheck`, fixture provenance verification, Qwen
bundle verification, and all Vitest suites pass.

- [ ] **Step 3: Rebuild and verify the portable Qwen bundle**

Run:

```bash
pnpm build:qwen-extension
pnpm verify:qwen-extension-bundle
pnpm test:qwen-extension
```

Expected: the bundle is rebuilt from current sources, contains no source-only
runtime dependency, and all extension tests pass.

- [ ] **Step 4: Commit the rebuilt bundle and any formatter-only changes**

```bash
git add \
  dist/qwen-adapter.mjs
git diff --cached --check
git commit -m "build: refresh Qwen generator bundle"
```

If `pnpm format` changed a file from this plan after its task commit, inspect
that exact path and add it explicitly before the build commit. Do not stage a
whole directory. If the rebuild is byte-identical and there are no
formatter-only changes, do not create an empty commit.

- [ ] **Step 5: Link the current repository extension**

Run from the repository root:

```bash
qwen extensions link "$(git rev-parse --show-toplevel)"
qwen extensions list
```

Expected: `universal-ui-generator` is enabled and discovered without a
manifest error.

- [ ] **Step 6: Run the real modal through Qwen**

In Qwen, execute:

```text
/uig:pixso-to-react https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314 sber-space-ui
```

Expected compact result:

```text
planning: ready
generation: generated
blocked: 0
fallback: 0
```

Record the returned run ID without copying the Pixso token or raw DSL into
logs.

- [ ] **Step 7: Verify live run evidence**

Set the literal returned run ID in the following commands:

```bash
jq '.values[] | select(.targetPath == "/text/value") |
  select(.sourceNodeId == "4:557" or .sourceNodeId == "4:599") |
  {kind,sourceNodeId,targetNodeId}' \
  .uig/runs/<new-run-id>/normalization-provenance.json

jq '.. | objects |
  select(.role? == "secondaryAction" or .role? == "primaryAction") |
  {role,content,sourceNodeIds}' \
  .uig/runs/<new-run-id>/ui-manifest.json

jq '.summary, [.diagnostics[] | select(.blocking)]' \
  .uig/runs/<new-run-id>/resolution-plan.sber-space-ui.json

rg -n 'Отмена|Подтвердить и закончить|@sber-space-ui/button|<Button' \
  .uig/runs/<new-run-id>/generated
```

Expected:

- `4:557` is `component-default`;
- `4:599` is `instance-override`;
- both semantic actions are present;
- resolution has zero blocked nodes;
- generated TSX imports Sber `Button` and renders both labels.

- [ ] **Step 8: Compare direct workflow and Qwen behavior**

Run the ordinary CLI against the same persisted snapshot or invoke the shared
application services through the existing parity test:

```bash
pnpm exec vitest run extensions/qwen-cli/tests/parity.test.ts
```

Expected: direct and extension paths produce identical durable output for
identical inputs.

- [ ] **Step 9: Restore the user's prior Qwen extension state**

If `universal-ui-generator` was not installed or linked before Step 5, remove
the temporary link:

```bash
qwen extensions uninstall universal-ui-generator
qwen extensions list
```

If it was already installed, restore the exact prior enabled/disabled and
source state instead of uninstalling it.

- [ ] **Step 10: Final repository audit**

Run:

```bash
git status --short --branch
git log --oneline -10
git diff --check
rg -n \
  '4:314|4:317|4:557|4:599|Отмена|Подтвердить и закончить' \
  packages/design-normalizer/src \
  packages/semantic-planner/src
```

Expected:

- no uncommitted implementation changes;
- the source-code search returns no fixture-specific branch or copied label in
  normalizer/planner production files;
- tests may contain the real evidence values;
- branch history contains the focused commits from this plan.
