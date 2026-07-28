# Pixso Instance Materialization and Action-Group Projection Design

**Date:** 2026-07-28

**Status:** approved direction, awaiting written-spec review

**Repository:** `/Users/danilel/Documents/Codex/universal-ui-generator`

**Extends:**

- `2026-07-26-universal-ui-generator-design.md`
- `2026-07-26-react-generation-design.md`
- `2026-07-26-render-only-component-recipes-design.md`
- `2026-07-27-qwen-cli-extension-design.md`

## 1. Outcome

Improve the repository-owned Pixso-to-React workflow so that semantic content
inherited from Pixso component definitions is not lost when an instance
contains only partial overrides.

The first vertical slice targets the real Pixso modal:

```text
document: WSLukjrKancvZG0zbaMnyA
root node: 4:314
action group: 4:317
```

The full source DSL proves that the footer contains:

```text
Отмена
Подтвердить и закончить
```

The current `DesignIR` contains only `Подтвердить и закончить`. The missing
label is not absent from the design and must not be invented by a recipe. It is
a component default that the current normalizer fails to inherit.

After this slice, the normalizer materializes an effective Pixso instance tree
from component defaults plus instance overrides. The semantic planner then
projects the proven button descendants of an exact `actionGroup` boundary into
semantic actions. The Sber Space UI generator can consequently emit both
footer buttons from design-backed evidence.

## 2. Approved decisions

The user approved the following direction:

1. Fix Pixso instance inheritance in the provider-normalization boundary.
2. Do not add node-ID, Russian-text, modal-specific, or Sber-specific behavior
   to the normalizer or semantic planner.
3. Do not invent `Отмена`; recover it from the Pixso component definition.
4. Preserve provenance for inherited defaults and instance overrides.
5. Keep exact component boundaries: decorative implementation descendants
   remain hidden from the public semantic tree.
6. Allow an exact compound boundary to expose a bounded set of proven semantic
   descendants.
7. Implement `actionGroup` projection in the first slice.
8. Leave heading description and combobox content projection for subsequent
   slices.
9. Validate the result with the ordinary repository workflow and then with the
   real portable Qwen extension.
10. Business logic remains out of scope.

## 3. Verified source evidence

The persisted raw artifact for the accepted Qwen run is:

```text
.uig/cache/sha256/53ea1cd290fadf81eca307f489ea5088afb758f6470114698f20b92aeb1cab15
```

Its Pixso component tree contains the definition:

```text
guid: 4:445
name: Modal Action
componentKey: af0f129be938c583514d48eb0a0544bcc6015135
```

The nested secondary button instance `4:460` contains a default property:

```json
{
  "componentId": "4:557",
  "pathString": "4:557",
  "type": "TEXT",
  "nodeText": "Отмена"
}
```

The modal action-group instance `4:317` contains the corresponding flattened
property reference without `nodeText`:

```json
{
  "componentId": "4:557",
  "pathString": "4:460/4:557",
  "type": "TEXT"
}
```

The same instance explicitly overrides the primary label:

```json
{
  "componentId": "4:599",
  "pathString": "4:461/4:599",
  "type": "TEXT",
  "nodeText": "Подтвердить и закончить"
}
```

Therefore the effective values are:

| Effective path | Value | Origin |
| --- | --- | --- |
| `4:460/4:557.nodeText` | `Отмена` | component default |
| `4:461/4:599.nodeText` | `Подтвердить и закончить` | instance override |

## 4. Root cause

`normalizePixsoDesignV2` currently appends every visually shaped entry in an
instance's flat `props` array directly to `childNode`:

```text
raw childNode + all visual props → direct normalized children
```

This has two independent losses:

1. A property record with no `nodeText` is normalized without looking up the
   matching component default.
2. A flattened property path such as `4:460/4:557` is emitted as a direct child
   instead of reconstructing the containment relationship
   `button 4:460 → text 4:557`.

The exact component recognizer then correctly claims `4:317` as
`actionGroup`, but exact recognition currently always prunes all descendants.
The downstream planner sees neither a complete secondary label nor usable
button boundaries.

## 5. Architectural boundary

The data flow remains:

