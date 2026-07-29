# Pixso Keyless Definition Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pixso V2 normalization resolve an exact, unique keyless
`SYMBOL` definition by `componentNormName`, so the saved `70:118892` fixture
inherits its missing geometry without changing keyed behavior or introducing
fuzzy matching.

**Architecture:** Replace the materializer's single key index with two
immutable definition indexes: keyed definitions by `componentKey` and keyless
definitions by exact `componentNormName`. A single key-first resolver is used
by materialization and cycle detection. Existing exact property-path default
collection, value merging, normalized IR, and provenance contracts remain
unchanged.

**Tech Stack:** TypeScript 5.9, Node.js 22+, Vitest, pnpm 10.33.0, existing
`@uig/design-normalizer`, CLI offline acceptance, and the esbuild Qwen
extension bundle.

## Global Constraints

- The source fixture is
  `fixtures/pixso/node-70-118892/source.json`.
- The expected root is Pixso document `PqSywlhYgqSRDoWr78IrdA`, node
  `70:118892`.
- `componentKey` remains authoritative whenever it is a non-empty string.
- Norm fallback is allowed only for an instance without a non-empty key.
- Norm candidates must be keyless records whose `type` is exactly `SYMBOL`.
- Norm comparison is exact and case-sensitive.
- Zero candidates preserve existing downstream behavior.
- Multiple candidates throw `PIXSO_COMPONENT_DEFINITION_AMBIGUOUS`.
- Do not synthesize component keys, geometry, property paths, or semantic
  nodes.
- Do not add terminal-path, `componentId`, text, geometry, name, or fuzzy
  property matching.
- Do not mutate the saved fixture, source instances, or definitions.
- Keep `design-ir/v2`, `ui-manifest/v2`, and
  `normalization-provenance/v1` unchanged.
- Preserve explicit `false`, `0`, `""`, `[]`, and `null` as instance
  overrides.
- Keep concrete Sber mappings, recipes, React generation, business logic, and
  API work out of this slice.
- The post-fix planning run reports the first semantic gap but does not fix it.
- Every behavior change follows RED-GREEN-REFACTOR and receives a focused
  commit.
- Rebuild and commit `dist/qwen-adapter.mjs` separately from source changes.

---

## File Map

### Modified files

- `packages/design-normalizer/src/materialize-pixso-instance.ts` — dual
  definition indexes, key-first resolution, stable ambiguity evidence, and
  keyless cycle identities.
- `packages/design-normalizer/src/materialize-pixso-instance.test.ts` —
  exact norm resolution, precedence, filtering, ambiguity, provenance,
  mutation, permutation, and keyless-cycle regressions.
- `apps/cli/src/offline-acceptance.test.ts` — real `70:118892` V2
  normalization regression.
- `dist/qwen-adapter.mjs` — rebuilt portable extension bundle.

### New file

- `docs/superpowers/reports/2026-07-29-pixso-70-118892-post-fix-baseline.md`
  — exact observed planning baseline and the next semantic gap.

### Explicitly unchanged

- `fixtures/pixso/node-70-118892/source.json`
- `packages/contracts/src/normalization-provenance.ts`
- `packages/design-normalizer/src/normalize-design.ts`
- `packages/design-normalizer/src/normalize-node.ts`
- `packages/semantic-planner/**`
- `design-system-packs/sber-space-ui/**`
- React recipes and generated React fixtures

---

### Task 1: Add exact keyless definition resolution

**Files:**

- Modify:
  `packages/design-normalizer/src/materialize-pixso-instance.test.ts`
- Modify: `packages/design-normalizer/src/materialize-pixso-instance.ts`

**Interfaces:**

- Keep `materializePixsoRoot(...)` public behavior and return type unchanged.
- Replace the internal
  `ReadonlyMap<string, readonly PixsoRecord[]>` parameter with:

```ts
interface DefinitionIndexes {
  byKey: ReadonlyMap<string, readonly PixsoRecord[]>;
  byNormName: ReadonlyMap<string, readonly PixsoRecord[]>;
}
```

- Add one internal identity discriminator:

```ts
type DefinitionIdentity =
  | {
      kind: "key";
      componentKey: string;
      componentNormName?: string;
    }
  | {
      kind: "norm";
      componentNormName: string;
    };
```

- Keep `resolveDefinition(...)` internal and make it consume the shared
  indexes.

- [ ] **Step 1: Add a focused fixture helper for keyless records**

In `packages/design-normalizer/src/materialize-pixso-instance.test.ts`, add
helpers next to the existing `componentDefinition()` and
`actionGroupInstance()` helpers:

