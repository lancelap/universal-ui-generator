# Universal UI Generator — Design

**Status:** approved

**Date:** 2026-07-26

**Initial source provider:** Pixso Remote MCP

**Initial output target:** React + TypeScript

**Initial design-system packs:** Sber Space UI and Material UI

## 1. Purpose

`universal-ui-generator` converts a selected design node into a deterministic,
inspectable plan for implementing that interface with a chosen design system.

The product must:

- avoid passing a complete Pixso DSL to a language model;
- preserve exact visual facts such as geometry, layout, borders, fills, radii,
  typography, and component references;
- separate visual facts from semantic interpretation;
- resolve semantic UI needs only through verified design-system knowledge;
- support multiple design systems without duplicating the design parser;
- make every intermediate result available as versioned JSON;
- preserve uncertainty and blocking failures instead of inventing components or
  imports;
- eventually become the canonical source for shared UI rules currently split
  between `gigacode-extension` and `gigacode-mcp`.

The first implementation slice ends at `ResolutionPlan`. It does not generate
production TSX, use an LLM, or expose an MCP server.

## 2. Product boundaries

### In scope for Slice 1

- TypeScript monorepo and ordinary CLI;
- Pixso URL parsing and DSL retrieval;
- content-addressed local cache;
- deterministic Pixso-to-`DesignIR` normalization;
- bounded `DesignSummary`;
- deterministic recognition of a small semantic UI vocabulary;
- validation and loading of two design-system packs;
- component resolution for Sber Space UI and Material UI;
- structured diagnostics;
- offline golden and integration fixtures;
- inspectable run artifacts.

### Explicitly out of scope for Slice 1

- production React/TSX generation;
- model-assisted interpretation;
- an MCP server;
- browser rendering and screenshot comparison;
- wholesale migration of existing rule repositories;
- a database, vector store, daemon, or separate runtime;
- Figma or other design providers;
- Vue, Angular, or non-React output targets.

These are later isolated slices and must reuse the same contracts and core
functions.

## 3. Repository structure

```text
universal-ui-generator/
├── apps/
│   └── cli/
├── packages/
│   ├── contracts/
│   ├── design-context/
│   ├── provider-pixso/
│   ├── design-normalizer/
│   ├── semantic-planner/
│   ├── component-catalog/
│   ├── component-resolver/
│   ├── rule-engine/                 # introduced by the rules migration slice
│   ├── pattern-registry/            # introduced by the rules migration slice
│   └── generator-react/             # introduced by the React slice
├── rules/
│   ├── core/                        # introduced by the rules migration slice
│   └── patterns/                    # introduced by the rules migration slice
├── design-system-packs/
│   ├── sber-space-ui/
│   └── material-ui/
├── fixtures/
│   └── pixso/
├── examples/
│   ├── sber-space-ui/
│   └── material-ui/
└── docs/
    └── superpowers/
        └── specs/
```

Only directories needed by a slice should be created by that slice. The tree
above is the target architecture, not a requirement to create empty
placeholders.

## 4. Data flow

```text
Pixso URL
  → DesignSnapshot
  → DesignIR
  → DesignSummary
  → UiManifest
  → ResolutionPlan
  → React files (later slice)
```

Every arrow is a separately testable transformation with a versioned JSON
contract. A consumer can save the output of any stage and rerun later stages
without contacting Pixso again.

### Core invariant

The contracts answer distinct questions:

| Contract | Question |
|---|---|
| `DesignSnapshot` | What source artifact did we retrieve? |
| `DesignIR` | What is factually drawn? |
| `DesignSummary` | What bounded overview can a consumer inspect? |
| `UiManifest` | What does the interface mean? |
| `ResolutionPlan` | How should the selected design system implement it? |

No contract may combine all five concerns.

## 5. Package responsibilities

### `packages/contracts`

Owns TypeScript types and closed JSON Schemas for all public artifacts,
diagnostics, design-system packs, and generation runs.

It must not depend on Pixso, React, Sber Space UI, Material UI, CLI code, or
filesystem layout.

### `packages/design-context`

Owns source artifact storage and bounded inspection:

- content-addressed storage for raw DSL;
- opaque `artifactId`;
- source metadata and hashes;
- bounded node, text, style, component, and visible-tree queries;
- stable pagination and limits.

Public contracts never contain the absolute cache path. Internal storage can
change without invalidating artifacts.

### `packages/provider-pixso`

Owns all Pixso-specific knowledge:

- Pixso URL parsing;
- `documentId` and `item-id` extraction;
- Remote MCP invocation;
- response validation;
- creation of `DesignSnapshot`;
- provider-specific diagnostic mapping.