```text
raw Pixso DSL
        ↓
Pixso effective-instance materializer
        ↓
provider-neutral DesignIR
        ↓
exact recognition + bounded semantic projection
        ↓
UiManifest
        ↓
design-system resolution and React generation
        ↓
thin Qwen extension
```

Responsibilities:

- The Pixso materializer understands component definitions, flattened
  `pathString` values, and override semantics.
- `DesignIR` contains only effective provider-neutral design facts.
- The semantic planner recognizes actions and groups; it does not read raw
  Pixso fields.
- The design-system pack declares how a known exact compound component exposes
  semantic children.
- The resolver and React generator continue consuming semantic roles rather
  than Pixso identities.
- Qwen receives compact workflow results and never repairs or reinterprets the
  raw DSL.

## 6. Effective-instance materialization

### 6.1 New internal phase

Add a pure internal phase before traversal:

```ts
materializePixsoRoot({
  root,
  componentDefinitions,
}): {
  root: PixsoRecord;
  provenance: MaterializationProvenance;
  diagnostics: Diagnostic[];
}
```

The phase must not mutate the parsed raw artifact. Identical source input must
produce byte-identical normalized artifacts.

### 6.2 Definition indexes

Build deterministic indexes over `pixComponentTreeDslNodes`:

```text
componentKey → component definition root
definition-relative property path → default property record
```

Every nested instance definition contributes its defaults under the path of
the owning instance. For example, the local default path `4:557` inside
definition child `4:460` becomes `4:460/4:557` when viewed from `Modal Action`.

A component key used for inheritance must resolve to exactly one compatible
definition. Ambiguous definitions are blocking; array order must never decide
the winner.

### 6.3 Property identity

Flattened instance properties are matched using a canonical property identity:

```text
canonical pathString + componentId + type
```

`pathString` is split into non-empty path segments. Empty segments, `.` and
`..` are invalid. A record whose `pathString` collides with an incompatible
`componentId` or `type` produces a blocking diagnostic.

`guid` is not required for flattened property records and is not synthesized.

### 6.4 Merge semantics

For a matching property, merge the component default with the instance
property using these deterministic rules:

1. Instance identity and placement fields win:
   `componentId`, `pathString`, `type`, `left`, `top`, `width`, and `height`.
2. A present instance value overrides a default value, including `false`, `0`,
   an empty string, an empty array, or explicit `null`.
3. A missing instance value inherits the component default.
4. Plain supported value objects are merged recursively.
5. Arrays are atomic: a present instance array replaces the default array.
6. `childNode`, `props`, `guid`, and definition-root identity are never copied
   as ordinary values.
7. Unsupported values remain subject to the existing normalizer policy and
   diagnostics.

These rules apply to fields already understood by the normalizer. This slice
does not broaden the provider-neutral `DesignIR` appearance vocabulary.

### 6.5 Reconstructing the property tree

Convert the effective flat properties into a hierarchy using canonical
`pathString` prefixes:

```text
4:460
├── 4:460/4:556
└── 4:460/4:557  "Отмена"

4:461
├── 4:461/4:598
└── 4:461/4:599  "Подтвердить и закончить"
```

For each effective property:

- its parent is the longest existing proper path prefix;
- if no property prefix exists, it is attached to the owning instance;
- source array order does not affect hierarchy;
- sibling output order is stable by visual position and then canonical path;
- a cycle or duplicate canonical path is blocking.

The reconstructed property nodes are then traversed by the existing
provider-neutral node normalizer. The normalizer no longer appends every
flattened property as a direct child.

### 6.6 Nested instances and safety

Materialization is recursive but bounded:

- maintain an active component-key stack;
- reject a component-definition inheritance cycle;
- enforce the existing source node and artifact size constraints;
- do not perform network access;
- do not evaluate strings as code;
- do not follow paths outside the in-memory DSL document.

## 7. Materialization provenance

`design-ir/v2` is a closed public contract. This slice must not add fields to
that schema literal.

Emit a sibling audit artifact:

```text
normalization-provenance.json
schema: normalization-provenance/v1
```

Conceptual contract:

```ts
interface NormalizationValueOrigin {
  targetNodeId: string;
  targetPath: string;
  kind: "instance-value" | "instance-override" | "component-default";
  sourceNodeId: string;
  componentKey?: string;
  componentDefinitionNodeId?: string;
  sourcePropertyPath?: string;
}

interface NormalizationProvenanceV1 {
  schema: "normalization-provenance/v1";
  sourceArtifactId: string;
  values: NormalizationValueOrigin[];
}
```

`targetPath` is a JSON Pointer relative to the normalized `DesignNode`, for
example `/text/value`. Records are emitted only for normalized values, not for
ignored raw fields.

For the acceptance fixture, provenance must prove:

```text
secondary text /text/value → component-default → 4:557
primary text /text/value   → instance-override → 4:599
```

The artifact is deterministic and auditable, but it is not sent into Qwen
context and is not required by component resolution or React generation.

The run index and result summary may expose its relative artifact path and
hash. They must not inline the full provenance document.

## 8. Exact compound projection contract

### 8.1 Versioning

`pixso-map/v1` is closed. Introduce `pixso-map/v2` rather than adding optional
fields under the existing schema literal.

A v2 exact mapping may declare:

```ts
interface ActionGroupProjection {
  kind: "action-group";
  candidate: "button-shape-with-visible-label";
  order: "visual";
  roles: string[];
}
```

Example for the verified Sber `Modal Action` mapping:

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

The pack declares semantic slot order for its known component. It does not
declare node IDs, text values, imports, JSX, selectors, or executable code.

Mappings without `projection` retain the existing opaque exact-boundary
behavior.

### 8.2 Projection algorithm

When exact recognition accepts a mapping with `action-group` projection:

1. Keep the exact boundary as the `actionGroup` manifest node.
2. Search only inside that boundary.
3. Stop descent at the first non-decorative candidate boundary.
4. A candidate must:
   - be visible;
   - have button-like geometry;
   - contain exactly one unambiguous visible label;
   - not overlap another accepted candidate boundary.
5. Sort candidates in visual reading order:
   row by `y`, then `x`; use normalized node ID only as a stable final
   tie-breaker.
6. Assign the declared roles positionally.
7. Build semantic action children using the candidate boundary as
   `layoutSourceNodeId` and both boundary and label nodes as `sourceNodeIds`.
8. Suppress all remaining implementation descendants.

This is bounded semantic projection, not ordinary recursive traversal.

### 8.3 Incomplete projection

The planner must not fabricate missing actions or labels.

If accepted candidate count differs from declared role count:

- emit `SEMANTIC_COMPOUND_PROJECTION_INCOMPLETE`;
- include expected roles, accepted candidate node IDs, and rejected candidate
  reasons in diagnostic evidence;
- mark the diagnostic blocking for normal generation;
- do not silently fall back to the old empty render-only action group.

The existing `GENERATION_RENDER_ONLY_CHILDREN_MISSING` path remains valid for
opaque mappings that explicitly allow it. Once a mapping declares a semantic
projection, incomplete projection is a semantic evidence failure instead of a
render-only placeholder.

### 8.4 Action content and interactions

Each projected action contains:

```json
{
  "kind": "action",
  "role": "secondaryAction",
  "content": {
    "label": "Отмена",
    "text": "Отмена"
  },
  "interactions": [
    {
      "key": "secondaryAction",
      "event": "activate",
      "valueType": "void"
    }
  ]
}
```

`attachActivateInteractions` remains the single interaction-key authority.
Projection supplies semantic nodes, not business handlers.

## 9. Sber Space UI generation result

The existing resolver and composition rules determine concrete components. No
Sber import is added to the semantic planner.

The generated footer is expected to be structurally equivalent to:

```tsx
<ModalFooter>
  <Stack direction="row">
    <Button>Отмена</Button>
    <Button>Подтвердить и закончить</Button>
  </Stack>
</ModalFooter>
```

The exact component exports, props, variants, slot placement, and imports must
come from the verified Sber Space UI catalog and recipes. This specification
does not assert that the illustrative JSX is the package's exact public API.

Generated handlers remain no-op presentation bindings where required by the
existing render-only recipe contract. No close, submit, workflow, or form
behavior is implemented.

## 10. Diagnostics

Add stable diagnostic codes:

| Code | Blocking | Meaning |
| --- | --- | --- |
| `PIXSO_COMPONENT_DEFINITION_AMBIGUOUS` | yes | One instance key resolves to multiple compatible definitions |
| `PIXSO_COMPONENT_INHERITANCE_CYCLE` | yes | Definition traversal repeats an active component key |
| `PIXSO_PROPERTY_IDENTITY_CONFLICT` | yes | One canonical path has incompatible identity |
| `PIXSO_PROPERTY_PATH_INVALID` | yes | A flattened property path is unsafe or malformed |
| `SEMANTIC_COMPOUND_PROJECTION_INCOMPLETE` | yes | Proven semantic children do not satisfy the declared projection |

Messages must identify the owning instance and relevant source node IDs without
embedding the entire raw DSL.

## 11. Testing strategy

### 11.1 Materializer unit tests

Use minimal synthetic DSL fixtures to prove:

1. a missing text value inherits a component default;
2. an explicit instance text overrides the default;
3. `false`, `0`, empty string, empty array, and `null` are not treated as
   missing;
4. plain objects merge recursively and arrays replace atomically;
5. flat property paths reconstruct the correct parent-child hierarchy;
6. source array order does not affect output;
7. raw input is not mutated;
8. ambiguous definitions, identity conflicts, invalid paths, and cycles fail
   with stable diagnostics;
9. provenance distinguishes default and override values.

### 11.2 Semantic-planner unit tests

Prove:

1. an exact boundary without projection remains opaque;
2. an exact `actionGroup` with two labeled button candidates emits two actions;
3. roles follow pack-declared visual order;
4. decorative descendants do not leak into `UiManifest`;
5. zero, one, or ambiguous candidates emit the blocking incomplete-projection
   diagnostic;
6. action interactions are attached once with stable keys;
7. mapping v1 remains loadable and mapping v2 rejects unknown fields.

### 11.3 Repository acceptance fixture

Create or update a pinned, provenance-verified fixture derived from the
persisted Pixso node `4:314`.

Acceptance assertions:

- `DesignIR` contains both effective footer texts;
- the secondary text has component-default provenance;
- the primary text has instance-override provenance;
- `UiManifest` contains `secondaryAction` and `primaryAction`;
- the resolution plan has no footer-related blocker or fallback;
- generated source contains both labels;
- generated source contains no raw Pixso component key or node-specific branch;
- repeated runs have identical artifact hashes.

### 11.4 Verification commands

The implementation plan must identify the repository's focused package tests
and finish with:

```bash
pnpm verify
```

After repository verification, rebuild the portable Qwen bundle and run the
same modal through the installed extension. Compare the direct CLI and Qwen
run artifact hashes for identical inputs.

## 12. Migration and compatibility

- Existing `pixso-map/v1` packs continue to load.
- Existing exact mappings remain opaque unless migrated to
  `pixso-map/v2` with an explicit projection.
- `design-ir/v2` and `ui-manifest/v2` remain unchanged.
- The new provenance document is a sibling run artifact, not an input required
  by existing consumers.
- The old empty `actionGroup` fixture remains valid only for a mapping that
  does not declare projection.
- The Sber mapping for the verified modal action group migrates to v2 in this
  slice.

## 13. Out of scope

This slice does not:

- add modal business logic;
- implement real form state or option loading;
- infer a missing button label;
- project heading descriptions;
- project combobox label, value, or helper text;
- introduce a Pixso-specific field into `UiManifest`;
- change concrete Sber component API facts without library documentation;
- allow packs to execute selectors or JavaScript;
- make Qwen an alternate planner or generator;
- fetch a new Pixso snapshot during deterministic unit tests.

## 14. Completion criteria

The slice is complete only when:

1. component defaults and instance overrides are materialized
   deterministically;
2. property containment is reconstructed from `pathString`;
3. provenance proves the origin of both footer labels;
4. exact `actionGroup` projection emits two design-backed action children;
5. Sber resolution and generation produce both footer actions without an empty
   render-only placeholder;
6. focused tests and `pnpm verify` pass;
7. the portable Qwen bundle is rebuilt;
8. a real Qwen run for Pixso `4:314` succeeds;
9. the direct CLI and Qwen paths remain one canonical workflow;
10. the generated output contains no modal-specific or language-specific
    workaround.