```ts
function keylessDefinition(input: {
  guid: string;
  normName: string;
  props?: PixsoRecord[];
  childNode?: PixsoRecord[];
}): PixsoRecord {
  return {
    guid: input.guid,
    name: input.guid,
    type: "SYMBOL",
    componentKey: null,
    componentNormName: input.normName,
    ...(input.props ? { props: input.props } : {}),
    ...(input.childNode ? { childNode: input.childNode } : {}),
  };
}

function keylessInstance(input: {
  guid: string;
  normName?: string;
  componentKey?: string | null;
  props?: PixsoRecord[];
}): PixsoRecord {
  return {
    guid: input.guid,
    name: input.guid,
    type: "INSTANCE",
    componentKey: input.componentKey ?? null,
    ...(input.normName
      ? { componentNormName: input.normName }
      : { componentNormName: null }),
    props: input.props ?? [],
  };
}

function textProperty(input: {
  path: string;
  text?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}): PixsoRecord {
  return {
    componentId: input.path.split("/").at(-1),
    pathString: input.path,
    type: "TEXT",
    ...(input.text === undefined ? {} : { nodeText: input.text }),
    ...(input.left === undefined ? {} : { left: input.left }),
    ...(input.top === undefined ? {} : { top: input.top }),
    ...(input.width === undefined ? {} : { width: input.width }),
    ...(input.height === undefined ? {} : { height: input.height }),
  };
}
```

Use the test file's existing `PixsoRecord` import or extend it from
`./pixso-types.js`; do not introduce `any`.

- [ ] **Step 2: Write the failing unique-norm and provenance regression**

Add:

```ts
it("resolves one exact keyless SYMBOL definition and preserves field origins", () => {
  const definition = keylessDefinition({
    guid: "31:100831",
    normName: "Component_31_100831",
    props: [
      textProperty({
        path: "27:101325/4:63130",
        text: "Default copy",
        left: 0,
        top: 20,
        width: 561,
        height: 32,
      }),
    ],
  });
  const instance = keylessInstance({
    guid: "70:118899",
    normName: "Component_31_100831",
    props: [
      textProperty({
        path: "27:101325/4:63130",
        text: "Instance copy",
      }),
    ],
  });
  const original = structuredClone({ definition, instance });

  const result = materializePixsoRoot({
    root: instance,
    componentDefinitions: [definition],
  });
  const property = flatProperties(result.root).get(
    "27:101325/4:63130",
  );

  expect(property).toMatchObject({
    nodeText: "Instance copy",
    left: 0,
    top: 20,
    width: 561,
    height: 32,
  });
  expect(result.origins.get(property!)?.get("nodeText")).toMatchObject({
    kind: "instance-override",
    sourceNodeId: "4:63130",
    sourcePropertyPath: "27:101325/4:63130",
    componentDefinitionNodeId: "31:100831",
  });
  expect(result.origins.get(property!)?.get("width")).toMatchObject({
    kind: "component-default",
    sourceNodeId: "4:63130",
    sourcePropertyPath: "27:101325/4:63130",
    componentDefinitionNodeId: "31:100831",
  });
  expect(
    result.origins.get(property!)?.get("nodeText"),
  ).not.toHaveProperty("componentKey");
  expect(
    result.origins.get(property!)?.get("width"),
  ).not.toHaveProperty("componentKey");
  expect({ definition, instance }).toEqual(original);
});
```

If `flatProperties(...)` returns an array rather than a map in the current
test helper, use its existing lookup idiom; do not change production output to
fit the assertion.

- [ ] **Step 3: Write failing lookup-boundary tests**

Add these cases before production changes:

```ts
it("keeps a non-empty componentKey authoritative over a norm-only candidate", () => {
  const keyed = {
    ...keylessDefinition({
      guid: "keyed-definition",
      normName: "DifferentVariant",
      props: [textProperty({ path: "label", text: "Keyed default" })],
    }),
    componentKey: "authoritative-key",
  };
  const normOnly = keylessDefinition({
    guid: "norm-definition",
    normName: "SharedNorm",
    props: [textProperty({ path: "label", text: "Norm default" })],
  });
  const instance = keylessInstance({
    guid: "instance",
    componentKey: "authoritative-key",
    normName: "SharedNorm",
    props: [textProperty({ path: "label" })],
  });

  const result = materializePixsoRoot({
    root: instance,
    componentDefinitions: [normOnly, keyed],
  });

  expect(flatProperties(result.root).get("label")?.nodeText).toBe(
    "Keyed default",
  );
});

it("does not use keyed or non-SYMBOL records as norm-only definitions", () => {
  const keyedSymbol = {
    ...keylessDefinition({
      guid: "keyed",
      normName: "SharedNorm",
      props: [textProperty({ path: "label", text: "Wrong keyed" })],
    }),
    componentKey: "another-key",
  };
  const keylessInstanceRecord = {
    ...keylessDefinition({
      guid: "not-a-symbol",
      normName: "SharedNorm",
      props: [textProperty({ path: "label", text: "Wrong type" })],
    }),
    type: "INSTANCE",
  };
  const root = keylessInstance({
    guid: "root",
    normName: "SharedNorm",
    props: [textProperty({ path: "label" })],
  });

  const result = materializePixsoRoot({
    root,
    componentDefinitions: [keyedSymbol, keylessInstanceRecord],
  });

  expect(flatProperties(result.root).get("label")).not.toHaveProperty(
    "nodeText",
  );
});

it("does not use a keyed non-SYMBOL record as a keyed definition", () => {
  const root = keylessInstance({
    guid: "root",
    componentKey: "SharedKey",
    props: [textProperty({ path: "label" })],
  });
  const notASymbol = {
    ...keylessDefinition({
      guid: "not-a-symbol",
      normName: "SharedNorm",
      props: [textProperty({ path: "label", text: "Wrong default" })],
    }),
    componentKey: "SharedKey",
    type: "INSTANCE",
  };

  const result = materializePixsoRoot({
    root,
    componentDefinitions: [notASymbol],
  });

  expect(flatProperties(result.root).get("label")).not.toHaveProperty(
    "nodeText",
  );
});

it.each([
  { componentNormName: undefined },
  { componentNormName: null },
  { componentNormName: "" },
  { componentNormName: "DifferentNorm" },
])(
  "does not fall back without an exact non-empty norm: $componentNormName",
  ({ componentNormName }) => {
    const root = {
      ...keylessInstance({
        guid: "root",
        props: [textProperty({ path: "label" })],
      }),
      componentNormName,
    };
    const result = materializePixsoRoot({
      root,
      componentDefinitions: [
        keylessDefinition({
          guid: "definition",
          normName: "SharedNorm",
          props: [textProperty({ path: "label", text: "Wrong default" })],
        }),
      ],
    });

    expect(flatProperties(result.root).get("label")).not.toHaveProperty(
      "nodeText",
    );
  },
);
```

Add a keyless selection regression around the existing merge rules:

```ts
it("keeps falsy and null values as overrides after keyless resolution", () => {
  const fields = {
    enabled: false,
    count: 0,
    description: "",
    choices: [],
    optional: null,
  };
  const definition = keylessDefinition({
    guid: "definition",
    normName: "SharedNorm",
    props: [
      {
        ...textProperty({ path: "label", text: "Default" }),
        enabled: true,
        count: 10,
        description: "Default",
        choices: ["default"],
        optional: "default",
      },
    ],
  });
  const instance = keylessInstance({
    guid: "root",
    normName: "SharedNorm",
    props: [{ ...textProperty({ path: "label" }), ...fields }],
  });

  const result = materializePixsoRoot({
    root: instance,
    componentDefinitions: [definition],
  });
  const property = flatProperties(result.root).get("label")!;

  expect(property).toMatchObject(fields);
  for (const field of Object.keys(fields)) {
    expect(result.origins.get(property)?.get(field)?.kind).toBe(
      "instance-override",
    );
  }
});
```

Add the deterministic ambiguity test:

```ts
it("blocks ambiguous keyless norm definitions with stable candidate evidence", () => {
  const definitions = [
    keylessDefinition({
      guid: "definition-b",
      normName: "SharedNorm",
    }),
    keylessDefinition({
      guid: "definition-a",
      normName: "SharedNorm",
    }),
  ];
  const root = keylessInstance({
    guid: "root",
    normName: "SharedNorm",
  });

  const errors = permutations(definitions).map((componentDefinitions) => {
    try {
      materializePixsoRoot({ root, componentDefinitions });
      throw new Error("expected ambiguity");
    } catch (error) {
      expect(error).toMatchObject({
        code: "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
      });
      return (error as Error).message;
    }
  });

  expect(new Set(errors)).toEqual(
    new Set([
      "Pixso componentNormName SharedNorm has 2 keyless SYMBOL definitions: definition-a, definition-b",
    ]),
  );
});
```

