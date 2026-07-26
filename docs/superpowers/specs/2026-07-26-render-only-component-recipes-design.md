# Render-Only Component Recipes Design Addendum

**Date:** 2026-07-26
**Status:** approved design, awaiting written-spec review
**Repository:** `/Users/danilel/Documents/Codex/universal-ui-generator`
**Extends:** `2026-07-26-react-generation-design.md`

## 1. Outcome

This addendum unblocks presentation-only generation when a verified
design-system component requires harmless runtime-shaped props even though the
generator intentionally does not own application state or business logic.

For the real Pixso node `4:316`, the normalized and semantic artifacts identify
the control as `Autocomplete` with semantic role `combobox`. The canonical Sber
Space UI documentation verifies:

```tsx
import { Autocomplete } from "@sber-space-ui/autocomplete";
```

The first generated presentation may therefore render:

```tsx
<Autocomplete
  mode="dropdown"
  value=""
  options={[]}
  onChange={() => undefined}
/>
```

This is explicitly a render-only adapter. It makes the component structurally
and API-shaped for source generation, but it does not claim to implement
selection, filtering, state ownership, form integration, or data loading.

## 2. Approved decisions

The user approved the following decisions:

1. The first generated modal may use a render-only `Autocomplete`.
2. Business logic and real state remain a later, separate concern.
3. The mapping is declared by the Sber Space UI pack, not hardcoded in the
   generator.
4. Render-only props use a closed data contract; packs cannot inject arbitrary
   JavaScript.
5. The generated report must disclose every render-only prop.
6. A future real interaction or integration binding may replace a render-only
   value without changing component resolution.
7. A structural group whose semantic children are absent may render as an
   empty placeholder only when its recipe explicitly permits that render-only
   state.
8. Every permitted empty structural group produces a non-blocking diagnostic;
   the generator does not invent its missing children.

## 3. Why the component is `Autocomplete`

The decision is grounded in three independent artifacts:

- DesignIR node `4:316` has name `Autocomplete`.
- The semantic manifest assigns role `combobox`.
- The canonical Sber Space UI documentation describes
  `@sber-space-ui/autocomplete` as an input with autocomplete and dropdown
  options.

`base.Field` is not selected because its verified semantic role is
`textInput`. `ValueSelect` is not selected because the source component is
explicitly named `Autocomplete`, and no evidence in the current semantic
artifact says that the control represents single- or multi-selection with
`ValueSelect` semantics.

## 4. Architectural boundary

The existing authority boundary remains unchanged:

```text
UiManifest semantic role
        ↓
design-system semantic policy
        ↓
verified catalog binding
        ↓
validated React render recipe
        ↓
deterministic React model and source
```

The generator does not contain:

- a Sber component name;
- a package-specific prop name;
- a `combobox` special case;
- a raw JavaScript snippet from a pack;
- local React state;
- option data;
- domain behavior.

The pack owns component API facts. The generator owns only the safe lowering of
the versioned recipe contract.

## 5. Contract change

`react-render-recipes/v1` is a closed schema. It must not gain new fields under
the existing schema literal. Introduce `react-render-recipes/v2`.

Each component recipe may contain:

```ts
interface StaticRenderProp {
  target: string;
  value:
    | {
        kind: "literal";
        value: string | number | boolean | null;
      }
    | {
        kind: "empty-array";
      }
    | {
        kind: "noop";
      };
  reason: "render-only";
}
```

The component recipe gains:

```ts
staticProps: StaticRenderProp[];
```

The array is required in v2, including when empty. This keeps recipes explicit
and deterministic.

The v2 `semanticChildrenPolicy` adds one closed value:

```ts
type SemanticChildrenPolicyV2 =
  | "forbidden"
  | "optional"
  | "required"
  | "render-only-optional";
```

