# Pixso `6:12547` Form/Table Modal Design

**Date:** 2026-07-27  
**Status:** approved design, awaiting written-spec review  
**Repository:** `/Users/danilel/Documents/Codex/universal-ui-generator`  
**Extends:**

- `2026-07-26-universal-ui-generator-design.md`
- `2026-07-26-react-generation-design.md`
- `2026-07-26-render-only-component-recipes-design.md`

## 1. Outcome

Extend the repository-owned deterministic workflow so the real Pixso modal
`WSLukjrKancvZG0zbaMnyA / 6:12547` can be represented as a compact semantic
form/table hierarchy, resolved through verified Sber Space UI recipes, and
generated as presentation-only React and CSS.

The work has two ordered deliverables:

1. a blocked plan containing unresolved semantic nodes produces a canonical
   blocked generation report instead of failing input validation;
2. structural recognition and Sber recipes reduce the real modal to supported
   semantic components and permit deterministic render-only generation.

Business state, network data, submission, validation, sorting, pagination,
selection, and other application behavior remain out of scope.

## 2. Approved direction

The user approved the following approach:

1. Fix the blocked-generation contract before expanding semantic coverage.
2. Recognize repeated form and table structures at their meaningful component
   boundaries instead of emitting one semantic node per internal Pixso layer.
3. Resolve only through verified design-system pack entries and render recipes.
4. Keep native HTML fallback forbidden for this acceptance path.
5. Keep the generator design-system-neutral.
6. Prove the result through both the direct CLI workflow and the Qwen-hosted
   workflow.

The rejected shortcuts are:

- allowing hundreds of native HTML fallbacks;
- writing a `6:12547`-specific React template;
- adding node-ID exceptions to generic recognizers;
- silently discarding unresolved visible content;
- inventing business behavior to satisfy component APIs.

## 3. Live baseline

The live command:

```bash
pnpm uig -- plan \
  --url "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=6:12547" \
  --design-system sber-space-ui
```

created:

```text
.uig/runs/run_20260727T042827376Z_6-12547
```

The run uses:

```text
source artifact:
pixso_WSLukjrKancvZG0zbaMnyA_6_12547_b8074c43085d

design-ir/v2 sha256:
7e7eb270c3acc92a335ad6c79db2ff42a5778f537b59ebdc9bd26bd227682478

ui-manifest/v2 sha256:
e0466208c35030af3303b08335df26686a2d14d071b47494890003996311b931

sber-space-ui:
2.0.0

pack sha256:
32c631516cf99d85d6f342227e95041ffff41d1c32839a260bc0d8284bc5e53b
```

The root is already recognized correctly:

```text
id: ui_dialog_6-12547
role: dialog
kind: overlay
title: Переотправка исходного сообщения
```

The baseline resolution contains:

```text
compose:   1
reuse:   124
fallback:  0
blocked: 278
```

The 278 blocked nodes are not assumed to represent 278 user-facing controls.
They include repeated internal component layers, text leaves, icon geometry,
table-cell internals, and other descendant details that must be interpreted in
the context of an enclosing component boundary.

## 4. Root-cause finding for blocked generation

The stored resolution for the first unresolved node is internally consistent:

```json
{
  "manifestNodeId": "ui_unresolved_4-12113",
  "semanticRole": "unresolved",
  "decision": "blocked"
}
```

`validateGenerationInput` currently rejects the input before evaluating blocked
status because its semantic join check rejects every manifest node whose role
is `unresolved`, including one with an authorized `blocked` decision.

This ordering makes the documented blocked-report path unreachable for plans
that are blocked by unresolved semantic nodes. The source proof, pack proof,
canonical resolver authorization, exact node join, and stored plan are all
available before the failure.

The fix must distinguish:

```text
valid blocked pair:
manifest role unresolved + resolution role unresolved + decision blocked

invalid pairs:
manifest role unresolved + decision reuse/compose/fallback
manifest role X + resolution role Y
missing resolution
resolution for an unknown manifest node
unauthorized resolution content
```

## 5. Slice A: blocked-generation contract

### 5.1 Validation order

Generation input validation remains fail-closed and follows this order:

1. validate DesignIR, UI Manifest, Resolution Plan, and pack schemas;
2. validate artifact integrity;
3. validate source hashes and artifact IDs;
4. validate pack ID, version, and SHA-256;
5. recompute canonical component resolution;
6. compare stored resolution authorization to the canonical resolution;
7. validate the exact manifest-to-resolution node join;
8. validate semantic role and decision compatibility;
9. determine `ready` or `blocked`;
10. build a generation bundle only for `ready`.

Steps 1-8 reject invalid or tampered inputs. A valid authorized blocker reaches
step 9 and is not reclassified as invalid.

### 5.2 Role/decision compatibility

For a resolved semantic node:

```text
manifest role == resolution semanticRole
decision in reuse | compose | fallback
```

For an unresolved semantic node:

```text
manifest role == unresolved
resolution semanticRole == unresolved
decision == blocked
```

A future contract version may add other explicit blocked semantic roles, but
the generator must not infer them from diagnostic text.

### 5.3 Blocked output

The ordinary command:

```bash
pnpm uig -- generate --run <blocked-run-id>
```

returns structured status `blocked`, exits with code `2`, and atomically writes
only:

```text
generated/generation-report.json
```

It does not write root TSX, CSS, fallback files, or partially generated source.

The report includes:

- run ID;
- source artifact ID and hashes;
- target pack ID, version, and hash;
- `status: "blocked"`;
- `writeStatus`;
- all effective blocking diagnostics;
- `GENERATION_INPUT_BLOCKED`;
- blocked-resolution count;
- zero emitted source files.

Repeated generation from identical blocked inputs is byte-identical.

### 5.4 Security invariants

The blocked path must still reject:

- source or pack hash drift;
- a stored plan that differs from canonical resolver output;
- a missing, duplicated, or extra resolution node;
- a role mismatch;
- `unresolved` authorized as reuse, composition, or fallback;
- output paths escaping the selected run;
- selected-run rebinding during generation;
- partial source publication.

## 6. Slice B: structural semantic recognition

### 6.1 Principle

Recognition operates from meaningful outer boundaries inward:

```text
exact verified component instance
        ↓
compound structural pattern
        ↓
generic layout group
        ↓
content leaf
        ↓
unresolved blocker
```

Once an enclosing exact component or structural pattern claims its internal
presentation nodes, those descendants are recorded as evidence/source nodes
but are not independently emitted as peer semantic controls.

This is semantic boundary ownership, not arbitrary pruning. Visible content
must remain represented by the owning semantic node or its semantic children.

### 6.2 Generic recognizer inputs

Recognizers may use stable DesignIR facts:

- normalized node type and instance/component metadata;
- layer and component names;
- geometry and auto-layout relationships;
- visible descendant text;
- repeated sibling structure;
- fills, strokes, dividers, and typography;
- instance override boundaries;
- ordered child roles;
- exact source-node ancestry.

Recognizers must not use:

- the Pixso file key as a semantic rule;
- the root node ID as a semantic rule;
- absolute child node IDs as exceptions;
- Russian text literals as the sole evidence for component identity;
- Sber package names;
- generated React component names.

Text may contribute to intent such as action polarity or heading/value
distinction, but structure and component evidence must establish the boundary.

### 6.3 Required semantic structures

The modal requires semantic coverage for these presentation structures:

#### Form field

A form field owns its label, displayed value or placeholder, adornments,
validation/status presentation, and internal layout nodes.

The first slice distinguishes at least:

```text
textInput
combobox
```

Only evidence-supported roles are emitted. Empty option data and noop handlers
remain disclosed render-only props when required by a verified recipe.

#### Form row/group

A form row or form group owns layout between related fields without inventing
form state. It may resolve to a verified structural design-system component or
an authorized pack layout primitive.

#### Data table

A table boundary owns:

- optional heading or caption;
- column/header structure;
- ordered rows;
- ordered cells;
- cell text and status presentation;
- table-local actions when structurally proven.

Repeated cells are represented at table semantics, not as unrelated buttons
merely because small rectangular text nodes resemble action geometry.

#### Status/warning content

Highlighted content becomes a warning/status semantic node only when multiple
signals support that interpretation. Color alone cannot promote an arbitrary
layer to a warning.

#### Action group

Footer or row actions require action-group structure plus action evidence.
Bare cell values such as `-`, numeric text, or error text cannot become actions
from geometry alone.

#### Decorative content

Dividers, masks, icon paths, background rectangles, and purely visual internal
layers remain appearance evidence or owned descendants. They do not become
independent unresolved semantic nodes when already covered by a recognized
compound component.

### 6.4 Confidence

Confidence remains evidence-based and deterministic.

Structural recognition must not solve the baseline by lowering the global
semantic confidence threshold. It must add stronger compound evidence and
eliminate false candidate signals inside claimed boundaries.

In particular:

- `action-geometry` alone cannot identify a table cell as an action;
- `non-empty-text` alone cannot establish a heading;
- `highlighted-fill` alone cannot establish a warning;
- a component name alone may be sufficient only when it matches an exact
  verified component-instance recognizer whose boundary behavior is defined.

Every unresolved visible node remains a blocker.

## 7. Semantic contract changes

Add only roles required by the recognized structures and not already present in
the v2 vocabulary. Candidate roles are:

```text
formGroup
formRow
table
tableHeader
tableRow
tableCell
status
```

The implementation plan must first inventory the existing semantic vocabulary.
It must reuse existing roles where their meanings already match and must not
add synonyms.

New roles require:

- closed schema support;
- integrity validation;
- deterministic IDs;
- source-node provenance;
- normalizer/manifest fixture coverage;
- resolver policy coverage for both Sber Space UI and Material UI, or an
  explicit pack-level blocked decision.

