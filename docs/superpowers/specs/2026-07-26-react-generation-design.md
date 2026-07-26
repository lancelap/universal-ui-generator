# Slice 2 React Generation Design

**Date:** 2026-07-26  
**Status:** approved design, awaiting written-spec review  
**Repository:** `/Users/danilel/Documents/Codex/universal-ui-generator`

## 1. Outcome

Slice 2 adds a deterministic React/TypeScript artifact compiler. It converts an
approved semantic manifest and resolution plan into an isolated source bundle:

```text
DesignIR + UiManifest + ResolutionPlan + validated design-system pack
                                  ↓
                       ReactGenerationModel
                                  ↓
                    TSX + CSS Modules + report
```

The generated files are written under the source run:

```text
.uig/runs/<run-id>/generated/
├── <ComponentName>.tsx
├── <ComponentName>.module.css
├── fallbacks/
│   ├── Generated<Role>.tsx
│   └── Generated<Role>.module.css
└── generation-report.json
```

Slice 2 generates presentation code and typed integration points. Business
logic, data fetching, form orchestration, validation, API contracts, project
mutation, dependency installation, target-project typechecking, browser
rendering, and visual comparison remain separate later slices.

## 2. Approved decisions

The user approved these decisions during design review:

1. Output is an isolated bundle under `.uig/runs/<run-id>/generated/`.
2. Any blocked resolution prevents TSX and CSS generation.
3. Generated components are presentation-first and contain no business logic.
4. Layout is transferred by default; appearance overrides are pack-controlled.
5. JSX usage is described by validated JSON render recipes in each pack.
6. Packs contain data only; they cannot execute JavaScript or arbitrary JSX.
7. Slice 2 proves deterministic source and syntax correctness.
8. Target-project typechecking is explicitly reported as `not-run`.
9. Pixso Auto Layout becomes normal flow layout.
10. Absolute positioning requires an explicit normalized design fact.
11. The generator is a pure artifact compiler, not a collection of
    design-system adapters or pattern-specific generators.

## 3. Scope

### 3.1 In scope

- versioned React-generation contracts;
- versioned contract migrations required for explicit interactions and layout
  positioning;
- declarative render recipes;
- declarative style policy;
- `packages/generator-react`;
- a typed intermediate React generation model;
- deterministic TypeScript/JSX AST emission;
- deterministic CSS Modules emission;
- explicitly permitted fallback components;
- a generation report;
- `uig generate --run <run-id>`;
- offline unit, contract, golden, and CLI integration tests;
- Sber Space UI and Material UI generation goldens from one complete manifest;
- honest blocked reports for the current real `4:314` fixture.

### 3.2 Out of scope

- Pixso retrieval changes unrelated to required contract migrations;
- LLM or Qwen assistance;
- a new MCP server;
- direct writes into a user React project;
- project component scanning;
- dependency installation in a target project;
- target-project TypeScript or bundler validation;
- runtime preview applications;
- browser rendering or screenshots;
- visual-diff scoring;
- API clients, queries, mutations, state machines, or domain models;
- automatic form libraries and validation;
- broad pattern and rule migration from legacy repositories;
- guessing semantic children missing from `UiManifest`.

## 4. Architecture

### 4.1 Package boundary

Add:

```text
packages/generator-react/
├── package.json
└── src/
    ├── validate-generation-input.ts
    ├── build-react-generation-model.ts
    ├── build-import-model.ts
    ├── build-props-model.ts
    ├── place-composition-slots.ts
    ├── build-style-model.ts
    ├── emit-tsx.ts
    ├── emit-css-module.ts
    ├── validate-generated-source.ts
    ├── generate-react-bundle.ts
    └── index.ts
```

The package may depend on:

- `@uig/contracts`;
- the loaded-pack interface from `@uig/component-catalog`;
- TypeScript Compiler API;
- Node standard-library hashing and text primitives.

It must not depend on:

- `@uig/provider-pixso`;
- raw Pixso DSL types;
- network clients;
- the CLI;
- a target application;
- Sber- or MUI-specific source modules.

### 4.2 Pipeline