Future providers such as Figma must be sibling packages and must not require
changes to the downstream contracts.

### `packages/design-normalizer`

Deterministically converts the raw Pixso DSL into provider-neutral `DesignIR`.

It extracts:

- node identity, type, name, hierarchy, visibility, and clipping;
- absolute and relative geometry;
- layout direction, alignment, padding, and gaps;
- text and typography;
- fills, borders, per-corner radii, opacity, and shadows;
- component and variant references;
- variables and style references.

It contains no LLM and performs no semantic guesses. The same DSL must produce
byte-identical output after stable serialization.

### `packages/semantic-planner`

Converts `DesignIR` into a design-system-neutral `UiManifest`.

Evidence precedence:

1. exact verified Pixso component or variant mapping;
2. deterministic structural recognizer;
3. bounded model-assisted suggestion in a later slice.

Slice 1 implements only levels 1 and 2.

### `packages/component-catalog`

Loads and validates a selected design-system pack. It exposes verified
components, exports, props, capabilities, composition rules, semantic roles,
tokens, icon mappings, provenance, and fallback policy.

It neither interprets the design nor writes React.

### `packages/component-resolver`

Converts each semantic need into exactly one auditable decision:

- `reuse`: one verified design-system component;
- `compose`: a verified composition of components;
- `fallback`: a local implementation explicitly permitted by the pack;
- `blocked`: no safe permitted resolution.

It must not invent an import. Every concrete package and export comes from a
validated catalog and, when a target project is supplied, fresh target proof.

### `packages/generator-react`

This is a later-slice package. It mechanically converts an approved
`ResolutionPlan` into TSX, CSS Modules, explicitly permitted fallback
components, imports, and a generation report.

It must not call Pixso or choose design-system components.

### `apps/cli`

The CLI composes the packages without reimplementing them. Individual stage
commands and composite commands call the same library functions.

## 6. Core contracts

### 6.1 `DesignSnapshot`

```json
{
  "schema": "design-snapshot/v1",
  "artifactId": "pixso_WSLukjrKancvZG0zbaMnyA_4-314_a81f9c",
  "provider": "pixso",
  "source": {
    "documentId": "WSLukjrKancvZG0zbaMnyA",
    "nodeId": "4:314",
    "url": "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314"
  },
  "retrievedAt": "2026-07-26T10:30:00.000Z",
  "content": {
    "format": "pixso-node-dsl",
    "version": "2.1.15",
    "sha256": "a81f9c...",
    "byteLength": 3145728
  }
}
```

The raw DSL is a separately stored content-addressed artifact.

### 6.2 `DesignIR`

`DesignIR` is a normalized node map. A visually bordered container retains the
exact drawing facts:

```json
{
  "id": "4:314",
  "type": "frame",
  "name": "Modal",
  "visible": true,
  "children": ["4:315", "4:320"],
  "geometry": {
    "x": 0,
    "y": 0,
    "width": 600,
    "height": 267
  },
  "layout": {
    "mode": "vertical",
    "gap": 24,
    "padding": {
      "top": 24,
      "right": 24,
      "bottom": 24,
      "left": 24
    },
    "alignItems": "stretch"
  },
  "appearance": {
    "fills": [
      {
        "type": "solid",
        "color": "#FFFFFF",
        "opacity": 1
      }
    ],
    "borders": [
      {
        "position": "inside",
        "width": {
          "top": 1,
          "right": 1,
          "bottom": 1,
          "left": 1
        },
        "style": "solid",
        "color": "#D0D5DD",
        "opacity": 1
      }
    ],
    "radii": {
      "topLeft": 12,
      "topRight": 12,
      "bottomRight": 12,
      "bottomLeft": 12
    },
    "shadows": []
  },
  "source": {
    "provider": "pixso",
    "nodeId": "4:314"
  }
}
```

Values in real output must come from the source DSL. A semantic planner or
generator may not fill missing visual values by pretending they were observed.

### 6.3 `DesignSummary`

The summary is a bounded navigation artifact containing:

- root identity and size;
- node statistics;
- a depth-limited outline;
- notable text and component nodes;
- truncation state and stable cursors.

Its default serialized size limit is 20 KB. Detailed consumers query the
design-context service by `artifactId` and selector instead of requesting the
entire `DesignIR`.

### 6.4 `UiManifest`

The manifest is design-system-neutral:

```json
{
  "schema": "ui-manifest/v1",
  "sourceArtifactId": "pixso_WSLukjrKancvZG0zbaMnyA_4-314_a81f9c",
  "root": {
    "id": "ui_modal_1",
    "kind": "overlay",
    "role": "dialog",
    "sourceNodeIds": ["4:314"],
    "confidence": 1,
    "children": [
      {
        "id": "ui_heading_1",
        "kind": "content",
        "role": "heading",
        "sourceNodeIds": ["4:316"],
        "content": {
          "text": "Переформирование поручения",
          "level": 2
        },
        "confidence": 1
      },
      {
        "id": "ui_submit_1",
        "kind": "action",
        "role": "primaryAction",
        "sourceNodeIds": ["4:341"],
        "content": {
          "label": "Подтвердить и закончить"
        },
        "confidence": 1
      }
    ]
  },
  "diagnostics": []
}
```

It does not contain Sber or Material UI imports.

### 6.5 `ResolutionPlan`

```json
{
  "schema": "resolution-plan/v1",
  "target": {
    "framework": "react",
    "language": "typescript",
    "designSystem": "sber-space-ui"
  },
  "nodes": [
    {
      "manifestNodeId": "ui_submit_1",
      "decision": "reuse",
      "binding": {
        "componentId": "base.Button",
        "package": "@sber-space-ui/button",
        "export": "Button",
        "exportKind": "named"
      },
      "confidence": 1,
      "evidence": [
        {
          "kind": "semantic-role",
          "value": "primaryAction"
        }
      ],
      "catalogEvidence": {
        "status": "verified",
        "packVersion": "1.0.0"
      }
    }
  ],
  "diagnostics": [],
  "summary": {
    "reuse": 1,
    "compose": 0,
    "fallback": 0,
    "blocked": 0
  }
}
```

Target-project verification is added when a target project is supplied. A
catalog entry alone never proves that an export exists in an arbitrary installed
version.

## 7. Design-system pack

Each pack is a declarative, versioned unit:

```text
design-system-packs/<pack>/
├── pack.json
├── catalog.json
├── semantic-policy.json
├── pixso-map.json
├── composition-rules.json
├── tokens.json
├── rules/
├── icons/
├── documentation/
├── verification/
└── examples/
```

The pack owns:

- component IDs;
- concrete imports and export kinds;
- semantic role mappings;
- props and capabilities;
- required and optional composition closure;
- form adapters;
- Pixso component mappings;
- token definitions;
- icon exports;
- documentation provenance;
- resolution and fallback policy;
- pack-specific diagnostics.

### Fallback policy

`fallback` is not globally permitted. Each pack declares allowed decisions for
each semantic role.

For Sber Space UI, unresolved primary actions must not silently become raw
`<button>` elements. Project-only compound components such as an upload surface
remain blocking when no verified project component is available.

Material UI can permit different composition and fallback choices while
consuming the same `UiManifest`.

### Icons

Icons use a separate resolution contract. Semantic patterns produce an
`iconHint`; the selected pack resolves that hint to a verified icon package and
export. Fixture paths or guessed imports are never accepted as proof.

## 8. Semantic recognition

Recognition uses evidence in this order:

1. exact component or variant mapping;
2. deterministic structural recognizers;
3. bounded model-assisted interpretation in a later slice.

An exact mapping has confidence `1`. Structural recognition reports its score
and individual evidence.

Default handling:

| Confidence | Behavior |
|---|---|
| `1.00` | exact verified mapping |
| `0.85–0.99` | continue automatically |
| `0.60–0.84` | continue with warning |
| below `0.60` | block |

Thresholds are configuration, but confidence and evidence always remain in the
artifact.

### Choosing the extension layer

A blocked design does not automatically mean that the provider parser must be
changed. The first investigation must locate the earliest layer that lost or
failed to interpret the required evidence:

| Observed gap | Owning layer | Required change |
| --- | --- | --- |
| A fact present in the source is absent or incorrect in `DesignIR` | provider materializer or normalizer | Preserve the fact through a provider-neutral contract |
| Geometry, text, appearance, and hierarchy are present, but their UI meaning is not recognized | primitive or compound semantic recognizer | Add deterministic structural recognition for the whole pattern class |
| The semantic role is correct, but no library component or composition is selected | design-system pack, catalog, policy, or render recipe | Add verified library knowledge and resolution rules |
| The project exposes a preferred wrapper or forbids direct library imports | project scan and effective component catalog | Add project facts, explicit mappings, and policies without changing design interpretation |
| Evidence is genuinely insufficient or ambiguous | annotation boundary or planning diagnostics | Require an explicit annotation or remain `blocked` |

The extension must repair the earliest incorrect boundary. Downstream code
must not compensate for information that an upstream contract lost. Likewise,
the normalizer must not acquire UI-library or business semantics merely
because a later recognizer is missing.

