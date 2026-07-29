# Pixso Keyless Definition Resolution Design

**Date:** 2026-07-29
**Status:** Approved design, implementation not started
**Fixture:** `PqSywlhYgqSRDoWr78IrdA`, node `70:118892`

## 1. Purpose

Allow the Pixso V2 instance materializer to resolve a component definition
when Pixso omits `componentKey` but provides one exact, unique
`componentNormName` shared by the instance and a `SYMBOL` definition.

`componentKey` remains the primary and authoritative identity. The
`componentNormName` fallback is used only when the instance has no non-empty
key. Resolution must block on ambiguity and must never invent a key, select by
traversal order, or use fuzzy property matching.

This slice exists to make the saved `70:118892` fixture pass V2 normalization.
It ends after rerunning baseline planning and reporting the next semantic gap.
It does not add a form recognizer, component mapping, or React generation
support for the fixture.

## 2. Observed Baseline

V1 normalization accepts the saved fixture. The current V2 pipeline fails
before semantic planning:

```text
DESIGN_DSL_UNSUPPORTED
Pixso field left must be a finite number
```

The relevant screen instance is:

```json
{
  "guid": "70:118899",
  "name": "Выбор действий",
  "type": "INSTANCE",
  "componentKey": null,
  "componentNormName": "Component_31_100831"
}
```

The component tree contains its definition:

```json
{
  "guid": "31:100831",
  "name": "Выбор действий",
  "type": "SYMBOL",
  "componentKey": null,
  "componentNormName": "Component_31_100831"
}
```

The instance has a text override without geometry:

```json
{
  "componentId": "4:63130",
  "pathString": "27:101325/4:63130",
  "type": "TEXT",
  "nodeText": "Сообщите сотруднику бизнеса (SecurityDesk) о невозможности дальнейшей обработки сделки\nОна будет остановлена"
}
```

The definition contains the matching property default and geometry:

```json
{
  "componentId": "4:63130",
  "pathString": "4:63130",
  "type": "TEXT",
  "left": 0,
  "top": 20,
  "width": 561,
  "height": 32
}
```

The existing materializer indexes definitions only by a non-empty
`componentKey`. It therefore never selects definition `31:100831` and cannot
collect the exact property default.

A read-only diagnostic experiment assigned the same temporary key to cloned
copies of instance `70:118899` and definition `31:100831`. Without changing
the property merge algorithm, the materializer then produced:

```json
{
  "componentId": "4:63130",
  "pathString": "27:101325/4:63130",
  "nodeText": "Сообщите сотруднику бизнеса (SecurityDesk) о невозможности дальнейшей обработки сделки\nОна будет остановлена",
  "left": 0,
  "top": 20,
  "width": 561,
  "height": 32
}
```

This proves that definition selection, not property-path compatibility, is the
missing behavior. Existing exact-path default collection and field merging
already restore the property correctly once the definition is selected.

## 3. Goals

1. Preserve non-empty `componentKey` resolution as the highest-priority
   definition identity.
2. Add exact `componentNormName` resolution only for instances without a
   non-empty key.
3. Restrict fallback candidates to `SYMBOL` definitions with the same
   non-empty norm name.
4. Resolve a keyless definition only when exactly one candidate exists.
5. Reuse the existing exact property-path collection and merge semantics.
6. Preserve field-level normalization provenance without inventing a
   component key.
7. Produce a stable blocking ambiguity error.
8. Extend cycle detection to keyless definition chains.
9. Add a real-fixture regression proving that `70:118892` passes V2
   normalization.
10. Rerun planning after normalization succeeds and report the next semantic
    gap without implementing it in this slice.

## 4. Non-goals

This slice does not:

- add compatible or fuzzy property-path matching;
- infer component identity from `name`, text, geometry, visual similarity, or
  traversal order;
- use `componentNormName` when a non-empty `componentKey` is present;
- create, persist, or synthesize a missing component key;
- add `modal-form`, form-section, form-field, action-choice, or data-table
  recognizers;
- add or change Sber Space UI component mappings or React recipes;
- generate or accept React output for `70:118892`;
- synthesize zero geometry or any other missing design value;
- change explicit override semantics for `false`, `0`, `""`, `[]`, or `null`;
- change array merge semantics;
- mutate saved Pixso source JSON;
- change the public `normalization-provenance/v1` schema;
- add business logic, API integration, state, or application callbacks.

## 5. Definition Identity