```text
validated input artifacts
        ↓
precondition and cross-artifact validation
        ↓
manifest/resolution join
        ↓
recipe and composition lowering
        ↓
ReactGenerationModel
        ↓
TSX AST emitter + typed CSS emitter
        ↓
source syntax validation
        ↓
stable file hashes + generation report
        ↓
atomic generated-directory installation
```

Each stage has one responsibility and a focused test surface.

### 4.3 Non-authority rule

The generator has no component-resolution authority. It cannot:

- select another catalog candidate;
- replace `blocked` with fallback;
- change `reuse` into `compose`;
- invent a package, export, prop, token, callback, slot, or semantic child;
- inspect raw DSL to compensate for missing semantic information.

## 5. Contract migrations

Closed versioned schemas must not gain new behavior under an unchanged schema
literal. Slice 2 therefore introduces new versions and keeps the existing v1
schemas readable for historical fixtures.

### 5.1 `design-ir/v2`

`DesignNode` gains optional explicit positioning:

```ts
interface LayoutPosition {
  mode: "flow" | "absolute";
  inset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}
```

Rules:

- the normalizer writes `absolute` only when Pixso provides a confirmed
  positioning/constraint fact;
- ordinary coordinates do not imply absolute positioning;
- absent positioning means normal flow;
- inset values are normalized finite numbers;
- incomplete or contradictory absolute facts produce a normalization
  diagnostic rather than geometry inference.

The normalizer emits `design-ir/v2`. Existing `design-ir/v1` readers and
fixtures remain available for migration tests.

### 5.2 `ui-manifest/v2`

`UiNode` gains:

```ts
interface UiInteraction {
  key: string;
  event: "activate" | "change";
  valueType: "void" | "string" | "boolean" | "number";
}
```

and an explicit layout anchor:

```ts
layoutSourceNodeId: string;
interactions?: UiInteraction[];
```

`layoutSourceNodeId` must be present in `sourceNodeIds` and in the referenced
`DesignIR`. It removes the need for the generator to guess which source node
controls layout.

Semantic planning owns interaction creation. The generator does not infer an
event from label text or semantic role. An action without an `activate`
interaction renders without a callback only when its recipe permits that
state; otherwise generation is incomplete.

### 5.3 `resolution-plan/v2`

The existing `sourceManifestId` is insufficient to prove an exact join because
it currently carries the design artifact ID. V2 records immutable source
references:

```ts
interface ResolutionSourceReference {
  artifactId: string;
  schema: "design-ir/v2" | "ui-manifest/v2";
  sha256: string;
}

interface ResolutionPlanV2 {
  schema: "resolution-plan/v2";
  source: {
    designIr: ResolutionSourceReference;
    uiManifest: ResolutionSourceReference;
  };
  target: {
    framework: "react";
    language: "typescript";
    designSystem: string;
    designSystemVersion: string;
    packSha256: string;
  };
  nodes: ResolutionNode[];
  diagnostics: Diagnostic[];
  summary: ResolutionSummary;
}
```

The resolver computes hashes from stable serialized inputs and the validated
pack. The generator recomputes and verifies them.

### 5.4 `design-system-pack/v2`

V2 adds two required files:

```ts
files: {
  catalog: string;
  semanticPolicy: string;
  pixsoMap: string;
  compositionRules: string;
  tokens: string;
  verification: string;
  reactRenderRecipes: string;
  reactStylePolicy: string;
}
```

The loader may still read v1 for Slice 1 artifact inspection. React generation
requires v2.

### 5.5 Historical-run behavior

Slice 2 does not rewrite existing run artifacts in place. `uig generate` given
a v1 run returns `GENERATION_INPUT_INVALID` with a suggestion to replay
normalization/planning from the stored raw artifact. The real fixture
acceptance replays the recorded source DSL through the v2 pipeline and stores
new v2 goldens; it does not mutate the committed Slice 1 goldens.

### 5.6 Generation contracts

Add:

- `react-render-recipes/v1`;
- `react-style-policy/v1`;
- `react-generation-report/v1`;
- `react-generation-bundle/v1`.

The in-memory bundle contains generated file bytes and the report. On disk the
report lists only generated source files; it does not hash or list itself.

