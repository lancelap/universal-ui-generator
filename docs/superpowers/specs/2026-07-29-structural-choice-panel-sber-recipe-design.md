# Structural Choice Panel Recognition and Sber Radio Recipe Design

**Date:** 2026-07-29

**Status:** approved design

**Repository:** `/Users/danilel/Documents/Codex/universal-ui-generator`

**Extends:**

- `2026-07-26-universal-ui-generator-design.md`
- `2026-07-26-react-generation-design.md`
- `2026-07-26-render-only-component-recipes-design.md`
- `2026-07-27-qwen-cli-extension-design.md`
- `2026-07-28-pixso-instance-materialization-action-group-design.md`
- `2026-07-29-pixso-keyless-definition-resolution-design.md`

## 1. Outcome

Add provider-neutral structural recognition and design-system-owned rendering
for a bordered single-selection choice panel.

The first vertical slice targets the real Pixso node:

```text
document: PqSywlhYgqSRDoWr78IrdA
root node: 70:118899
accepted run: run_20260729T061426998Z_70-118899
```

The selected element contains:

- an outlined rounded panel;
- a header icon and title;
- one single-selection group with five options;
- an optional description under each option;
- an optional trailing information icon;
- a section label between the third and fourth options.

The visible tooltip popup in the reference screenshot is outside this slice.
Its body text is not present in the accepted `DesignIR`. The first slice emits
only closed, non-interactive information indicators.

The accepted render has no selected option. Restoring the green selected
marker is deferred because that appearance is lost before the current
provider-neutral `DesignIR`.

After this slice, `/uig:plan` recognizes the element as one compound
`choicePanel`, consumes its implementation primitives, resolves the Sber
`RadioGroup` closure, and produces a generation-ready plan instead of 79
blocked primitive nodes.

## 2. Approved decisions

The user approved the following direction:

1. Generate the entire selected element, not only the radio controls.
2. Use a provider-neutral structural recognizer.
3. Do not match the Russian copy, Pixso node IDs, component names, or a
   document ID.
4. Represent the whole panel as one compound `choicePanel` manifest node with
   structured sections and options.
5. Keep all five options in one logical single-selection group even though
   they are shown in two visual sections.
6. Collapse materialized duplicate descriptions only when text, geometry,
   semantic slot, and provenance/overlap evidence agree.
7. Consume the recognized implementation descendants so they do not produce
   separate low-confidence failures.
8. Preserve their node IDs as structured provenance.
9. Resolve `RadioGroup`, `RadioButton`, layout companions, descriptions, and
   icons from the selected design-system pack.
10. For Sber Space UI, use the verified `@sber-space-ui/radio` exports. Do not
    substitute Checkbox, Button, a bare Radio, or a native radio input.
11. Render no selected option in this slice.
12. Render no open tooltip and invent no tooltip body.
13. Keep business logic out of scope.

## 3. Verified baseline

The accepted run artifacts are stored under:

```text
.uig/runs/run_20260729T061426998Z_70-118899/
```

The current baseline is:

```text
DesignIR root: 70:118899
DesignIR nodes: 83

resolution summary:
  reuse:    4
  compose:  0
  fallback: 0
  blocked: 79
```

The blocking diagnostics are:

| Code | Count |
| --- | ---: |
| `SEMANTIC_CONFIDENCE_TOO_LOW` | 79 |
| `NATIVE_FALLBACK_FORBIDDEN` | 79 |

The four currently accepted nodes are generic layout groups. The remaining
circles, labels, descriptions, icons, and materialized wrappers are planned
independently and consequently block the run.

The accepted source also contains one overlapping duplicate of the first
option description. It is a materialization artifact, not a sixth option or a
second visible description.

## 4. Architectural boundary

The data flow remains:

```text
raw provider source
        ↓
provider normalizer
        ├── provider-neutral DesignIR
        └── normalization provenance
        ↓
structural compound recognizer
        ↓
UiManifestV2 choicePanel
        ↓
design-system resolution
        ↓
structured React render recipe
        ↓
TSX + CSS module
```

Responsibilities:

- Provider normalizers preserve effective geometry, appearance, text, and
  provenance. When the source exposes a stable icon/asset semantic name, they
  preserve it as provider-neutral asset metadata. They do not recognize a
  radio group.