Every parser, recognizer, catalog, or recipe change must cover a reusable class
of inputs. The following are forbidden as recognition or repair predicates:

```text
one document ID
one node ID
one user-visible phrase
one designer layer name
one fixture path
```

A source component identity may be retained as provenance and may participate
in an explicit verified mapping. It must not become an undocumented special
case.

The expected long-term behavior is:

```text
new design
  → existing normalizer preserves facts
  → existing primitive and compound recognizers identify known patterns
  → effective catalog selects verified library or project components
  → generator emits code
```

New work is expected only when the design exposes a previously lost source
fact, a genuinely new semantic pattern, a missing design-system recipe, or a
new project policy/component mapping. It is not expected for every new screen.

The Slice 1 semantic vocabulary is:

- dialog;
- heading;
- text;
- text input;
- combobox;
- warning;
- action group;
- primary action;
- secondary action;
- vertical group;
- horizontal group.

## 9. Visual comparison

Semantic correctness and visual fidelity are distinct.

The resolver can select the semantically correct component while recording a
visual token mismatch:

```json
{
  "status": "token-mismatch",
  "differences": [
    {
      "property": "border.radius",
      "designValue": "8px",
      "componentToken": "radius.medium",
      "componentValue": "12px"
    }
  ]
}
```

Small visual differences do not automatically invalidate a semantic component
match. They become explicit diagnostics and, in a later generation slice,
bounded style overrides subject to pack policy.

## 10. Diagnostics and failure behavior

All diagnostics share:

- stable `code`;
- severity;
- blocking flag;
- pipeline stage;
- human-readable message;
- source artifact, source node, and manifest node when available;
- structured evidence;
- safe suggestions.

Initial code families:

```text
PIXSO_URL_INVALID
PIXSO_TOKEN_MISSING
PIXSO_AUTH_FAILED
PIXSO_NODE_NOT_FOUND
PIXSO_REQUEST_FAILED
PIXSO_RESPONSE_INVALID

DESIGN_DSL_UNSUPPORTED
DESIGN_NODE_REFERENCE_MISSING
DESIGN_VALUE_INVALID
DESIGN_IR_SCHEMA_INVALID

SEMANTIC_ROLE_AMBIGUOUS
SEMANTIC_STRUCTURE_UNSUPPORTED
SEMANTIC_CONFIDENCE_TOO_LOW
PATTERN_CONSTRAINT_VIOLATION

DESIGN_SYSTEM_PACK_INVALID
COMPONENT_CATALOG_ENTRY_INVALID
SEMANTIC_POLICY_MISSING
COMPOSITION_CYCLE_DETECTED
RULE_REFERENCE_MISSING

COMPONENT_UNRESOLVED
COMPONENT_CAPABILITY_MISSING
COMPONENT_COMPOSITION_INCOMPLETE
COMPONENT_EXPORT_UNVERIFIED
COMPONENT_EXPORT_MISMATCH
NATIVE_FALLBACK_FORBIDDEN
ICON_UNRESOLVED
```

Blocking diagnostics stop downstream generation. A caller may still inspect all
artifacts produced before the failure.

## 11. Run artifacts and CLI

Each invocation creates an inspectable run:

```text
.uig/runs/<run-id>/
├── run.json
├── snapshot.json
├── design-ir.json
├── design-summary.json
├── ui-manifest.json
├── resolution-plan.<pack>.json
└── diagnostics.json
```

Raw DSL is deduplicated under:

```text
.uig/cache/sha256/<hash>
```

Initial CLI surface:

```bash
uig fetch <pixso-url>
uig normalize <artifact-id>
uig plan --url <pixso-url> --design-system <pack>
uig plan --snapshot <artifact-id> --design-system <pack>
uig inspect --artifact <artifact-id> --node <node-id> --include <selectors>
uig pack validate <pack-path>
```

A future `uig generate` command composes the same library functions after the
React generator exists.

## 12. Rules migration design

The new project will eventually become the canonical source for the UI rules
currently split between:

- `/Users/danilel/dev/gigacode-extension/agents/ui`;
- `/Users/danilel/dev/gigacode-mcp/resources/sber-space-ui`.

Migration is a separate slice after the initial contracts and resolver work.

### Rule layers

#### Universal core rules

Design-system-neutral generation, layout, spacing, color, payload, and
component-resolution boundaries move to `rules/core`.

#### Semantic patterns

Modal forms, filters, tables, tabs, side pages, panels, radio groups, and
synced-row matrices move to `rules/patterns`. These rules express regions,
ordering, conditions, semantic needs, and stop conditions without npm imports.