- [ ] **Step 4: Run the new tests and confirm RED**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src/materialize-pixso-instance.test.ts
```

Expected:

- the unique norm case fails because no definition is selected;
- precedence/filtering assertions expose any accidental norm participation;
- ambiguity fails because the current key-only resolver returns no definition;
- existing keyed, falsy/null, hierarchy, and mutation tests stay green.

Do not weaken expectations to match current behavior.

- [ ] **Step 5: Introduce identity and dual indexes**

In `materialize-pixso-instance.ts`, replace `buildDefinitionsByKey(...)` with:

```ts
interface DefinitionIndexes {
  byKey: ReadonlyMap<string, readonly PixsoRecord[]>;
  byNormName: ReadonlyMap<string, readonly PixsoRecord[]>;
}

type DefinitionIdentity =
  | {
      kind: "key";
      componentKey: string;
      componentNormName?: string;
    }
  | {
      kind: "norm";
      componentNormName: string;
    };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function definitionIdentity(
  instance: PixsoRecord,
): DefinitionIdentity | undefined {
  const componentKey = nonEmptyString(instance.componentKey);
  const componentNormName = nonEmptyString(instance.componentNormName);
  if (componentKey) {
    return {
      kind: "key",
      componentKey,
      ...(componentNormName ? { componentNormName } : {}),
    };
  }
  return componentNormName
    ? { kind: "norm", componentNormName }
    : undefined;
}

function buildDefinitionIndexes(values: unknown[]): DefinitionIndexes {
  const byKey = new Map<string, PixsoRecord[]>();
  const byNormName = new Map<string, PixsoRecord[]>();
  const add = (
    index: Map<string, PixsoRecord[]>,
    identity: string,
    definition: PixsoRecord,
  ): void => {
    const candidates = index.get(identity) ?? [];
    candidates.push(definition);
    index.set(identity, candidates);
  };
  const visit = (value: unknown): void => {
    if (!isRecord(value)) {
      return;
    }
    if (value.type === "SYMBOL") {
      const componentKey = nonEmptyString(value.componentKey);
      const componentNormName = nonEmptyString(value.componentNormName);
      if (componentKey) {
        add(byKey, componentKey, value);
      } else if (componentNormName) {
        add(byNormName, componentNormName, value);
      }
    }
    if (Array.isArray(value.childNode)) {
      value.childNode.forEach(visit);
    }
  };
  values.forEach(visit);
  return { byKey, byNormName };
}
```

This makes the two indexes mutually exclusive. Do not add a record to
`byNormName` when it has a non-empty key.

- [ ] **Step 6: Implement key-first resolution**

Refactor `resolveDefinition(...)`:

```ts
function resolveDefinition(
  instance: PixsoRecord,
  definitions: DefinitionIndexes,
): PixsoRecord | undefined {
  const identity = definitionIdentity(instance);
  if (!identity) {
    return undefined;
  }

  if (identity.kind === "key") {
    const candidates = definitions.byKey.get(identity.componentKey) ?? [];
    const compatible = identity.componentNormName
      ? candidates.filter(
          (candidate) =>
            candidate.componentNormName === identity.componentNormName,
        )
      : candidates;
    if (compatible.length === 1) {
      return compatible[0];
    }
    if (compatible.length === 0 && candidates.length === 1) {
      return candidates[0];
    }
    if (compatible.length === 0 && candidates.length === 0) {
      return undefined;
    }
    throw new DesignNormalizationError(
      "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
      `Pixso component key ${identity.componentKey} has multiple compatible definitions`,
    );
  }

  const candidates =
    definitions.byNormName.get(identity.componentNormName) ?? [];
  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const candidateIds = candidates
    .map((candidate) => rawNodeId(candidate, "definition"))
    .sort((left, right) => left.localeCompare(right));
  throw new DesignNormalizationError(
    "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
    `Pixso componentNormName ${identity.componentNormName} has ${
      candidates.length
    } keyless SYMBOL definitions: ${candidateIds.join(", ")}`,
  );
}
```

Preserve the existing keyed error behavior. Stable candidate IDs are required
only for the new norm ambiguity in this slice.

- [ ] **Step 7: Route materialization through the shared resolver**

At the top-level:

```ts
const definitions = buildDefinitionIndexes(_input.componentDefinitions);
```

Change `materializeNode(...)` to always ask the resolver:

```ts
const componentKey = nonEmptyString(source.componentKey);
const definition = resolveDefinition(source, definitions);
```

Keep the merge context conditional:

```ts
...(componentKey ? { componentKey } : {}),
...(definition ? { definition } : {}),
```

Do not manufacture a key from the norm name.

Update internal parameter types in `materializeNode(...)` and
`assertNoInheritanceCycle(...)` to `DefinitionIndexes`. Task 2 completes
keyless cycle traversal.

- [ ] **Step 8: Run the focused suite and refactor**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src/materialize-pixso-instance.test.ts
```