- The structural recognizer operates only on `DesignIRV2` and the normalized
  `NormalizationProvenanceV1` contract. It never reads raw provider DSL.
- The manifest expresses single-selection intent, sections, options, and icon
  hints. It contains no Sber package or export names.
- The component resolver selects the verified component closure for the active
  pack.
- A structured render recipe maps `choicePanel` data to the selected
  design-system components.
- Qwen invokes the repository-owned workflow and receives its artifacts. It
  does not reinterpret the raw Pixso DSL.

The existing exact Pixso compound projector remains responsible for
pack-declared exact component mappings such as the prior `actionGroup` slice.
The new recognizer must not overload that Pixso-specific API.

### 4.1 Responsibility analysis for the accepted baseline

The accepted `70:118899` baseline demonstrates several independent gaps. They
must not be treated as one generic "parser failed" problem:

| Evidence | Diagnosis | Owning change |
| --- | --- | --- |
| The raw Pixso source contains the selected marker appearance, but normalized property ellipses have no corresponding border/fill evidence | A source fact is lost before semantic planning | Pixso effective-instance materialization or appearance normalization |
| `DesignIRV2` contains the panel geometry, five option labels, descriptions, markers, and trailing indicators, but planning leaves 79 primitive nodes unresolved | Facts are present but not combined into one single-selection control | Provider-neutral structural compound recognizer |
| The manifest expresses `choicePanel`, but Sber components and their repeated option composition are not available to generation | Library implementation knowledge is incomplete | Sber catalog closure and structured render recipe |
| A target project may expose `AppRadioGroup` or forbid direct `@sber-space-ui/*` imports | Target-project implementation preference is unknown | Future project scan and effective component catalog |

The fixes are deliberately independent:

```text
lost selected appearance
    → normalizer repair for reusable instance appearance inheritance

unrecognized repeated option structure
    → reusable choice-panel recognizer

Sber RadioGroup, RadioButton, descriptions, and icons
    → verified Sber pack recipe

project AppRadioGroup or import facade
    → project scan, mappings, and policies
```

Changing the normalizer alone cannot safely infer `choicePanel`. Adding the
recognizer cannot restore a selected state that is absent from `DesignIR`.
Adding a Sber recipe cannot decide whether a project-local wrapper is
mandatory.

The following apparent shortcuts are forbidden:

```ts
node.id === "70:118899";
text.includes("Сделка требует корректировок");
node.name === "Radiobutton";
source.provider === "pixso"; // inside the provider-neutral recognizer
```

The regression fixture may assert the real node IDs and copy as expected
evidence, but production recognition cannot branch on them. Each correction
must make a reusable class of designs more complete.

## 5. Manifest contract

### 5.1 Role and node kind

An accepted panel becomes one manifest node:

```text
kind: control
role: choicePanel
```

`choicePanel` is a compound control because it owns one selection state and a
collection of selectable options.

The current `UiManifestV2` schema is closed and has no top-level
`presentation` field. This design therefore does not add the conceptual
`presentation` object shown during brainstorming. Layout and appearance remain
grounded in `layoutSourceNodeId` and `DesignIR`; icon intent belongs to
structured content.

### 5.2 Structured content

The first slice defines and validates this role-specific content shape:

```ts
interface ChoicePanelContent {
  title: string;
  titleSourceNodeId: string;
  headerIcon?: {
    hint: string;
    sourceNodeId: string;
  };
  sections: ChoicePanelSection[];
}

interface ChoicePanelSection {
  id: string;
  label?: string;
  labelSourceNodeId?: string;
  options: ChoicePanelOption[];
}

interface ChoicePanelOption {
  id: string;
  sourceNodeIds: string[];
  label: string;
  labelSourceNodeId: string;
  description?: string;
  descriptionSourceNodeIds?: string[];
  info?: {
    present: true;
    hint: string;
    sourceNodeId: string;
  };
  selected: false;
}
```

The node state is:

```ts
interface ChoicePanelState {
  selectionMode: "single";
  selectedOptionId: string | null;
}
```

For the accepted first slice:

```json
{
  "kind": "control",
  "role": "choicePanel",
  "content": {
    "title": "Выберите необходимые действия",
    "titleSourceNodeId": "<design-ir-node-id>",
    "headerIcon": {
      "hint": "files",
      "sourceNodeId": "<design-ir-node-id>"
    },
    "sections": [
      {
        "id": "<stable-source-derived-id>",
        "options": [
          {
            "id": "<stable-source-derived-id>",
            "sourceNodeIds": ["<option-boundary>", "<label>", "<description>"],
            "label": "Приостановить обработку сделки с данным контрагентом",
            "labelSourceNodeId": "<design-ir-node-id>",
            "description": "Сообщите сотруднику бизнеса...",
            "descriptionSourceNodeIds": [
              "<retained-node-id>",
              "<collapsed-duplicate-node-id>"
            ],
            "info": {
              "present": true,
              "hint": "information",
              "sourceNodeId": "<design-ir-node-id>"
            },
            "selected": false
          }
        ]
      },
      {
        "id": "<stable-source-derived-id>",
        "label": "Сделка требует корректировок:",
        "labelSourceNodeId": "<design-ir-node-id>",
        "options": []
      }
    ]
  },
  "state": {
    "selectionMode": "single",
    "selectedOptionId": null
  }
}
```

The example abbreviates the option arrays. The accepted real fixture must
contain exactly five unique options and two sections.

### 5.3 Provenance and integrity

The compound node's `sourceNodeIds` contains:

- the panel root;
- every accepted semantic source used by the title, section labels, options,
  descriptions, and icon indicators;
- every duplicate source collapsed into an accepted semantic slot.

`layoutSourceNodeId` remains the panel root and must be present in
`sourceNodeIds`.

Role-specific integrity validation requires:

1. every structured source ID to exist in `DesignIR`;
2. every structured source ID to occur in the compound node's
   `sourceNodeIds`;
3. at least one section;
4. at least two options across all sections;
5. non-empty title and option labels;
6. unique section and option IDs;
7. `selectionMode` to equal `single`;
8. `selectedOptionId` to be `null` or identify exactly one option;
9. `options[].selected` to agree with `selectedOptionId`;
10. no empty `descriptionSourceNodeIds` array when a description is present.

The first slice deliberately requires every `options[].selected` value to be
`false` and `selectedOptionId` to be `null`.

Stable section and option IDs are deterministically derived from their
retained source boundaries. User-visible copy must never be used as identity.

The planner input is extended to carry the matching
`NormalizationProvenanceV1` artifact produced by normalization. Its
`sourceArtifactId` must match the `DesignIRV2` artifact. The recognizer may
inspect normalized origin kinds and target node IDs; it must not branch on an
optional provider component key.

## 6. Structural recognition

### 6.1 Recognition result

Add a provider-neutral compound result alongside ordinary structural
recognition:

```ts
interface StructuralCompoundRecognition {
  kind: "control";
  role: "choicePanel";
  confidence: number;
  layoutSourceNodeId: string;
  sourceNodeIds: string[];
  content: ChoicePanelContent;
  state: ChoicePanelState;
  consumedNodeIds: string[];
  evidence: SemanticEvidence[];
  diagnostics: Diagnostic[];
}
```

`consumedNodeIds` is an internal planner result, not a new public manifest
field. Public provenance is carried by `sourceNodeIds`, structured content
source fields, evidence, and diagnostics.

The recognizer entry point receives both normalized artifacts:

```ts
recognizeStructuralCompound({
  ir,
  provenance,
  boundaryNodeId,
}): StructuralCompoundRecognition | undefined
```

### 6.2 Candidate option rows

Recognition runs bottom-up and derives candidate option rows from repeated
geometry and structure.

An option candidate must provide:

- one small marker region in the leading column;
- exactly one primary visible text after deduplication;
- at most one subordinate description slot;
- at most one small trailing indicator region;
- a positive row boundary that encloses or aligns those slots;
- a matching column pattern shared with at least one other candidate.

The recognizer may use provider-neutral facts already present in `DesignIR`:

- node visibility;
- containment;
- absolute geometry;
- overlap;
- text values;
- fill, border, opacity, and radii;
- normalized materialization origin kinds and target-node relationships.

It must not use:

- `source.provider`;
- Pixso `componentKey`, `componentId`, `guid`, or `pathString`;
- node IDs except as provenance and deterministic tie-breakers;
- node names such as `Radiobutton` or `Опции для выбора`;
- Russian or English keyword matching;
- the target document ID.