`render-only-optional` accepts an empty semantic child list but emits
`GENERATION_RENDER_ONLY_CHILDREN_MISSING` as a warning. It is intended for
structural containers already proven by the manifest. It does not permit the
generator to create inferred children.

### 5.1 Safety

The contract does not accept:

- source-code strings;
- arbitrary expressions;
- object literals;
- non-empty arrays;
- imports;
- identifiers;
- function bodies;
- JSX fragments;
- spread props.

The only executable-shaped value is the built-in `noop` opcode. The emitter,
not the pack, owns its fixed representation.

### 5.2 Lowering

The value kinds lower to the React generation model as:

```text
literal     → existing literal prop model
empty-array → dedicated empty-array prop model
noop        → dedicated noop prop model
```

They emit as:

```text
literal     → normal escaped literal
empty-array → {[]}
noop        → {() => undefined}
```

No string-to-code conversion is permitted.

### 5.3 Precedence

Prop sources have deterministic precedence from lowest to highest:

1. recipe `staticProps`;
2. resolution/catalog defaults;
3. semantic content and state mappings;
4. manifest interaction mappings.

Higher-precedence values replace lower-precedence values with the same target.
This allows a later real interaction binding to replace `noop` without a new
component-resolution decision.

Duplicate targets inside `staticProps` are invalid. A `noop` value is valid
only for a target also declared as an event target by the component recipe.

## 6. Sber Space UI pack changes

Add the verified catalog entry:

```json
{
  "id": "base.Autocomplete",
  "package": "@sber-space-ui/autocomplete",
  "export": "Autocomplete",
  "exportKind": "named",
  "semanticRoles": ["combobox"],
  "capabilities": ["value", "options", "change", "dropdown"],
  "formAdapters": ["controlled"],
  "priority": 100,
  "verified": true,
  "requiredComponentIds": [],
  "optionalComponentIds": [],
  "defaultProps": {},
  "provenance": {
    "kind": "canonical-library-doc",
    "source": "gigacode-mcp/resources/sber-space-ui/library-docs/@sber-space-ui/Autocomplete/Autocomplete.md"
  }
}
```

Add a matching verified component entry to `verification.json`.

Change the Sber `combobox` semantic policy to:

```json
{
  "allowedDecisions": ["reuse", "blocked"],
  "candidateComponentIds": ["base.Autocomplete"],
  "nativeFallback": false,
  "unresolvedCode": "COMPONENT_UNRESOLVED"
}
```

Add the v2 React recipe:

```json
{
  "componentId": "base.Autocomplete",
  "staticProps": [
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
  ],
  "stateProps": [],
  "eventProps": [
    {
      "source": "change",
      "target": "onChange"
    }
  ],
  "semanticChildrenPolicy": "forbidden",
  "wrapper": "allowed",
  "provenance": {
    "kind": "canonical-library-doc",
    "source": "gigacode-mcp/resources/sber-space-ui/library-docs/@sber-space-ui/Autocomplete/Autocomplete.md"
  }
}
```

Every existing Sber and Material UI component recipe migrates mechanically to
v2 with `"staticProps": []`.

The built-in Sber `base.Stack` and Material UI `mui.Stack` recipes use
`"semanticChildrenPolicy": "render-only-optional"`. This allows the real
`4:314` action-group boundary to produce an empty structural placeholder while
the report states that its semantic action children are absent. It does not
create buttons or callbacks.

Changing the pack changes its stable hash. Runs planned against the previous
hash remain historical artifacts and cannot be passed to generation with the
new pack. The live Pixso node must be planned again before generation.

## 7. Honest generation report

`react-generation-report/v1` is also a closed schema. Keep it readable for
historical artifacts and introduce `react-generation-report/v2` for newly
generated results. The v2 report gains a stable `renderOnlyProps` array:

```ts
interface RenderOnlyPropReport {
  manifestNodeId: string;
  componentId: string;
  propNames: string[];
}
```

For node `4:316`, the report contains:

```json
{
  "manifestNodeId": "ui_combobox_4-316",
  "componentId": "base.Autocomplete",
  "propNames": ["mode", "onChange", "options", "value"]
}
```

The names are sorted. No values or source-code fragments are copied into the
report. The presence of render-only props does not make generation blocked, but
it prevents downstream consumers from mistaking the artifact for a completed
behavioral implementation.

For an empty structural group, the v2 report also contains the non-blocking
diagnostic:

```json
{
  "severity": "warning",
  "blocking": false,
  "stage": "react-generation",
  "code": "GENERATION_RENDER_ONLY_CHILDREN_MISSING",
  "message": "Render-only structural group has no semantic children",
  "evidence": {
    "manifestNodeId": "ui_actionGroup_4-317",
    "semanticRole": "actionGroup"
  }
}
```

New bundles use `react-generation-bundle/v2` and contain a v2 report. The
integrity checker accepts both historical v1 and new v2 reports, while the
Slice 2 generator emits only v2.

## 8. Real `4:314` acceptance change

This addendum supersedes only the Sber combobox blocker in section 17.5 of the
base design.

After replanning with the updated Sber pack:

- `ui_combobox_4-316` resolves by `reuse` to `base.Autocomplete`;
- the resolution plan contains no Sber combobox blocker;
- the React model contains the verified named import;
- the generated source contains the render-only props;
- the generation report discloses those props;
- the empty action group renders as a structural placeholder;
- the report contains `GENERATION_RENDER_ONLY_CHILDREN_MISSING` for
  `ui_actionGroup_4-317`;
- no `useState`, option data, form library, API call, or business callback is
  generated.

Any other unresolved node or incomplete semantic boundary not explicitly
covered by a render-only recipe still blocks the whole source bundle according
to the base design. This addendum does not permit partial TSX.

## 9. Qwen boundary

Qwen remains a thin orchestrator over the project workflow. It does not select
the Sber component or synthesize the render-only props.

For the verification iteration, Qwen invokes the normal project commands:

```text
uig plan
uig generate
```

It then reads the stable run and generation reports. A thin Qwen extension/MCP
adapter may later expose the same library operations as a structured
`generated | blocked` result, but that adapter remains outside this contract
change. The generated result must be identical whether invoked directly or
through Qwen.

## 10. Tests

Add focused tests for:

- v1 recipe compatibility and v2 validation;
- v1 report compatibility and v2 report/bundle validation;
- rejection of arbitrary code-shaped values;
- rejection of duplicate static prop targets;
- rejection of `noop` on a non-event target;
- rejection of an unknown semantic-children policy;
- warning emission for an empty `render-only-optional` group;
- no warning when that group contains semantic children;
- deterministic static-prop precedence;
- empty-array and noop generation-model lowering;
- TSX emission of `{[]}` and `{() => undefined}`;
- sorted render-only report entries;
- verified `base.Autocomplete` catalog resolution;
- Sber `combobox` resolution changing from `blocked` to `reuse`;
- pack-hash change invalidating an old resolution plan;
- updated real `4:314` Sber golden;
- byte-identical repeated generation;
- absence of `useState`, external data, and business logic.

## 11. Acceptance criteria

This addendum is complete when:

1. The Sber `combobox` decision is backed by canonical documentation.
2. No Sber- or combobox-specific branch exists in `generator-react`.
3. Packs cannot inject arbitrary JavaScript.
4. Static render props have deterministic precedence.
5. Every static render prop is disclosed in the generation report.
6. The real `4:314` Sber plan no longer blocks on `ui_combobox_4-316`.
7. The generated `Autocomplete` is presentation-only and contains no local
   state or application behavior.
8. Missing action children are disclosed rather than guessed.
9. Existing v1 historical artifacts remain readable.
10. All normal verification remains offline and deterministic.
11. The base Slice 2 acceptance criteria continue to apply.