Expected: all current and newly added resolution tests pass.

Then run:

```bash
pnpm exec prettier --write packages/design-normalizer/src/materialize-pixso-instance.ts packages/design-normalizer/src/materialize-pixso-instance.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add packages/design-normalizer/src/materialize-pixso-instance.ts packages/design-normalizer/src/materialize-pixso-instance.test.ts
git commit -m "feat: resolve keyless Pixso definitions"
```

---

### Task 2: Extend inheritance-cycle safety to norm identities

**Files:**

- Modify:
  `packages/design-normalizer/src/materialize-pixso-instance.test.ts`
- Modify: `packages/design-normalizer/src/materialize-pixso-instance.ts`

**Identity contract:**

```text
key:<componentKey>\u0000<componentNormName-or-empty>
norm:<componentNormName>
```

The namespace is part of the active-chain identity, so equal textual values
cannot collide across key and norm identities.

- [ ] **Step 1: Write the failing keyless-cycle test**

Add:

```ts
it("rejects a keyless component-definition inheritance cycle", () => {
  const definitionA = keylessDefinition({
    guid: "definition-a",
    normName: "NormA",
    childNode: [
      keylessInstance({
        guid: "nested-b",
        normName: "NormB",
      }),
    ],
  });
  const definitionB = keylessDefinition({
    guid: "definition-b",
    normName: "NormB",
    childNode: [
      keylessInstance({
        guid: "nested-a",
        normName: "NormA",
      }),
    ],
  });
  const root = keylessInstance({
    guid: "root",
    normName: "NormA",
  });

  expect(() =>
    materializePixsoRoot({
      root,
      componentDefinitions: [definitionB, definitionA],
    }),
  ).toThrowError(
    /PIXSO_COMPONENT_INHERITANCE_CYCLE|norm:NormA -> norm:NormB -> norm:NormA/,
  );
});
```

Because Vitest's `toThrowError` matches the message rather than custom error
fields, also capture the error once and assert:

```ts
expect(error).toMatchObject({
  code: "PIXSO_COMPONENT_INHERITANCE_CYCLE",
});
```

Use the same capture pattern as the current keyed cycle test rather than
duplicating a new utility.

- [ ] **Step 2: Add a namespace non-collision regression**

Add:

```ts
it("keeps key and norm cycle identities in separate namespaces", () => {
  const keyedDefinition = {
    ...keylessDefinition({
      guid: "keyed-definition",
      normName: "Variant",
      childNode: [
        keylessInstance({
          guid: "nested-norm",
          normName: "shared",
        }),
      ],
    }),
    componentKey: "shared",
  };
  const normDefinition = keylessDefinition({
    guid: "norm-definition",
    normName: "shared",
  });
  const root = keylessInstance({
    guid: "root",
    componentKey: "shared",
    normName: "Variant",
  });

  expect(() =>
    materializePixsoRoot({
      root,
      componentDefinitions: [keyedDefinition, normDefinition],
    }),
  ).not.toThrow();
});
```