The small leading marker is evidence only when repeated row geometry supports
the interpretation. A circle next to arbitrary prose is insufficient.

This prohibition applies to deciding whether the structure is a
`choicePanel`. It does not prohibit the separate icon resolver from consuming
normalized asset metadata after the panel and an icon slot have already been
recognized.

### 6.3 Label and description assignment

For each option row:

1. visible text candidates are ordered by geometry;
2. a unique leading or visually dominant text becomes the label;
3. a subordinate text below it becomes the description;
4. ambiguous multiple labels reject the option candidate;
5. ambiguous multiple non-duplicate descriptions reject the candidate.

Typography metrics may contribute confidence when available, but the slice
must still work when the normalizer exposes only geometry and text.

### 6.4 Section construction

Accepted option rows are sorted by visual order and grouped by aligned column
geometry.

A standalone text between consecutive option runs becomes a section label
when it:

- is not part of an option row;
- precedes at least one accepted option;
- spans the option content column;
- does not overlap the preceding option;
- is the only viable interstitial label for that boundary.

The first run may have no section label. All sections remain members of one
logical selection group.

### 6.5 Panel and header

A panel candidate is accepted only when it contains:

- a unique header title above all option rows;
- at least two accepted option rows;
- a common container or enclosing visual boundary;
- stable leading, content, and optional trailing columns;
- a vertical ordering with no mutually overlapping option rows after
  deduplication.

A small non-text region immediately preceding the header title may yield a
header icon slot. The category for that slot is accepted only when
provider-neutral asset metadata supplies a stable semantic name; the accepted
raw source contains the semantic asset name `files`, which the current
normalizer does not yet retain. A repeated trailing indicator whose visible
structure is consistent across option rows may yield the option information
hint from its structural function.

The hints are semantic categories, not library export names:

```text
files
information
```

The implementation must add the smallest provider-neutral `DesignIRV2` asset
metadata needed to carry a stable source semantic name; it must not expose a
Pixso component key or provider path as the public icon contract. If a unique
icon category cannot be justified, the optional icon is omitted with a
warning. Icon ambiguity does not invalidate an otherwise valid
single-selection panel.

### 6.6 Confidence policy

The recognizer must expose deterministic evidence and confidence rather than
an unconditional special case.

Required evidence:

- repeated option-row structure;
- unique label per option;
- one consistent leading marker column;
- one enclosing panel boundary or common container;
- one unique header title.

Supporting evidence:

- repeated trailing indicator column;
- descriptions consistently subordinate to labels;
- section boundary;
- rounded outlined container;
- header icon.

Missing required evidence rejects the compound. Supporting evidence adjusts
confidence but cannot create the role by itself.

The existing semantic warning and automatic thresholds remain authoritative.
The implementation plan must define explicit weights and tests before
implementation; no fixture-specific confidence override is allowed.

## 7. Duplicate collapse

Duplicate collapse is local to one proposed semantic slot. It is not a global
text deduplicator.

Two text nodes are collapsed only when all of these are true:

1. normalized text is identical;
2. their rectangles are equal within the repository's geometry tolerance or
   one almost completely covers the other;
3. both compete for the same option description slot;
4. normalized materialization provenance relates them as definition/default
   and materialized/override instances, or exact visual overlap supplies
   equivalent evidence;
5. collapsing them leaves exactly one unambiguous description.

Two identical strings in different rows or non-overlapping positions remain
distinct.

The retained description stores both source IDs. The planner also emits:

```json
{
  "severity": "info",
  "blocking": false,
  "stage": "semantic-planning",
  "code": "DUPLICATE_MATERIALIZED_NODE_COLLAPSED",
  "message": "Collapsed overlapping materialized nodes in one choice option description slot",
  "evidence": {
    "semanticSlot": "sections[0].options[0].description",
    "retainedNodeId": "<node-id>",
    "collapsedNodeIds": ["<node-id>"]
  }
}
```

## 8. Descendant consumption

The current planner suppresses children only for exact component recognition.
That rule is extended to accepted structural compounds:

```text
accepted structural compound
    → build one compound UiNodeV2
    → do not recursively build consumed implementation descendants
```

Consumption is all-or-nothing for the accepted panel boundary. The recognizer
must return every visible descendant as one of:

- a semantic source assigned to the compound;
- a recognized decorative/layout implementation detail;
- an explicitly unconsumed descendant.