The pack hash is SHA-256 over stable JSON containing the validated pack
manifest plus each referenced pack document keyed by its manifest field name.
Filesystem paths, modification times, and directory iteration order are not
part of the hash.

## 6. Declarative render recipes

### 6.1 Component recipe

Example:

```json
{
  "componentId": "base.Button",
  "content": {
    "source": "content.label",
    "target": "children"
  },
  "stateProps": [
    {
      "source": "state.disabled",
      "target": "disabled",
      "valueType": "boolean"
    }
  ],
  "eventProps": [
    {
      "source": "activate",
      "target": "onClick"
    }
  ],
  "classNameProp": "className",
  "semanticChildrenPolicy": "forbidden",
  "wrapper": "allowed"
}
```

Imports never appear in recipes. They come only from verified resolution
bindings.

`semanticChildrenPolicy` governs nested `UiNode` children, not text delivered
through the component's JSX `children` content target. Its closed values are
`forbidden`, `optional`, and `required`. For example, a leaf button may accept
its label through JSX children while forbidding nested semantic controls; an
action group requires semantic action children.

### 6.2 Closed source vocabulary

V1 supports only:

```text
content.text
content.label
content.value
state.disabled
state.checked
state.required
state.placeholder
interaction.activate
interaction.change
resolution.defaultProp
```

Recipes cannot contain:

- executable code;
- JSX fragments;
- arbitrary expressions;
- arbitrary JSONPath;
- imports;
- CSS selectors;
- string templates that evaluate at generation time.

Adding a source requires a contract version and tests.

### 6.3 Prop construction

Prop sources have fixed value types. Generation blocks when:

- two sources target the same prop incompatibly;
- a source value has the wrong type;
- a required recipe source is absent;
- a generated external prop name collides with another incompatible prop;
- recipe and resolution default props disagree.

Stable prop ordering is:

1. resolution default props;
2. mapped content props;
3. mapped state props;
4. mapped event props;
5. class/style hook.

### 6.4 External presentation props

Interactions become typed component props. For:

```json
{
  "key": "confirm",
  "event": "activate",
  "valueType": "void"
}
```

the generated interface contains:

```ts
onConfirm?: () => void;
```

`change` callbacks carry the declared primitive value. The generated component
contains no `useState`, `useEffect`, validation, submit orchestration, API
request, or default business handler.

External prop names are `on` plus PascalCase interaction key. Invalid
identifier characters split words; an empty result becomes
`onInteraction<stable-hash-prefix>`. Two different interactions that normalize
to one name must have identical event/value types or generation blocks with
`GENERATION_PROP_CONFLICT`.

## 7. Composition placement

Existing composition rules identify the root and component IDs. Render recipes
add semantic child placement:

```json
{
  "compositionId": "sber-dialog",
  "rootComponentId": "base.Modal",
  "slots": [
    {
      "name": "heading",
      "componentId": "base.ModalHeader",
      "acceptsRoles": ["heading"],
      "cardinality": "zero-or-one"
    },
    {
      "name": "body",
      "componentId": "base.ModalBody",
      "acceptsRemaining": true,
      "cardinality": "many"
    },
    {
      "name": "actions",
      "componentId": "base.ModalFooter",
      "acceptsRoles": ["actionGroup"],
      "cardinality": "zero-or-one"
    }
  ]
}
```

Validation rules:

- every component ID exists in the catalog and composition closure;
- every named composition exists;
- at most one slot accepts remaining children;
- explicit role sets do not overlap unless priorities make placement unique;
- cardinality is enforced;
- every manifest child is placed exactly once;
- unused required composition bindings block generation;
- generator code contains no Sber/MUI slot-name assumptions.

## 8. Style policy

### 8.1 Categories

Style properties are divided into:

```text
layout:
display, flexDirection, gap, padding, width, minWidth, maxWidth,
height, minHeight, maxHeight, alignItems, justifyContent, alignSelf,
flexWrap, position, inset

appearance:
background, color, border, borderRadius, boxShadow, opacity,
fontFamily, fontSize, fontWeight, lineHeight, textAlign
```

The actual contract uses a closed enum, not arbitrary CSS property strings.

### 8.2 Policy shape

Example:

```json
{
  "schema": "react-style-policy/v1",
  "defaults": {
    "layout": {
      "allowed": ["display", "flexDirection", "gap", "padding"]
    },
    "appearance": {
      "allowed": []
    },
    "internalSelectors": false,
    "inlineStyles": false
  },
  "components": [
    {
      "componentId": "base.Field",
      "layout": {
        "allowed": ["width", "minWidth", "maxWidth"]
      },
      "appearance": {
        "allowed": []
      },
      "wrapper": "allowed"
    }
  ],
  "fallback": {
    "layout": "all-supported",
    "appearance": "all-supported"
  }
}
```

V1 forbids:

- internal selectors;
- global selectors;
- descendant selectors targeting library internals;
- `!important`;
- arbitrary inline style objects;
- undeclared CSS custom properties.

### 8.3 Application order

For a visual need:

```text
confirmed public prop
→ confirmed pack token
→ policy-approved CSS Module declaration
→ diagnostic
```

When a recipe confirms a public class-name prop, the generator passes the
class directly. Otherwise a wrapper is allowed only when both recipe and style
policy permit it.

Forbidden appearance overrides normally produce a non-blocking
`GENERATION_STYLE_OVERRIDE_FORBIDDEN` warning because the verified library
component remains usable. They become blocking only when the recipe marks the
style as required for structural correctness.

### 8.4 Fallback styles

Only a `fallback` resolution may generate a local fallback. Its layout and
appearance may use all serializer-supported normalized facts allowed by the
pack fallback policy.

Unsupported paint, missing geometry, or forbidden property types remain
diagnostics. The generator never synthesizes a visually plausible replacement
value.

## 9. Layout translation

### 9.1 Flow layout

`DesignIR.layout` maps directly:

```text
vertical   → display:flex; flex-direction:column
horizontal → display:flex; flex-direction:row
gap        → gap
padding    → padding
alignItems → align-items
justify    → justify-content
wrap       → flex-wrap
```

V1 does not infer grid because the current normalized design contract has no
confirmed grid facts.

### 9.2 Absolute positioning

Absolute CSS requires `DesignIR v2` positioning mode `absolute`.

Rules:

- overlapping geometry is not sufficient evidence;
- ordinary frame coordinates are not sufficient evidence;
- a parent must legally receive `position: relative`;
- design-system overlays are not made absolute automatically;
- unsupported explicit positioning blocks with
  `GENERATION_LAYOUT_UNSUPPORTED`.

## 10. React generation model

The typed intermediate representation is independent of TSX text:

```ts
interface ReactGenerationModel {
  componentName: string;
  imports: ReactImportModel[];
  props: GeneratedPropModel[];
  root: ReactElementModel;
  styles: StyleRuleModel[];
  fallbacks: FallbackComponentModel[];
  diagnostics: Diagnostic[];
}

interface ReactElementModel {
  key: string;
  element: {
    kind: "imported" | "fallback" | "intrinsic";
    localName: string;
    componentId?: string;
  };
  props: ReactPropModel[];
  content?: string;
  children: ReactElementModel[];
  className?: string;
  source: {
    manifestNodeId: string;
    designNodeIds: string[];
  };
}
```

Intrinsic elements are legal only for:

- an approved layout wrapper;
- the inside of an approved fallback;
- an approved presentation root container.

The root component name is PascalCase of the root design-node name after
identifier normalization. If the result is empty or begins with a digit, the
name is `GeneratedNode` plus the first eight hexadecimal characters of the
stable root manifest-node hash. Naming never depends on locale or filesystem
state.

## 11. Import model

Every imported binding comes from `ResolutionPlan`.

Rules:

- identical package/export bindings are deduplicated;
- named imports from one package are grouped;
- default and named imports are represented separately;
- packages and exports use stable ordering;
- local-name collisions get stable aliases derived from component IDs;
- no random values participate;
- an unused resolution binding is an input consistency error.

## 12. Source emission and validation

### 12.1 TSX

Use TypeScript Compiler API:

1. build TypeScript/JSX AST;
2. print using the TypeScript printer;
3. parse the emitted `.tsx`;
4. reject parse diagnostics;
5. verify emitted imports and JSX identifiers against the generation model.