- [ ] **Step 3: Run the tests and confirm RED**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src/materialize-pixso-instance.test.ts
```

Expected:

- keyless cycle test fails because the current cycle guard returns when
  `componentKey` is absent;
- namespace non-collision remains green or reveals an unnamespaced
  implementation error;
- all Task 1 lookup tests remain green.

- [ ] **Step 4: Serialize namespaced identities**

Add:

```ts
function serializeDefinitionIdentity(identity: DefinitionIdentity): string {
  return identity.kind === "key"
    ? `key:${identity.componentKey}\u0000${
        identity.componentNormName ?? ""
      }`
    : `norm:${identity.componentNormName}`;
}
```

Refactor `assertNoInheritanceCycle(...)`:

```ts
function assertNoInheritanceCycle(
  instance: PixsoRecord,
  definitions: DefinitionIndexes,
  activeIdentities: readonly string[],
): void {
  const definitionIdentityValue = definitionIdentity(instance);
  if (!definitionIdentityValue) {
    return;
  }
  const identity = serializeDefinitionIdentity(definitionIdentityValue);
  if (activeIdentities.includes(identity)) {
    throw new DesignNormalizationError(
      "PIXSO_COMPONENT_INHERITANCE_CYCLE",
      `Pixso component inheritance cycle: ${[
        ...activeIdentities,
        identity,
      ].join(" -> ")}`,
    );
  }
  const definition = resolveDefinition(instance, definitions);
  if (!definition) {
    return;
  }
  for (const nestedInstance of collectNestedComponentInstances(definition)) {
    assertNoInheritanceCycle(nestedInstance, definitions, [
      ...activeIdentities,
      identity,
    ]);
  }
}
```

- [ ] **Step 5: Collect nested instances with either supported identity**

In `collectNestedComponentInstances(...)`, replace the key-only predicate:

```ts
if (!isRoot && definitionIdentity(value)) {
  instances.push(value);
}
```

Continue sorting with the existing `rawNodeId(...)` comparison for
deterministic traversal. Do not collect the definition root as its own nested
instance.

- [ ] **Step 6: Verify focused and package behavior**

Run:

```bash
pnpm exec vitest run packages/design-normalizer/src/materialize-pixso-instance.test.ts packages/design-normalizer/src/normalize-design.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add packages/design-normalizer/src/materialize-pixso-instance.ts packages/design-normalizer/src/materialize-pixso-instance.test.ts
git commit -m "fix: detect keyless Pixso inheritance cycles"
```

---

### Task 3: Prove the real `70:118892` fixture passes V2 normalization

**Files:**

- Modify: `apps/cli/src/offline-acceptance.test.ts`

**Fixture facts:**

```text
artifactId: pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628
rootNodeId: 70:118892
instance node: 70:118899
definition node: 31:100831
property source node: 4:63130
property path: 27:101325/4:63130
geometry: x=0, y=20, width=561, height=32
```

- [ ] **Step 1: Add the V2 normalizer import**

Change:

```ts
import { normalizePixsoDesign } from "@uig/design-normalizer";
```

to:

```ts
import {
  normalizePixsoDesign,
  normalizePixsoDesignV2WithProvenance,
} from "@uig/design-normalizer";
```

- [ ] **Step 2: Write the real-fixture regression**

Add a separate test after the existing parameterized V1 test:

```ts
it("materializes keyless defaults for Pixso 70:118892 in V2", async () => {
  const rawDsl = JSON.parse(
    await readFile(
      join(
        repoRoot,
        "fixtures",
        "pixso",
        "node-70-118892",
        "source.json",
      ),
      "utf8",
    ),
  );

  const result = normalizePixsoDesignV2WithProvenance({
    artifactId:
      "pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628",
    rootNodeId: "70:118892",
    rawDsl,
  });
  const materializedText = Object.values(result.designIr.nodes).find(
    (node) =>
      node.text?.value.includes(
        "Сообщите сотруднику бизнеса (SecurityDesk)",
      ),
  );

  expect(result.designIr.rootNodeId).toBe("70:118892");
  expect(materializedText).toBeDefined();
  expect(materializedText).toMatchObject({
    text: {
      value:
        "Сообщите сотруднику бизнеса (SecurityDesk) о невозможности дальнейшей обработки сделки\nОна будет остановлена",
    },
    geometry: {
      x: 0,
      y: 20,
      width: 561,
      height: 32,
    },
  });

  const textOrigin = result.provenance.values.find(
    (origin) =>
      origin.targetNodeId === materializedText!.id &&
      origin.targetPath === "/text/value",
  );
  expect(textOrigin).toMatchObject({
    kind: "instance-override",
    sourceNodeId: "4:63130",
    sourcePropertyPath: "27:101325/4:63130",
    componentDefinitionNodeId: "31:100831",
  });
  expect(textOrigin).not.toHaveProperty("componentKey");

  for (const targetPath of [
    "/geometry/x",
    "/geometry/y",
    "/geometry/width",
    "/geometry/height",
  ]) {
    const geometryOrigin = result.provenance.values.find(
      (origin) =>
        origin.targetNodeId === materializedText!.id &&
        origin.targetPath === targetPath,
    );
    expect(geometryOrigin).toMatchObject({
      kind: "component-default",
      sourceNodeId: "4:63130",
      sourcePropertyPath: "27:101325/4:63130",
      componentDefinitionNodeId: "31:100831",
    });
    expect(geometryOrigin).not.toHaveProperty("componentKey");
  }
});
```

Use the normalized node object's actual identifier field if it is not `id`.
The assertion must derive the provenance target from the normalized node
rather than hard-coding a reconstructed normalized ID.

- [ ] **Step 3: Run the regression**

Run:

```bash
pnpm exec vitest run apps/cli/src/offline-acceptance.test.ts
```

Expected after Tasks 1 and 2: PASS, including:

- the existing V1 cases for `6:12547` and `70:118892`;
- the existing reviewed `4:314` artifacts;
- the new V2 keyless materialization regression.

If the test exposes a provenance mismatch, fix only origin selection in
`mergeEffectiveRecord(...)`. Do not alter the public provenance schema or
weaken the expected kinds. Rerun both:

```bash
pnpm exec vitest run packages/design-normalizer/src/materialize-pixso-instance.test.ts apps/cli/src/offline-acceptance.test.ts
```

- [ ] **Step 4: Verify the existing `4:314` V2 acceptance**

Run:

```bash
pnpm exec vitest run apps/cli/src/react-generation-acceptance.test.ts
```

Expected: PASS with no golden or generated React changes.

- [ ] **Step 5: Format, typecheck, and commit the fixture regression**

Run:

```bash
pnpm exec prettier --write apps/cli/src/offline-acceptance.test.ts
pnpm typecheck
git diff --check
```

Then:

```bash
git add apps/cli/src/offline-acceptance.test.ts
git commit -m "test: normalize keyless Pixso fixture"
```

---

### Task 4: Record the post-fix semantic baseline without expanding scope

**Files:**

- Create:
  `docs/superpowers/reports/2026-07-29-pixso-70-118892-post-fix-baseline.md`

**Purpose:** Turn the now-readable real design into evidence for the next
recognizer/projector slice. This task is observational only.

- [ ] **Step 1: Run the current V2 planner through Sber Space UI**

Seed the saved fixture into the existing local artifact store without network
access:

```bash
node --import tsx --input-type=module -e 'import { readFile } from "node:fs/promises"; import { createArtifactStore } from "./packages/design-context/src/index.ts"; const bytes = new Uint8Array(await readFile("fixtures/pixso/node-70-118892/source.json")); const stored = await createArtifactStore(".uig").put({ provider: "pixso", documentId: "PqSywlhYgqSRDoWr78IrdA", nodeId: "70:118892", bytes }); process.stdout.write(`${stored.artifactId}\n`);'
```

Expected artifact ID:

```text
pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628
```

Then use the repository's ordinary snapshot workflow:

```bash
pnpm uig -- plan --snapshot pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628 --design-system sber-space-ui
```

The command may exit with code `2` when the current resolver reports a
blocking semantic diagnostic. That is valid baseline output after successful
normalization; record the emitted `.uig/runs/<run-id>` path. Do not use Pixso
Remote MCP, network access, Qwen, or a modified fixture for this baseline.

Keep the generated run directory uncommitted unless it is already a tracked
acceptance artifact. The durable committed artifact for this task is the
report below.

- [ ] **Step 2: Inspect the generated artifacts deterministically**

Read:

```text
design-ir.json
ui-manifest.json
resolution-plan.sber-space-ui.json
normalization-provenance.json
```

Calculate and copy exact values for:

- `Object.keys(designIr.nodes).length`;
- every manifest node's `id`, semantic `role`, and `sourceNodeIds`;
- resolution status counts;
- the first blocking diagnostic, or the first fallback diagnostic when no
  blocking diagnostic exists;
- the first visible semantic structure in the saved design that is absent
  from the manifest.

The last item must cite source node IDs and visible evidence from the fixture.
Do not infer the follow-up from Russian copy alone when geometry, hierarchy,
or component identity contradicts it.

- [ ] **Step 3: Write the baseline report with observed literals**

Create
`docs/superpowers/reports/2026-07-29-pixso-70-118892-post-fix-baseline.md`
using this exact structure:

```md
# Pixso 70:118892 Post-fix Baseline