#### Design-system rules

The existing Sber manifest, catalog, semantic policy, Pixso mappings,
documentation, concrete component rules, compositions, examples, and verified
imports form `design-system-packs/sber-space-ui`.

#### Project overlays

Team- or project-specific components remain higher-precedence overlays. They do
not become fake base-library components.

#### Legacy workflow

Agent-specific file-reading order, `patternShardsRead`, old handoffs, concrete
MCP tool names, and historical temporary-file conventions are not runtime rules
of the new generator. They can remain migration evidence or compatibility
documentation.

### Executable rule format

Where practical, a rule has:

```text
rule.json — machine-checkable condition and diagnostic
rule.md   — explanation, examples, and human/model guidance
```

Pure guidance is labeled as guidance; it must not appear to be an enforced
validator.

### Migration inventory

Every source file receives a tracked record:

```json
{
  "source": "gigacode-extension/agents/ui/contracts/spacing-dsl.md",
  "classification": "core",
  "targetRuleId": "core.layout.spacing-dsl",
  "migrationStatus": "converted",
  "contentHash": "sha256:...",
  "notes": []
}
```

Classifications are:

- `core`;
- `pattern`;
- `design-system`;
- `project-overlay`;
- `legacy-workflow`;
- `obsolete`;
- `conflict`.

No original canonical copy is removed until equivalence checks pass and the old
consumer has switched to a versioned artifact produced by this repository.

### Final ownership

After migration:

```text
universal-ui-generator
  → versioned universal rule artifact for gigacode-extension
  → versioned Sber pack artifact for gigacode-mcp
```

The old repositories consume built, versioned artifacts instead of maintaining
independent editable copies.

## 13. Testing

### Contract tests

- accept valid fixtures;
- reject missing required fields;
- reject unknown fields in closed schemas;
- enforce explicit schema versions;
- preserve stable diagnostic codes.

### Golden normalizer tests

Saved Pixso DSL is normalized and compared byte-for-byte with an expected
stable `DesignIR`.

### Recognizer tests

Small fixtures cover each supported semantic role plus ambiguity, hidden nodes,
decorative containers, and compound components.

### Resolver tests

The same `UiManifest` is resolved through both Sber Space UI and Material UI.
Tests cover different imports, different compositions, pack-specific fallback,
blocked exports, and absence of invented components.

### Offline integration fixtures

The initial fixtures are based on the previously inspected Pixso nodes:

- `WSLukjrKancvZG0zbaMnyA`, node `4:314`: small modal;
- `WSLukjrKancvZG0zbaMnyA`, node `6:12547`: modal with form and table;
- `PqSywlhYgqSRDoWr78IrdA`, node `70:118892`: long sectional form.

Normal tests do not require network access or a Pixso token. A separate opt-in
live smoke test verifies the provider against Pixso.

### Migration tests

- complete source-file inventory;
- source hashes;
- missing-reference detection;
- preserved diagnostic codes;
- old/new resolution equivalence fixtures;
- verified Sber imports;
- no unresolved duplicate canonical ownership.

The repository-level verification command is `pnpm verify` and must run format
checking, type checking, unit tests, contract tests, golden tests, and offline
integration tests.

## 14. Slice 1 acceptance criteria

Slice 1 is complete only when:

1. The CLI accepts a real Pixso URL with `item-id`.
2. Raw DSL is stored once by content hash.
3. Identical DSL produces byte-identical stable `DesignIR`.
4. The default `DesignSummary` remains within 20 KB.
5. The initial semantic vocabulary is recognized with evidence.
6. One `UiManifest` resolves through both initial design-system packs.
7. The resolver never invents an import.
8. A forbidden fallback creates a blocking diagnostic.
9. Every intermediate JSON artifact can be inspected.
10. Normal tests run without Pixso, network access, or a token.
11. No LLM, MCP server, or production TSX generator exists in this slice.
12. `pnpm verify` passes.

## 15. Planned follow-up slices

1. **Slice 1:** Pixso to deterministic `ResolutionPlan`.
2. **Slice 2:** React/TypeScript generator.
3. **Slice 3:** universal and Sber rule migration.
4. **Slice 4:** target React project component scan and compatibility proof.
5. **Slice 5:** browser rendering and visual comparison.
6. **Slice 6:** thin MCP adapter over the same package functions.
7. **Slice 7:** bounded model-assisted semantic interpretation.

Each slice requires its own focused implementation plan and verification. Later
slices may refine versioned contracts through explicit migrations, but may not
collapse the separation between design facts, semantics, and concrete
component resolution.