String concatenation is not used to construct JSX. This protects quotes,
braces, angle brackets, multiline content, and Cyrillic text.

The generated module uses the modern JSX transform and does not import React
unless an emitted type or runtime value requires it.

### 12.2 CSS Modules

CSS is emitted from a typed style model.

Rules:

- class names derive from semantic role and manifest node ID;
- declaration order is canonical;
- numbers and units are normalized;
- `!important`, global selectors, and internal descendant selectors are
  impossible in the model;
- only declared pack custom properties are legal;
- byte output is stable.

### 12.3 File granularity

V1 emits:

- one root component TSX file;
- one root CSS Module;
- separate TSX/CSS pairs only for permitted fallbacks;
- one generation report.

It does not split every semantic node into a separate module.

## 13. Bundle and report

The pure package API returns:

```ts
interface ReactGenerationBundle {
  schema: "react-generation-bundle/v1";
  status: "generated" | "blocked";
  sourceRunId: string;
  files: Array<{
    path: string;
    kind: "tsx" | "css-module" | "fallback-tsx" | "fallback-css-module";
    bytes: Uint8Array;
    sha256: string;
    byteLength: number;
  }>;
  report: ReactGenerationReport;
}
```

`files` never contains the report. The CLI serializes `report` separately as
`generation-report.json`.

Example generated report:

```json
{
  "schema": "react-generation-report/v1",
  "status": "generated",
  "sourceRunId": "20260726-...",
  "componentName": "PaymentDetailsModal",
  "designSystem": "sber-space-ui",
  "validation": {
    "inputContracts": "passed",
    "pack": "passed",
    "syntax": "passed",
    "targetTypecheck": "not-run"
  },
  "statistics": {
    "manifestNodes": 7,
    "imports": 5,
    "generatedProps": 2,
    "cssRules": 6,
    "fallbackComponents": 0
  },
  "files": [
    {
      "path": "PaymentDetailsModal.tsx",
      "kind": "tsx",
      "sha256": "...",
      "byteLength": 1240
    }
  ],
  "diagnostics": []
}
```

For a blocked result:

```json
{
  "schema": "react-generation-report/v1",
  "status": "blocked",
  "validation": {
    "inputContracts": "passed",
    "pack": "passed",
    "syntax": "not-run",
    "targetTypecheck": "not-run"
  },
  "files": [],
  "diagnostics": [
    {
      "code": "GENERATION_INPUT_BLOCKED",
      "blocking": true
    }
  ]
}
```

The report does not hash or list itself. Atomic directory comparison includes
the report bytes separately.

## 14. Diagnostics

Initial codes:

```text
GENERATION_INPUT_INVALID
GENERATION_INPUT_BLOCKED
GENERATION_INPUT_INCOMPLETE
GENERATION_RECIPE_MISSING
GENERATION_RECIPE_INVALID
GENERATION_COMPOSITION_AMBIGUOUS
GENERATION_PROP_CONFLICT
GENERATION_IMPORT_CONFLICT
GENERATION_LAYOUT_UNSUPPORTED
GENERATION_STYLE_OVERRIDE_FORBIDDEN
GENERATION_FALLBACK_FORBIDDEN
GENERATION_SOURCE_INVALID
GENERATION_OUTPUT_CONFLICT
```

`GENERATION_STYLE_OVERRIDE_FORBIDDEN` may be non-blocking as defined by style
policy. All other codes above are blocking.

Blocked generation writes only `generation-report.json`; it does not leave TSX,
CSS, or fallback files.

## 15. CLI

Add:

```bash
uig generate --run <run-id>
uig generate --run <run-id> --design-system-pack <path>
```

Behavior:

- run resolution is confined to `.uig/runs`;
- path traversal is rejected;
- the command reads existing artifacts and does not rerun planning;
- built-in packs resolve by the plan target ID;
- an explicit pack must match target ID, version, and hash;
- Pixso and a token are not required;
- no target React project is modified;
- exit `0` means generated or already byte-identical;
- exit `2` means blocked report written;
- exit `1` means invalid command, corrupt run, or system failure.

Slice 2 does not add `plan --generate`.

## 16. Atomic output and idempotence

The complete output is first written to a sibling temporary directory.