An accepted panel may suppress only the first two categories. Any visible,
meaningful unconsumed descendant prevents acceptance and produces
`CHOICE_PANEL_STRUCTURE_INCOMPLETE`. This prevents a broad container match
from hiding unrelated controls or content.

If recognition is rejected, ordinary traversal runs unchanged and the
original low-confidence diagnostics remain visible.

## 9. Design-system resolution

### 9.1 Universal policy

The manifest role remains `choicePanel`. Each design-system pack decides how
to resolve it.

For Sber Space UI, the semantic policy permits:

```json
{
  "choicePanel": {
    "allowedDecisions": ["compose", "blocked"],
    "candidateComponentIds": ["base.RadioGroup"],
    "nativeFallback": false,
    "unresolvedCode": "CHOICE_CONTROL_RESOLUTION_BLOCKED"
  }
}
```

The Sber resolution closure is:

```text
base.RadioGroup
├── required: base.RadioButton
├── required: base.Stack
└── optional when descriptions exist: base.FormDescription
```

The local pack imports the verified machine facts from the canonical Sber
resource pack. It does not invent a new library API.

Verified primary binding:

```text
component: base.RadioGroup
package:   @sber-space-ui/radio
export:    RadioGroup
kind:      named
```

Verified required control:

```text
component: base.RadioButton
package:   @sber-space-ui/radio
export:    RadioButton
kind:      named
```

Verified description companion:

```text
component: base.FormDescription
package:   @sber-space-ui/form-control
export:    FormDescription
kind:      named
```

Icons remain a separate resolution concern and come from confirmed
`@sber-space-ui/icons` exports.

### 9.2 Resolution decision

The result is `compose`, not five independent `reuse` decisions. One manifest
node owns one design-system composition and one selection state.

The resolution plan records every selected binding required by the structured
recipe. Generation is blocked when `RadioGroup`, `RadioButton`, or another
required companion is unavailable or unverified.

Missing optional icons produce warnings and omit the icon. Missing
`FormDescription` while descriptions exist is blocking because detached
manually padded description text violates the canonical Sber rule.

### 9.3 Pack-owned icon bindings

The repository does not currently have a standalone icon resolver. This slice
must not claim that an unavailable runtime already exists and must not require
Qwen to guess imports.

The bounded first-slice solution is to add verified icon entries to the normal
component catalog and let the Sber structured recipe map semantic icon hints
to those entries:

```ts
interface StructuredRecipeIconSlot {
  hint: string;
  componentId: string;
  required: boolean;
}
```

Conceptually:

```json
[
  {
    "hint": "files",
    "componentId": "<verified-sber-files-icon-id>",
    "required": false
  },
  {
    "hint": "information",
    "componentId": "<verified-sber-information-icon-id>",
    "required": false
  }
]
```

The concrete component IDs, exports, and named imports are added only after
verification through the canonical Sber icon lookup/installed export scan.
Their catalog provenance must identify that verification source. Both imports
must resolve from `@sber-space-ui/icons`.

This is a pack-owned semantic-hint mapping, not a source-design mapping.
Another design-system pack may bind `files` and `information` to different
components. A future slice may generalize this into a reusable icon catalog
file, but that generalization is not required here.

## 10. Structured React recipe

### 10.1 Why a new recipe shape is required

The current React recipe contract maps scalar `content.*` and `state.*` paths
onto one component. It cannot iterate `sections[].options[]` or render the
same companion repeatedly.

This slice therefore adds a bounded structured recipe kind rather than:

- hard-coding `choicePanel` inside the generator;
- turning every implementation primitive back into a manifest node;
- teaching the generic scalar recipe arbitrary templates or executable code.

The contract should express a finite, schema-validated
single-selection-collection template. A conceptual shape is:

```ts
interface SingleSelectionCollectionRecipe {
  kind: "single-selection-collection";
  semanticRole: "choicePanel";
  rootComponentId: string;
  optionComponentId: string;
  layoutComponentId: string;
  descriptionComponentId?: string;
  sources: {
    title: "content.title";
    sections: "content.sections";
    selectedValue: "state.selectedOptionId";
  };
  rootProps: {
    value: string;
    onChange: "noop";
    direction: "column";
  };
  optionProps: {
    value: "option.id";
  };
  provenance: RecipeProvenance;
}
```