The real `6:12547` Sber acceptance may advance before Material UI has equivalent
render recipes, but the shared manifest must remain design-system-neutral and
Material resolution must fail closed rather than guess.

## 8. Sber Space UI resolution

Concrete Sber imports, props, composition, and companions are owned by
`design-system-packs/sber-space-ui`.

Before adding a binding or recipe, implementation must verify it against the
canonical Sber resources and public type/API evidence already imported into the
project workflow. The generator must not assume a universal
`@sber-space-ui/react` barrel.

The pack work includes only components needed by the accepted semantic
manifest, potentially:

- modal composition members;
- field or autocomplete controls;
- form-row/group layout;
- table/data-table composition;
- status/warning presentation;
- buttons or icon companions;
- stack/layout primitives.

The exact component IDs, packages, exports, props, slot mappings, and companion
requirements are implementation findings, not guesses in this design.

Every recipe must declare:

- supported semantic role;
- verified component binding;
- allowed composition members;
- semantic-children policy;
- content and state prop targets;
- any closed render-only static props;
- slot ownership;
- default-prop provenance;
- unsupported states that must block.

## 9. Render-only boundary

The generated modal may contain inert API-shaped values only when declared by a
verified render recipe:

- empty input value;
- empty options;
- noop change handler;
- static table rows derived from visible design content;
- static status and action labels;
- static open/presentation state required to display the modal.

The generated modal must not claim to implement:

- resend submission;
- backend requests;
- form ownership;
- user edits;
- validation rules;
- lookup or autocomplete behavior;
- table sorting, filtering, pagination, or selection;
- modal close state;
- domain error handling.

Every render-only adapter appears in `generation-report.json`.

## 10. Data flow

```text
Pixso Remote MCP
        ↓
lossless content-addressed snapshot
        ↓
DesignIR v2
        ↓
exact-instance and compound-structure recognition
        ↓
compact design-system-neutral UI Manifest v2
        ↓
canonical Sber Space UI resolution
        ↓
authorized ready or blocked Resolution Plan v2
        ↓
React generation validation
        ↓
blocked report OR atomic TSX/CSS/report bundle
```

Qwen invokes the same CLI workflow and does not reinterpret DSL, rewrite the
manifest, choose Sber imports, or author TSX.

## 11. Determinism and acceptance evidence

### 11.1 Contract tests

Add focused tests proving:

- valid `unresolved + blocked` reaches blocked status;
- unresolved with any non-blocked decision is invalid;
- mismatched semantic roles are invalid;
- blocked output contains only the report;
- repeated blocked generation is byte-identical;
- authorization and path-security checks remain active.

### 11.2 Recognizer tests

Add small fixtures for:

- form field boundary ownership;
- repeated form rows;
- table/header/row/cell hierarchy;
- table text that must not become an action;
- warning/status positive and negative evidence;
- decorative descendants owned by a compound component;
- an ambiguous visible structure that remains blocked.

### 11.3 Pack tests

Validate:

- catalog bindings;
- import paths and export kinds;
- recipe schemas;
- required composition members;
- slot compatibility;
- render-only prop disclosure;
- rejection of unsupported table or form states;
- continued validity of both design-system packs.

### 11.4 Real acceptance

The real acceptance sequence is:

1. replay the recorded `6:12547` fixture offline;
2. review stable DesignIR, manifest, plan, TSX, CSS, and report candidates;
3. add reviewed goldens with provenance;
4. run the live Pixso plan;
5. generate directly through the CLI;
6. run the repository-owned workflow through Qwen;
7. compare generated file paths and SHA-256 hashes;
8. run the full repository verification.

The live and Qwen runs must use the same pack ID, version, and hash.

## 12. Completion criteria

The work is complete only when:

1. A valid unresolved blocked plan writes a canonical blocked report and no
   source.
2. Invalid or tampered blocked plans still fail closed.
3. `6:12547` produces a substantially compacted semantic tree based on
   compound boundaries, not node-ID exceptions.
4. Every visible meaningful section of the modal is represented.
5. The final Sber resolution contains no blocking diagnostics.
6. The generated code uses only verified Sber Space UI imports and recipes.
7. The output contains no business logic.
8. Direct CLI and Qwen outputs are byte-identical.
9. Fixture provenance is recorded and verified.
10. `pnpm verify`, both pack validations, CLI acceptance, and `git diff --check`
    pass.

If verified Sber API evidence is insufficient for a required component, the
work remains blocked with an explicit diagnostic. The generator must not invent
the missing API.

## 13. Out of scope

- Business API design or implementation.
- Real form state and validation.
- Backend integration.
- Interactive table behavior.
- Pixel-diff infrastructure beyond the existing reviewed render process.
- Material UI visual acceptance for this modal.
- Support for the long sectional form `70:118892`.
- A general arbitrary-Pixso fallback renderer.
- Changes to the Qwen host beyond invoking and reporting the repository-owned
  workflow.