- missing destination: atomically install it;
- existing byte-identical destination: succeed without mutation;
- existing different destination: do not overwrite and report
  `GENERATION_OUTPUT_CONFLICT`.

For an output conflict the existing directory, including its existing report,
remains byte-for-byte untouched. The new conflict diagnostic is returned to the
CLI and printed to stderr; it is not written over the evidence whose conflict
it reports.

Run artifacts are immutable evidence. Random UUIDs, timestamps, locale-sensitive
formatting, and filesystem iteration order must not affect generated bytes.

## 17. Testing

### 17.1 Contract tests

- all new schemas accept valid fixtures;
- closed objects reject unknown fields;
- v1 artifacts remain readable;
- v2 hashes and source references are required;
- interaction keys and event value types are validated;
- stable JSON is byte-identical.

### 17.2 Pack tests

- recipes reference existing catalog components;
- every reusable/composed component used for generation has a recipe;
- composition recipe references existing composition rules and closure;
- slot placement is unambiguous;
- style properties belong to supported enums;
- no code, JSX, imports, or internal selectors are representable;
- Sber and MUI v2 packs validate.

### 17.3 Generator unit tests

- exact cross-artifact join;
- missing/duplicate/extra resolution;
- blocked precondition;
- deterministic component names;
- named/default import behavior;
- import deduplication and alias collisions;
- content, state, default, and event prop mapping;
- prop conflicts;
- callback type generation;
- composition placement and cardinality;
- wrapper permission;
- flow layout;
- explicit absolute layout;
- unsupported layout;
- allowed and forbidden appearance overrides;
- fallback generation and rejection;
- hostile text escaping;
- identical input gives byte-identical files and report.

### 17.4 Golden acceptance

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

Resolve the unchanged manifest through Sber and MUI, then generate:

```text
fixtures/react-generation/modal/sber-space-ui/
fixtures/react-generation/modal/material-ui/
```

Assertions:

- imports belong only to the selected pack;
- manifest bytes are unchanged;
- composition structures follow recipes;
- content is equivalent;
- callback interface is semantically equivalent;
- CSS contains no internal selectors or `!important`;
- repeated generation is byte-identical;
- all normal tests are offline.

### 17.5 Real `4:314`

The current real fixture remains honest:

- Sber generation stops on the unresolved combobox;
- MUI generation stops with `GENERATION_INPUT_INCOMPLETE` because the exact
  action-group boundary currently lacks projected semantic action children;
- no partial TSX is accepted;
- blocked reports are golden-tested.

Broad semantic projection and pattern-rule migration remains Slice 3.

### 17.6 CLI integration

Tests use temporary workspaces and stored run fixtures to prove:

- generated directory and report;
- source hashes;
- idempotent second invocation;
- blocked report without TSX;
- output conflict without overwrite;
- no writes outside the run;
- no Pixso client call;
- no token;
- tested README command.

## 18. Acceptance criteria

Slice 2 is complete only when:

1. Generation accepts only consistent versioned source artifacts.
2. A blocked plan never creates TSX or CSS.
3. Every import comes from a resolution binding.
4. Every JSX prop comes from a validated recipe or resolution default.
5. One unchanged manifest generates through Sber and MUI.
6. Generated code contains no business logic, data access, or local state.
7. Confirmed Auto Layout becomes normal-flow CSS.
8. Absolute positioning requires an explicit normalized fact.
9. Style overrides follow pack policy.
10. Fallback files exist only for permitted fallback resolutions.
11. Emitted TSX passes syntax validation.
12. The report states `targetTypecheck: "not-run"`.
13. Repeated generation is byte-identical.
14. Normal verification requires no network, Pixso, or token.
15. No user React project is modified.
16. `pnpm verify` passes twice consecutively.

## 19. Follow-up slices

- Slice 3: universal/Sber rules, semantic projections, patterns, richer content
  and interaction intent.
- Slice 4: target React project scan, installed-component proof, dependency and
  TypeScript compatibility, real target typecheck, controlled project writes.
- Slice 5: browser rendering and visual comparison.
- Slice 6: thin MCP adapter over the same library functions.

Later slices may add capabilities through versioned contracts but must not move
component selection or design interpretation into `generator-react`.