The final schema and names may differ in the implementation plan, but it must
remain declarative, closed, deterministic, and limited to this reusable
collection capability. It must not evaluate JavaScript expressions from pack
JSON.

### 10.2 Render-only state

Canonical Sber documentation requires `RadioGroup.value` and
`RadioGroup.onChange`. In this render-only slice:

```text
value:    ""
onChange: noop
```

Every option receives its unique `value`. The group owns checked state; the
recipe must not also supply conflicting `checked` or per-option `onChange`
props.

An empty string is reserved as "no selected option" and option IDs must never
be empty.

The first generated component does not expose an application callback and
does not store local state. Adding runtime/business behavior is a later slice.

### 10.3 Logical and visual structure

All sections render inside one `RadioGroup`:

```tsx
<section aria-labelledby={titleId} className={styles.panel}>
  <header className={styles.header}>
    <ResolvedHeaderIcon aria-hidden="true" />
    <ResolvedTypography id={titleId}>
      {content.title}
    </ResolvedTypography>
  </header>

  <RadioGroup
    value=""
    onChange={noop}
    direction="column"
    groupName={content.title}
  >
    {/* section 1 options */}
    {/* section 2 label */}
    {/* section 2 options */}
  </RadioGroup>
</section>
```

The outline shell is an intrinsic semantic/layout wrapper because the pack has
no verified `ChoicePanel` shell component. It does not replace an interactive
design-system control. The interactive selection control is always the Sber
`RadioGroup` closure.

Each option follows the verified group API:

```tsx
<RadioButton value={option.id}>
  {option.label}
</RadioButton>
```

The compatible description companion stays associated with that option in
the recipe-defined option layout. Information indicators occupy a trailing
visual column but are not buttons and expose no fabricated tooltip behavior.

The exact TSX nesting of `FormDescription` must follow the canonical Sber
documentation/rule and pass compilation against the installed library. The
generator must not emit detached description text with manually guessed
padding.

### 10.4 Icons

The recipe requests icons by semantic slot:

```text
header → files
option trailing indicator → information
```

Concrete exports are selected by the verified pack-owned icon bindings
described above. The recipe cannot copy an icon path from the fixture.

Until tooltip content and interaction are present, the option information
icon is visual only:

```tsx
<ResolvedInformationIcon aria-hidden="true" />
```

It must not be emitted as an empty button with an inaccessible or misleading
interaction.

## 11. Styling

The panel needs:

- an outlined rounded shell;
- internal padding;
- a header row;
- one vertical radio collection;
- aligned leading marker, text, and trailing icon columns;
- descriptions below their own labels;
- a divider/spacing boundary before a labeled later section.

The style lowering order remains:

1. use a verified design-system component capability;
2. match an exact pack token;
3. use an allowed local CSS declaration derived from `DesignIR`;
4. emit a visual diagnostic when the pack cannot represent a material value.

The generator must not label a literal as a Sber token when no exact token
match exists.

The structured recipe may introduce deterministic local wrapper classes for:

```text
panel
header
collection
section
sectionLabel
optionRow
optionContent
optionDescription
infoIcon
```

Those wrappers may perform layout and document semantics. They may not replace
`RadioGroup`, `RadioButton`, or `FormDescription`.

## 12. Diagnostics

New diagnostics:

| Code | Blocking | Meaning |
| --- | --- | --- |
| `CHOICE_PANEL_STRUCTURE_INCOMPLETE` | yes | Required structure is missing or a meaningful descendant would be hidden |
| `CHOICE_OPTION_AMBIGUOUS` | yes | A row has ambiguous label, description, marker, or boundary assignment |
| `CHOICE_OPTION_ID_DUPLICATE` | yes | Stable option IDs collide |
| `CHOICE_SELECTED_OPTION_UNKNOWN` | yes | Selected ID does not identify an option |
| `DUPLICATE_MATERIALIZED_NODE_COLLAPSED` | no | Proven overlapping sources were collapsed in one semantic slot |
| `CHOICE_CONTROL_RESOLUTION_BLOCKED` | yes | Required radio control closure cannot be verified |
| `CHOICE_DESCRIPTION_COMPANION_BLOCKED` | yes | A required description companion is unavailable |
| `CHOICE_ICON_UNRESOLVED` | no | An optional semantic icon cannot be resolved |