### 5.1 Key identity

An instance has key identity when `componentKey` is a non-empty string.

Key identity is resolved exactly as in the current implementation:

1. find definitions with the same `componentKey`;
2. when the instance has `componentNormName`, prefer compatible variants with
   the same norm name;
3. preserve the existing single-candidate fallback and ambiguity behavior.

No norm-only index participates in key identity resolution.

### 5.2 Norm identity

An instance has norm identity only when:

- `componentKey` is absent, null, or an empty string; and
- `componentNormName` is a non-empty string.

A definition is a norm candidate only when:

- its `type` is exactly `SYMBOL`;
- its `componentKey` is absent, null, or an empty string; and
- its `componentNormName` exactly equals the instance norm name.

String comparison is exact and case-sensitive. Names are not normalized again.

### 5.3 No identity

An instance with neither a non-empty key nor a non-empty norm name has no
definition identity. It receives no definition fallback and preserves current
behavior.

## 6. Resolution Algorithm

For each instance:

1. If `componentKey` is a non-empty string, use the existing key resolver and
   stop. Do not consult norm-only candidates.
2. Otherwise, if `componentNormName` is not a non-empty string, return no
   definition.
3. Look up keyless `SYMBOL` definitions with the same exact norm name.
4. Resolve based on candidate count:

   - zero candidates: return no definition;
   - one candidate: use it;
   - two or more candidates: throw
     `PIXSO_COMPONENT_DEFINITION_AMBIGUOUS`.

Lookup precedence is:

```text
non-empty componentKey
  >
unique exact keyless componentNormName
  >
no definition
```

Candidate traversal order must never resolve ambiguity.

## 7. Definition Indexing

Definition indexing exposes two immutable views:

1. keyed `SYMBOL` definitions by non-empty `componentKey`;
2. keyless `SYMBOL` definitions by non-empty `componentNormName`.

A definition belongs to exactly one identity index:

- non-empty key → keyed index;
- no non-empty key and non-empty norm name → norm index;
- neither → no identity index.

Definitions are discovered recursively through component-tree `childNode`
arrays, as required for Pixso variant symbols. Non-`SYMBOL` instance records
inside definitions are not indexed as definitions.

Candidates may be sorted for stable diagnostics, but sorting does not make an
ambiguous lookup resolvable.

## 8. Property Materialization

After definition resolution, property behavior is unchanged:

1. collect defaults from the selected definition;
2. resolve defaults by the existing exact canonical property paths;
3. merge the instance property with the matching definition default;
4. reconstruct the flattened property hierarchy;
5. normalize the effective nodes.

No terminal-path, `componentId`, text, or geometry fallback is added.

Existing merge rules remain authoritative:

1. a present instance field wins;
2. a missing instance field inherits the definition field;
3. `false`, `0`, an empty string, an empty array, and explicit `null` are
   present values;
4. supported plain objects merge recursively;
5. arrays are atomic;
6. `childNode`, `props`, `guid`, and definition-root identity are not copied as
   ordinary values;
7. source instances and definitions are not mutated.

For the real fixture:

```text
nodeText → instance override
left     → component default
top      → component default
width    → component default
height   → component default
```

## 9. Ambiguity Error

Key and norm resolution use the existing blocking code:

```text
PIXSO_COMPONENT_DEFINITION_AMBIGUOUS
```

For a norm ambiguity, the message or structured evidence must identify:

- identity kind: `componentNormName`;
- requested norm name;
- number of candidates;
- stable sorted candidate definition node IDs.

The error must not contain an access token, full raw DSL, or arbitrary source
content.

Zero norm candidates do not produce an ambiguity error. They preserve existing
downstream behavior, including `DESIGN_DSL_UNSUPPORTED` when a required field
remains absent.

## 10. Cycle Detection

Cycle detection must cover both identity kinds.

The active-chain identity is namespaced to prevent collisions:

```text
key:<componentKey>\u0000<componentNormName-or-empty>
norm:<componentNormName>
```

When a selected definition contains a nested component instance:

1. resolve the nested instance using the same key-first algorithm;
2. add its namespaced identity to the active chain;
3. throw `PIXSO_COMPONENT_INHERITANCE_CYCLE` if the identity already exists.

A key identity and norm identity with the same textual value are distinct.

## 11. Provenance

The public `normalization-provenance/v1` schema is unchanged.

Keyless definition selection affects how the definition is found, not the
meaning of value origins:

- a field present on both records and selected from the instance is
  `instance-override`;
- a field present only on the instance is `instance-value`;
- a missing instance field inherited from the selected definition is
  `component-default`.

For the real fixture:

```text
/text/value      → instance-override
/geometry/x      → component-default
/geometry/y      → component-default
/geometry/width  → component-default
/geometry/height → component-default
```

`componentDefinitionNodeId` identifies `31:100831`.

`componentKey` is omitted because the original instance and definition do not
contain one. The materializer must not synthesize it solely for provenance.

`sourcePropertyPath` for an instance override remains the instance path.
`sourcePropertyPath` for a component default remains the exact definition
default path selected by the existing collector.

No new provenance kind is introduced.

## 12. Testing Strategy

Implementation follows test-driven development.

### 12.1 Unit regression tests

Add focused materializer tests for:

1. keyed resolution continuing to work unchanged;
2. one exact keyless norm candidate selecting its definition;
3. a non-empty key taking precedence over a conflicting norm-only candidate;
4. two keyless definitions with the same norm name throwing
   `PIXSO_COMPONENT_DEFINITION_AMBIGUOUS`;
5. a missing or empty norm name producing no definition fallback;
6. a different norm name not matching;
7. keyed definitions being excluded from the norm-only index;
8. non-`SYMBOL` records being excluded from both definition indexes;
9. keyless inheritance cycles throwing
   `PIXSO_COMPONENT_INHERITANCE_CYCLE`;
10. instance text overriding the selected keyless definition default while
    missing geometry inherits it;
11. field-level provenance distinguishing `instance-override` from
    `component-default` without a synthesized component key;
12. explicit `0`, `false`, `""`, `[]`, and `null` remaining overrides;
13. source instance and definition objects remaining unchanged;
14. output and ambiguity diagnostics remaining deterministic under definition
    traversal permutations.

Each behavior-changing test must be observed failing before its implementation
is added.

### 12.2 Real-fixture normalization regression

Extend offline acceptance for:

```text
fixtures/pixso/node-70-118892/source.json
```

The regression must prove:

- `normalizePixsoDesignV2WithProvenance` returns without throwing;
- `rootNodeId` is `70:118892`;
- the normalized tree contains the materialized property derived from
  `4:63130`;
- `text.value` contains the instance text;
- `geometry.x`, `geometry.y`, `geometry.width`, and `geometry.height` are
  finite;
- provenance contains the expected instance override for text;
- provenance contains component defaults tied to definition `31:100831`;
- provenance does not invent a component key;
- the fixture still passes its existing V1 normalization assertions;
- the existing `4:314` V2 acceptance remains unchanged.

The test must not update the saved source fixture.

### 12.3 Repository verification

Before completion:

```bash
pnpm verify
pnpm build:qwen-extension
pnpm verify:qwen-extension-bundle
pnpm test:qwen-extension
```

If the runtime bundle changes, it is rebuilt, verified, and committed
separately from the source change.

## 13. Post-fix Baseline

After the normalization regression is green, rerun the current V2 planning
pipeline for `70:118892` through `sber-space-ui`.

Record:

- normalized node count;
- semantic manifest roles and source node IDs;
- resolution counts;
- first blocking or fallback diagnostic;
- the first missing semantic structure visible in the saved design.

This rerun is discovery output, not authority to extend the slice. The next
semantic recognizer or projector receives its own design and implementation
plan.

## 14. Acceptance Criteria

The slice is complete only when:

1. non-empty `componentKey` remains authoritative;
2. norm fallback runs only when no non-empty key exists;
3. norm candidates are exact keyless `SYMBOL` definitions;
4. one norm candidate resolves and multiple candidates block;
5. no fuzzy property matching or value synthesis is introduced;
6. existing exact property collection and merge semantics remain unchanged;
7. keyless cycle detection is deterministic;
8. explicit falsy and null values remain overrides;
9. source JSON is not mutated;
10. field-level provenance remains correct without an invented key;
11. `70:118892` passes V2 normalization offline;
12. `4:314` and V1 compatibility tests remain green;
13. complete repository and Qwen extension verification pass;
14. the next semantic gap is reported but not implemented.

## 15. Expected Follow-up

The next work is expected to be a semantic recognizer or compound projector
for the long sectional form. Its exact scope must be selected from the
post-fix manifest and resolution diagnostics rather than assumed in advance.