**Date:** 2026-07-29
**Fixture:** `PqSywlhYgqSRDoWr78IrdA / 70:118892`
**Design system:** `sber-space-ui`

## Normalization

- Result: PASS
- Root node: `70:118892`
- Normalized node count: `<copy the exact integer from design-ir.json>`
- Keyless definition: `31:100831`
- Recovered property: `27:101325/4:63130`

## Semantic manifest

| Manifest node ID | Role | Source node IDs |
| --- | --- | --- |
| `<exact ID>` | `<exact role>` | `<exact IDs>` |

## Resolution

| Status | Count |
| --- | ---: |
| `<exact status>` | `<exact integer>` |

First blocking or fallback diagnostic:

```json
<copy the exact compact diagnostic object>
```

## First missing semantic structure

`<exact structure name>` is visible in source nodes `<exact IDs>` but is not
represented by a dedicated manifest role.

Evidence:

- `<exact source-node and hierarchy evidence>`
- `<exact geometry or component-identity evidence>`
- `<exact manifest evidence showing the omission>`

## Recommended next slice

Design a dedicated `<recognizer or projector named from the observed gap>`.
Do not implement it as part of keyless definition resolution.
```

Angle-bracket lines above are plan-time instructions only. The committed
report must contain the exact observed values and no placeholders, ellipses,
or speculative diagnostics.

- [ ] **Step 4: Review scope and commit the report**

Confirm:

- no source, pack, recognizer, recipe, or fixture changed during the baseline
  run;
- the report states one first gap, not a roadmap of speculative features;
- every reported ID exists in the saved fixture or generated artifacts;
- generated run files are either ignored or removed from the commit scope
  without destructive cleanup of unrelated user files.

Run:

```bash
git status --short
git diff --check
```

Then:

```bash
git add docs/superpowers/reports/2026-07-29-pixso-70-118892-post-fix-baseline.md
git commit -m "docs: record Pixso keyless post-fix baseline"
```

---

### Task 5: Run repository verification and rebuild the Qwen bundle

**Files:**

- Modify: `dist/qwen-adapter.mjs`

- [ ] **Step 1: Run complete source verification before rebuilding**

Run:

```bash
pnpm verify
```

Expected: PASS for formatting, typecheck, fixture provenance, current bundle
verification, and all tests.

If `verify:qwen-extension-bundle` fails only because the committed bundle is
stale after the source change, preserve the exact failure as evidence and
continue to Step 2. Any other failure must be fixed in the owning earlier
task and committed there before proceeding.

- [ ] **Step 2: Rebuild the portable Qwen extension**

Run:

```bash
pnpm build:qwen-extension
```

Expected: `dist/qwen-adapter.mjs` changes because it contains the updated
materializer.

- [ ] **Step 3: Verify the rebuilt bundle and extension tests**

Run:

```bash
pnpm verify:qwen-extension-bundle
pnpm test:qwen-extension
```

Expected: PASS.

- [ ] **Step 4: Inspect the bundle diff and commit it separately**

Run:

```bash
git diff --stat
git diff --check
git status --short
```

Confirm the only intended uncommitted tracked change is
`dist/qwen-adapter.mjs`. Then:

```bash
git add dist/qwen-adapter.mjs
git commit -m "build: refresh Qwen keyless definition bundle"
```

- [ ] **Step 5: Run final clean verification**

Run:

```bash
pnpm verify
pnpm verify:qwen-extension-bundle
pnpm test:qwen-extension
git status --short
```

Expected:

- all commands pass;
- `git status --short` is empty;
- the saved Pixso fixture is unchanged;
- the baseline report names the next semantic gap without implementing it.

- [ ] **Step 6: Request code review before integration**

Use `superpowers:requesting-code-review` against the full commit range from
the commit before Task 1 through the Qwen bundle commit. Require the reviewer
to check:

1. key precedence and exclusion of keyed symbols from norm lookup;
2. stable ambiguity and cycle diagnostics;
3. no fuzzy matching or synthesized values;
4. real-fixture provenance without a fabricated component key;
5. unchanged `4:314` behavior;
6. baseline report evidence and scope discipline;
7. regenerated bundle parity.

Address only technically valid findings through
`superpowers:receiving-code-review`, rerun the affected focused tests, and
then rerun the final verification commands above.

---

## Final Acceptance Checklist

- [ ] `componentKey` remains authoritative when non-empty.
- [ ] Norm fallback runs only without a non-empty key.
- [ ] Norm candidates are exact keyless `SYMBOL` definitions.
- [ ] A unique candidate resolves.
- [ ] Zero candidates preserve old behavior.
- [ ] Multiple candidates block with stable sorted IDs.
- [ ] Key and norm cycle identities are namespaced.
- [ ] Existing exact property-path matching is unchanged.
- [ ] Explicit falsy/null overrides remain unchanged.
- [ ] Source records and fixture JSON are not mutated.
- [ ] Text provenance is `instance-override`.
- [ ] Geometry provenance is `component-default`.
- [ ] Provenance names definition `31:100831`.
- [ ] Provenance omits `componentKey` for the keyless instance.
- [ ] `70:118892` passes V2 offline normalization.
- [ ] Existing V1 fixture tests pass.
- [ ] Existing `4:314` V2/React acceptance passes unchanged.
- [ ] The post-fix Sber planning baseline is recorded with exact literals.
- [ ] No form/table recognizer, mapping, recipe, or business logic is added.
- [ ] `pnpm verify` passes.
- [ ] Qwen bundle verification and extension tests pass.
- [ ] `dist/qwen-adapter.mjs` is rebuilt and committed separately.
- [ ] Final worktree is clean.