Existing `SEMANTIC_CONFIDENCE_TOO_LOW` and
`NATIVE_FALLBACK_FORBIDDEN` remain valid for nodes outside an accepted
compound boundary.

## 13. Failure behavior

The workflow must fail closed:

- no partial compound manifest when only some option rows are understood;
- no consumption of unrelated meaningful descendants;
- no native radio fallback;
- no Checkbox or Button substitution;
- no guessed Sber import;
- no invented tooltip copy;
- no inferred selected option in this slice;
- no text- or node-ID-specific recognizer rule;
- no business logic.

If the panel recognizer fails, the existing ordinary planning result remains
available with its diagnostics. The extension reports the exact blocking
stage and artifact paths.

## 14. Testing

### 14.1 Contracts

Add tests for:

- valid `choicePanel` content and state;
- missing and unknown structured source node IDs;
- duplicate section and option IDs;
- selected state mismatch;
- fewer than two total options;
- closed-schema rejection of unsupported fields.

### 14.2 Structural recognizer

Use small provider-neutral `DesignIRV2` fixtures for:

- one section with repeated options;
- two sections under one selection group;
- optional descriptions;
- optional trailing information indicators;
- one proven overlapping duplicate description;
- identical text in different rows that must not collapse;
- ambiguous multiple labels;
- unrelated content inside the panel;
- an isolated circle and text that must not become a choice panel;
- deterministic output under reordered input-map insertion.

No unit test may depend on the real Russian strings or target node IDs.

### 14.3 Planner

Verify:

- one accepted compound manifest node;
- no manifest descendants for consumed implementation nodes;
- full source provenance;
- ordinary traversal when compound recognition rejects;
- stable diagnostics and manifest hashes.

### 14.4 Resolver and pack

Verify:

- `choicePanel` resolves as an Sber composition;
- the closure contains `RadioGroup`, `RadioButton`, `Stack`, and conditional
  `FormDescription`;
- missing required companions block;
- native fallback remains forbidden;
- another test pack can bind the same semantic role to different components.

### 14.5 React generation

Verify:

- imports come from pack bindings;
- one `RadioGroup` wraps all five options;
- five `RadioButton` elements receive unique values;
- empty selection is rendered through the documented group API;
- section labels do not create separate selection groups;
- descriptions use the verified companion;
- optional icons are resolved separately;
- no `<input type="radio">`, Checkbox, or Button fallback appears;
- no tooltip popup or click handler appears;
- generated TypeScript compiles.

### 14.6 Real regression

Promote the accepted `70:118899` artifacts into a compact deterministic
regression fixture. Assert:

```text
root role: choicePanel
sections: 2
options: 5
selectedOptionId: null
collapsed duplicate descriptions: 1
blocked consumed primitives: 0
```

Then rebuild the portable Qwen extension and run `/uig:plan` and generation
through Qwen against the same source node.

## 15. Acceptance criteria

The slice is complete when:

1. the real fixture produces one `choicePanel`;
2. it contains two sections and five unique options;
3. all five options belong to one logical `RadioGroup`;
4. the duplicate first description is collapsed with provenance and an info
   diagnostic;
5. `selectedOptionId` is `null`;
6. all relevant descendants are safely consumed;
7. no consumed node emits `SEMANTIC_CONFIDENCE_TOO_LOW` or
   `NATIVE_FALLBACK_FORBIDDEN`;
8. Sber resolution selects the verified radio closure;
9. generation emits the complete outlined panel and valid Sber radio controls;
10. no open tooltip or business logic is generated;
11. focused tests and `pnpm verify` pass;
12. the portable Qwen bundle is rebuilt from the verified repository state;
13. a real Qwen run produces inspectable plan, TSX, CSS, diagnostics, and
    render artifacts for user review.

## 16. Explicitly deferred work

The following are out of scope:

- recovering selected state from lost Pixso marker appearance;
- tooltip body extraction, OCR, open-state reconstruction, and interaction;
- application state, submit behavior, API calls, validation, and other
  business logic;
- a general arbitrary nested-template language for render recipes;
- provider-specific or Russian-text recognizers;
- changes to unrelated modal, table, or form recognizers;
- automatic synchronization of every canonical MCP catalog entry into the
  local pack.
