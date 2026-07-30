# Structural Choice Panel and Sber Recipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize the complete two-section, five-option choice panel at Pixso node `PqSywlhYgqSRDoWr78IrdA / 70:118899` as one provider-neutral `choicePanel`, resolve it only through verified Sber Space UI components, and generate deterministic presentation-only React TSX and CSS without 79 descendant blockers.

**Architecture:** The Pixso normalizer preserves factual asset names and value provenance without assigning semantics. A provider-neutral structural recognizer converts a proven subtree into one typed compound `choicePanel` manifest node and consumes only descendants whose ownership it can prove. A closed, non-executable `single-selection-collection` recipe in the design-system pack maps that structured manifest to verified components. The React generator lowers the recipe into a dedicated typed model and emits ordinary TSX/CSS; it contains no Sber names or source-design IDs.

**Tech Stack:** TypeScript 5.9, Node.js 22+, TypeBox closed schemas, Vitest, pnpm workspaces, TypeScript Compiler API, React TSX source generation, CSS Modules, existing Pixso V2 normalization/provenance, component resolver, CLI, and portable Qwen extension bundle.

## Global Constraints

- The acceptance source is Pixso document `PqSywlhYgqSRDoWr78IrdA`, root `70:118899`.
- Production recognition must not branch on the document ID, node ID, Russian copy, layer names, or `source.provider`.
- The normalizer preserves facts only. It may expose `componentNormName` as an asset name, but it must not decide that a node is a file icon, info icon, radio, or choice panel.
- The semantic planner emits one compound `choicePanel` node with structured content/state and no semantic child per option.
- The five visible options form one logical selection group across two visual sections.
- This slice emits `selectedOptionId: null`; every option has `selected: false`.
- Tooltip-open state, click behavior, validation, submission, API calls, and all other business logic are out of scope.
- A recognizer accepts a panel only when root ownership, option-row ownership, section ordering, field sources, and compound consumption are complete and unambiguous.
- A partially recognized panel fails closed with `CHOICE_PANEL_STRUCTURE_INCOMPLETE`; it must not guess content or silently suppress unrelated descendants.
- Local duplicate collapse is allowed only when same-slot text and geometry agree and either normalized materialization provenance relates the copies or exact visual overlap supplies equivalent evidence. It emits `DUPLICATE_MATERIALIZED_NODE_COLLAPSED`.
- `sourceNodeIds` on the compound node include every node cited by a structured field and every consumed descendant.
- The structural recognizer must remain provider-neutral. Sber package names and props exist only in the Sber pack.
- The Sber implementation uses verified named exports:
  - `RadioGroup` and `RadioButton` from `@sber-space-ui/radio`;
  - `FormDescription` from `@sber-space-ui/form-control`;
  - `Stack` and `Typography` from `@sber-space-ui/atom`;
  - `DocumentText` from `@sber-space-ui/icons/24/Stroke/File_And_Folder`;
  - `ExclamationMarkInfo` from `@sber-space-ui/icons/24/Stroke/UserInterface`.
- Missing required radio/layout/description bindings block generation. Missing optional header or trailing icons emits a warning and omits only that icon.
- No native `<input type="radio">`, checkbox, button, or guessed package import is permitted as a fallback.
- Pack recipes are closed declarative data. They cannot contain JSX, JavaScript, selectors, callbacks, arbitrary property paths, or executable templates.
- The structured recipe is bounded to the `single-selection-collection` kind; do not add a general loop/template language.
- Generator packages must not contain `sber`, Pixso IDs, source copy, or design-system package names.
- The generated module is presentation-only. It uses the documented render-only empty selection and noop handler and does not expose application callbacks or create React state.
- Existing modal generation, recipe v1/v2 compatibility, and other design-system packs remain working.
- Normal tests are offline and do not require `PIXSO_ACCESS_TOKEN`.
- Every behavior change follows RED-GREEN-REFACTOR and ends with a focused commit.
- Final completion requires `pnpm verify`, a reproducible Qwen bundle rebuild, and one real Qwen `/uig:plan` → `/uig:generate` review run.

---

## Target Contract

The provider-neutral manifest representation is closed and typed:

```ts
interface ChoicePanelIconHint {
  hint: string;
  sourceNodeId: string;
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
  selected: boolean;
}

interface ChoicePanelSection {
  id: string;
  label?: string;
  labelSourceNodeId?: string;
  options: ChoicePanelOption[];
}

interface ChoicePanelContent {
  title: string;
  titleSourceNodeId: string;
  headerIcon?: ChoicePanelIconHint;
  sections: ChoicePanelSection[];
}

interface ChoicePanelState {
  selectionMode: "single";
  selectedOptionId: string | null;
}
```

The pack-owned rendering contract is one closed collection recipe:

```ts
interface ReactSingleSelectionCollectionRecipe {
  kind: "single-selection-collection";
  semanticRole: "choicePanel";
  rootComponentId: string;
  optionComponentId: string;
  layoutComponentId: string;
  titleComponentId: string;
  descriptionComponentId: string;
  leadingAssetComponentId?: string;
  trailingAssetComponentId?: string;
  sources: {
    title: "content.title";
    sections: "content.sections";
    selectedValue: "state.selectedOptionId";
  };
  rootProps: {
    valueTarget: string;
    emptyValue: "";
    onChangeTarget: string;
    onChangeValue: "noop";
    directionTarget: string;
    directionValue: "column";
    groupNameTarget: string;
    groupNameSource: "content.title";
  };
  optionProps: {
    valueTarget: string;
    valueSource: "option.id";
  };
  provenance: RecipeProvenance;
}
```

The generator may interpret only these enumerated sources and the fixed
`single-selection-collection` opcode. It must not evaluate arbitrary paths.

The implementation uses the approved diagnostic vocabulary:

```text
CHOICE_PANEL_STRUCTURE_INCOMPLETE
CHOICE_OPTION_AMBIGUOUS
CHOICE_OPTION_ID_DUPLICATE
CHOICE_SELECTED_OPTION_UNKNOWN
DUPLICATE_MATERIALIZED_NODE_COLLAPSED
CHOICE_CONTROL_RESOLUTION_BLOCKED
CHOICE_DESCRIPTION_COMPANION_BLOCKED
CHOICE_ICON_UNRESOLVED
```

---

## File Map

### Recorded source and normalization

- Create `fixtures/pixso/node-70-118899/source.json` from the accepted content-addressed cache artifact.
- Modify `fixtures/pixso/README.md` with the exact URL, file key, node ID, versions, byte length, SHA-256, retrieval date, and exported root.
- Modify `packages/contracts/src/design-ir-v2.ts` to add optional factual `asset.name`.
- Modify `packages/design-normalizer/src/normalize-node.ts` to preserve a non-empty raw `componentNormName` as `asset.name` even when no component key exists.
- Modify `packages/design-normalizer/src/normalize-design.test.ts` to verify asset preservation and provenance.

### Manifest contract and semantic planning

- Modify `packages/contracts/src/ui-manifest-v2.ts` with the closed `choicePanel` field schemas, exported types, and role-specific integrity checks.
- Modify `packages/contracts/src/index.ts` to export the new contract types.
- Modify `packages/contracts/src/contracts.test.ts` with schema-closure and integrity cases.
- Create `packages/semantic-planner/src/choice-panel-candidates.ts` for pure geometric, hierarchy, marker, text, section, asset, and provenance candidate extraction.
- Create `packages/semantic-planner/src/choice-panel-candidates.test.ts` for synthetic candidate and ambiguity cases.
- Create `packages/semantic-planner/src/recognize-choice-panel.ts` for all-or-nothing compound recognition and consumption.
- Create `packages/semantic-planner/src/recognize-choice-panel.test.ts` for compound output, duplicate collapse, fail-closed, and permutation tests.
- Modify `packages/semantic-planner/src/build-ui-manifest-v2.ts` to accept normalization provenance and run compound recognition before ordinary scalar recognition.
- Modify `packages/semantic-planner/src/build-ui-manifest-v2.test.ts` for precedence, consumption, diagnostics, and unrelated-descendant preservation.
- Modify `packages/semantic-planner/src/index.ts` to export only the intended public entrypoints.
- Modify `apps/cli/src/plan-from-snapshot.ts` to pass the already-produced provenance document to semantic planning.
- Modify CLI planner tests that construct `buildUiManifestV2` inputs.

### Structured recipes, Sber pack, and resolution

- Modify `packages/contracts/src/react-render-recipes.ts` with the closed recipe schema and type.
- Modify `packages/contracts/src/react-pack-contracts.test.ts` for closed-schema and historical-recipe compatibility.
- Modify `packages/component-catalog/src/normalize-react-recipes.ts` so historical recipe documents normalize with an empty structured-recipe collection.
- Modify `packages/component-catalog/src/validate-react-recipes.ts` to validate role uniqueness, component references, source enums, and composition closure.
- Modify `packages/component-catalog/src/validate-react-recipes.test.ts` with every invalid structured-recipe case.
- Modify `design-system-packs/sber-space-ui/catalog.json` with verified radio, description, layout, typography, and icon entries or companions that are not already present.
- Modify `design-system-packs/sber-space-ui/semantic-policy.json` to resolve `choicePanel` through `base.RadioGroup`, permit `compose`, and prohibit native fallback.
- Modify `design-system-packs/sber-space-ui/react-render-recipes.json` with the Sber `single-selection-collection` recipe.
- Modify `design-system-packs/sber-space-ui/verification.json` with canonical documentation/export evidence for every added component.
- Modify `packages/component-resolver/src/resolve-ui-manifest-v2.ts` only as needed to include required structured bindings and optional icon bindings deterministically.
- Modify `packages/component-resolver/src/resolve-ui-manifest-v2.test.ts` for ready, missing-required, and missing-optional cases.

### React lowering and emission

- Modify `packages/generator-react/src/generation-model.ts` with a dedicated typed single-selection collection model and structured style-rule model.
- Create `packages/generator-react/src/build-single-selection-model.ts` to validate and lower manifest data plus resolved bindings.
- Create `packages/generator-react/src/build-single-selection-model.test.ts` for exact props, imports, field ordering, optional icons, and blocked inputs.
- Modify `packages/generator-react/src/build-react-generation-model.ts` to route a matching compound recipe before generic composition lowering.
- Modify `packages/generator-react/src/build-react-generation-model.test.ts` for mixed ordinary/structured generation.
- Modify `packages/generator-react/src/build-import-model.ts` and its tests only if structured optional bindings require import collection changes.
- Modify `packages/generator-react/src/build-style-model.ts` and its tests to add only policy-approved root facts and fixed structural wrapper rules.
- Modify `packages/generator-react/src/emit-tsx.ts` and `packages/generator-react/src/emit-tsx.test.ts` to emit the bounded collection model.
- Modify `packages/generator-react/src/emit-css.ts` and its tests if the existing CSS emitter needs the new structured rules exposed explicitly.

### End-to-end acceptance and Qwen parity

- Create `fixtures/react-generation/pixso-70-118899/sber-space-ui/resolution-plan.json`.
- Create `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.tsx`.
- Create `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.module.css`.
- Create `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/generation-report.json`.
- Modify `fixtures/react-generation/README.md` with reviewed provenance.
- Modify `apps/cli/src/offline-acceptance.test.ts` to assert one accepted compound node and no descendant semantic blockers.
- Modify `apps/cli/src/react-generation-acceptance.test.ts` to assert deterministic Sber output.
- Modify `scripts/generate-react-acceptance-candidates.ts` to regenerate this candidate beside existing fixtures.
- Rebuild `dist/qwen-adapter.mjs` and `dist/qwen-adapter.provenance.json`; never hand-edit them.

---

## Task 1: Promote the real Pixso source and preserve factual asset names

**Files:**

- Create: `fixtures/pixso/node-70-118899/source.json`
- Modify: `fixtures/pixso/README.md`
- Modify: `packages/contracts/src/design-ir-v2.ts`
- Modify: `packages/design-normalizer/src/normalize-node.ts`
- Modify: `packages/design-normalizer/src/normalize-design.test.ts`

**Accepted fixture metadata:**

```text
url: https://pixso.net/app/design/PqSywlhYgqSRDoWr78IrdA?item-id=70:118899
fileKey: PqSywlhYgqSRDoWr78IrdA
requestedNodeId: 70:118899
dslVersion: 2.1.15
converterVersion: 2.2.13
byteLength: 1132326
sha256: 1ff9d4c8045430873dc7314da91887415609ed8362eb2869582c8c47c7365289
retrievedOn: 2026-07-29
exportedRootIds: [70:118899]
```

- [ ] Copy the accepted cache bytes without reserializing them and add the exact provenance entry.

- [ ] Run the fixture verifier:

  ```bash
  pnpm verify:fixtures
  ```

  Expected: it passes and proves the committed bytes match the declared hash.

- [ ] Add failing normalization tests proving:
  - a non-empty `componentNormName` becomes `node.asset.name`;
  - the fact survives when `componentKey` is absent;
  - empty/whitespace-only names are omitted;
  - provenance contains a `/asset/name` origin;
  - no semantic icon kind is introduced.

- [ ] Run the focused red test:

  ```bash
  pnpm vitest run packages/design-normalizer/src/normalize-design.test.ts
  ```

  Expected: fail because `DesignNodeV2` has no `asset` fact.

- [ ] Add `asset?: { name: string }` to the closed DesignIR V2 node schema and normalize it from raw `componentNormName`.

- [ ] Correct the raw-to-normalized target mapping so `componentNormName` records `/asset/name`; retain existing component-variant provenance when it is independently present.

- [ ] Re-run the focused test and `pnpm typecheck`.

- [ ] Commit:

  ```bash
  git add fixtures/pixso/node-70-118899/source.json fixtures/pixso/README.md packages/contracts/src/design-ir-v2.ts packages/design-normalizer/src/normalize-node.ts packages/design-normalizer/src/normalize-design.test.ts
  git commit -m "feat: preserve normalized asset names"
  ```

---

## Task 2: Define and enforce the `choicePanel` manifest contract

**Files:**

- Modify: `packages/contracts/src/ui-manifest-v2.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/contracts.test.ts`

- [ ] Add failing tests for the Target Contract above and for these invariants:
  - at least one section and at least two options in total;
  - unique section and option IDs;
  - non-empty field values and source IDs;
  - every field source and every option/section source exists in DesignIR;
  - every cited source belongs to the compound node's `sourceNodeIds`;
  - `selectionMode` is exactly `"single"`;
  - `selectedOptionId` is null or names exactly one option;
  - option `selected` flags agree with `selectedOptionId`;
  - a present description has a non-empty `descriptionSourceNodeIds` array;
  - unknown fields are rejected by the role-specific closed schemas.

- [ ] Run:

  ```bash
  pnpm vitest run packages/contracts/src/contracts.test.ts
  ```

  Expected: fail because `choicePanel` content/state are still unchecked records.

- [ ] Add exported TypeBox schemas/types for all six Target Contract interfaces.

- [ ] Keep the general `UiNodeV2` wire shape backward compatible, then add role-specific validation inside `assertUiManifestV2Integrity` when `role === "choicePanel"`.

- [ ] Make integrity failures use the existing `V2_CONTRACT_INTEGRITY` prefix with stable, specific messages.

- [ ] Re-run focused tests and `pnpm typecheck`.

- [ ] Commit:

  ```bash
  git add packages/contracts/src/ui-manifest-v2.ts packages/contracts/src/index.ts packages/contracts/src/contracts.test.ts
  git commit -m "feat: define choice panel manifest contract"
  ```

---

## Task 3: Extract provider-neutral choice-panel candidates

**Files:**

- Create: `packages/semantic-planner/src/choice-panel-candidates.ts`
- Create: `packages/semantic-planner/src/choice-panel-candidates.test.ts`

**Candidate pipeline:**

1. Find a visible container with a coherent vertical content region.
2. Identify a title row from a text field plus an optional adjacent asset fact.
3. Identify option rows from repeated circular selection markers, adjacent primary text, optional secondary text, and optional trailing assets.
4. Assign each visible field to exactly one row using containment first and bounded geometric association second.
5. Partition rows into ordered visual sections using vertical order and optional intervening section-label text.
6. Use normalization provenance and geometric overlap to collapse only equivalent local field copies.
7. Return candidates plus exact evidence and source ownership; do not assign a semantic role yet.

- [ ] Write synthetic failing tests for:
  - one section with two options;
  - two sections sharing one selection group;
  - optional descriptions and icons;
  - shuffled input-map order with identical output;
  - hidden nodes ignored;
  - ambiguous text-to-row assignment rejected;
  - unrelated text inside the root left unconsumed;
  - overlapping duplicate descriptions collapsed when provenance relates them or exact visual overlap supplies equivalent evidence;
  - equal-looking, non-overlapping text without provenance linkage not collapsed;
  - asset hints copied factually, never mapped to design-system names.

- [ ] Run:

  ```bash
  pnpm vitest run packages/semantic-planner/src/choice-panel-candidates.test.ts
  ```

  Expected: fail because the candidate extractor does not exist.

- [ ] Implement pure candidate extraction over `DesignIRV2` plus `NormalizationProvenanceV1`.

- [ ] Use stable ordering `(y, x, nodeId)` only as a final tie-breaker. Node IDs must never be positive semantic evidence.

- [ ] Return structured rejection reasons instead of throwing for ordinary non-matches.

- [ ] Re-run the test with randomized/permuted node-map cases.

- [ ] Commit:

  ```bash
  git add packages/semantic-planner/src/choice-panel-candidates.ts packages/semantic-planner/src/choice-panel-candidates.test.ts
  git commit -m "feat: extract choice panel candidates"
  ```

---

## Task 4: Recognize one all-or-nothing compound panel

**Files:**

- Create: `packages/semantic-planner/src/recognize-choice-panel.ts`
- Create: `packages/semantic-planner/src/recognize-choice-panel.test.ts`

- [ ] Add failing tests proving the recognizer:
  - emits exactly one `choicePanel` with the Target Contract;
  - emits one logical group across both sections;
  - assigns stable opaque option IDs deterministically from retained option boundaries, never from user-visible copy;
  - emits `selectedOptionId: null` and all `selected: false`;
  - returns an exact `consumedSourceNodeIds` set;
  - emits `DUPLICATE_MATERIALIZED_NODE_COLLAPSED` as non-blocking information;
  - returns `CHOICE_PANEL_STRUCTURE_INCOMPLETE` when ownership or cardinality is incomplete;
  - never accepts a subset and never consumes unrelated descendants;
  - is invariant to raw map ordering.

- [ ] Run the new test and confirm it is red.

- [ ] Implement a recognizer result union:

  ```ts
  type ChoicePanelRecognitionResult =
    | {
        status: "recognized";
        node: UiNodeV2;
        consumedSourceNodeIds: string[];
        diagnostics: Diagnostic[];
      }
    | {
        status: "not-recognized";
        diagnostics: Diagnostic[];
      }
    | {
        status: "blocked";
        diagnostic: Diagnostic;
      };
  ```

- [ ] Calculate confidence only from enumerated structural evidence. Require the approved threshold without reusing layer names or copy.

  Use these explicit weights:

  ```text
  required:
    repeated option-row structure       0.20
    unique label per option             0.15
    consistent leading marker column    0.15
    enclosing/common panel boundary     0.15
    unique header title                 0.15

  supporting:
    repeated trailing indicator column  0.05
    subordinate descriptions            0.05
    section boundary                    0.04
    rounded outlined container          0.03
    header asset                        0.03
  ```

  Every required item is a hard gate even though their sum already exceeds
  the current automatic threshold of `0.6`. Supporting evidence refines the
  reported confidence but cannot make a rejected structure pass.

- [ ] Prove every structured field source is inside the final compound source closure before returning `recognized`.

- [ ] Re-run tests and typecheck.

- [ ] Commit:

  ```bash
  git add packages/semantic-planner/src/recognize-choice-panel.ts packages/semantic-planner/src/recognize-choice-panel.test.ts
  git commit -m "feat: recognize compound choice panels"
  ```

---

## Task 5: Integrate compound recognition and prove the real five-option result

**Files:**

- Modify: `packages/semantic-planner/src/build-ui-manifest-v2.ts`
- Modify: `packages/semantic-planner/src/build-ui-manifest-v2.test.ts`
- Modify: `packages/semantic-planner/src/index.ts`
- Modify: `apps/cli/src/plan-from-snapshot.ts`
- Modify: `apps/cli/src/react-generation-acceptance.test.ts`
- Modify: `apps/cli/src/offline-acceptance.test.ts`
- Modify: `scripts/generate-react-acceptance-candidates.ts`

- [ ] Change `buildUiManifestV2` input to require:

  ```ts
  {
    ir: DesignIRV2;
    provenance: NormalizationProvenanceV1;
    exactMappings: ExactMapping[];
  }
  ```

  Reject mismatched `sourceArtifactId` values before planning.

- [ ] Add failing integration tests proving:
  - compound recognition runs before scalar structural recognition;
  - an exact mapped boundary remains authoritative and is not stolen;
  - recognized compound descendants produce no separate low-confidence blockers;
  - unrelated descendants continue through ordinary recognition;
  - blocked compound recognition does not suppress descendants;
  - every existing call site supplies provenance.

- [ ] Add the real fixture assertion for root `70:118899`:
  - one `choicePanel`;
  - two sections;
  - five options in visual order;
  - the second section has a label;
  - exactly one locally collapsed duplicate first description;
  - no blocker for any consumed descendant;
  - no dependence on the known concrete node IDs in production code.

- [ ] Run:

  ```bash
  pnpm vitest run packages/semantic-planner/src/build-ui-manifest-v2.test.ts apps/cli/src/offline-acceptance.test.ts
  ```

  Expected: red before integration, green after integration.

- [ ] Run a repository search that must return no production matches for the source IDs or Russian strings:

  ```bash
  rg -n '70:118899|27:101325|Сделка требует корректировок|Приостановить обработку' packages apps --glob '!*.test.ts'
  ```

  Expected: no matches.

- [ ] Commit:

  ```bash
  git add packages/semantic-planner/src/choice-panel-candidates.ts packages/semantic-planner/src/choice-panel-candidates.test.ts packages/semantic-planner/src/recognize-choice-panel.ts packages/semantic-planner/src/recognize-choice-panel.test.ts packages/semantic-planner/src/build-ui-manifest-v2.ts packages/semantic-planner/src/build-ui-manifest-v2.test.ts packages/semantic-planner/src/index.ts apps/cli/src/plan-from-snapshot.ts apps/cli/src/offline-acceptance.test.ts apps/cli/src/react-generation-acceptance.test.ts scripts/generate-react-acceptance-candidates.ts
  git commit -m "feat: plan structural choice panels"
  ```

---

## Task 6: Add the bounded structured React recipe contract

**Files:**

- Modify: `packages/contracts/src/react-render-recipes.ts`
- Modify: `packages/contracts/src/react-pack-contracts.test.ts`
- Modify: `packages/component-catalog/src/normalize-react-recipes.ts`
- Modify: `packages/component-catalog/src/validate-react-recipes.ts`
- Modify: `packages/component-catalog/src/validate-react-recipes.test.ts`

- [ ] Add failing contract tests for the exact `ReactSingleSelectionCollectionRecipe` interface.

- [ ] Cover rejection of:
  - unknown recipe kinds and fields;
  - unsupported semantic roles;
  - arbitrary source strings;
  - duplicate recipes for the same role;
  - missing component IDs;
  - identical root/option IDs where the composition would be invalid;
  - optional icon component IDs not present in the catalog;
  - missing scalar component render recipes for referenced leaf components.

- [ ] Prove existing v1/v2 pack documents normalize to an effective v2 document with `singleSelectionCollections: []`.

- [ ] Run:

  ```bash
  pnpm vitest run packages/contracts/src/react-pack-contracts.test.ts packages/component-catalog/src/validate-react-recipes.test.ts
  ```

  Expected: red before the schema exists.

- [ ] Add `singleSelectionCollections` to effective React recipe v2 and implement closed validation.

- [ ] Keep the opcode and sources as literal unions; do not accept general JSON pointers.

- [ ] Re-run focused tests, all component-catalog tests, and typecheck.

- [ ] Commit:

  ```bash
  git add packages/contracts/src/react-render-recipes.ts packages/contracts/src/react-pack-contracts.test.ts packages/component-catalog/src/normalize-react-recipes.ts packages/component-catalog/src/validate-react-recipes.ts packages/component-catalog/src/validate-react-recipes.test.ts
  git commit -m "feat: add single selection render recipes"
  ```

---

## Task 7: Teach the Sber pack to resolve `choicePanel`

**Files:**

- Modify: `design-system-packs/sber-space-ui/catalog.json`
- Modify: `design-system-packs/sber-space-ui/semantic-policy.json`
- Modify: `design-system-packs/sber-space-ui/react-render-recipes.json`
- Modify: `design-system-packs/sber-space-ui/verification.json`
- Modify: `packages/component-catalog/src/load-pack.test.ts`
- Modify: `packages/component-resolver/src/resolve-ui-manifest-v2.ts`
- Modify: `packages/component-resolver/src/resolve-ui-manifest-v2.test.ts`

- [ ] Add a failing pack-load test for the complete verified Sber recipe.

- [ ] Add resolver tests for:
  - `choicePanel` resolves as `compose`;
  - required bindings include RadioGroup, RadioButton, Stack, Typography, and FormDescription;
  - present optional icons are included deterministically;
  - absent optional icons warn and do not block;
  - any missing required binding blocks with the existing composition-resolution error family;
  - no fallback is emitted.

- [ ] Run:

  ```bash
  pnpm vitest run packages/component-catalog/src/load-pack.test.ts packages/component-resolver/src/resolve-ui-manifest-v2.test.ts
  ```

- [ ] Add or verify catalog entries and canonical provenance for the seven approved exports listed in Global Constraints.

- [ ] Add `choicePanel` policy with `nativeFallback: false`.

- [ ] Add one Sber `single-selection-collection` recipe. Use `value`, `onChange`, `direction="column"`, and `groupName` only as pack-owned prop targets/values.

- [ ] Extend resolution narrowly if optional structured bindings cannot be represented today. Do not introduce generator-side catalog lookup.

- [ ] Run pack validation and inspect the changed pack SHA-256 expected by resolver fixtures.

- [ ] Commit:

  ```bash
  git add design-system-packs/sber-space-ui packages/component-catalog/src/load-pack.test.ts packages/component-resolver/src/resolve-ui-manifest-v2.ts packages/component-resolver/src/resolve-ui-manifest-v2.test.ts
  git commit -m "feat: add sber choice panel recipe"
  ```

---

## Task 8: Lower structured content into a typed React model

**Files:**

- Modify: `packages/generator-react/src/generation-model.ts`
- Create: `packages/generator-react/src/build-single-selection-model.ts`
- Create: `packages/generator-react/src/build-single-selection-model.test.ts`
- Modify: `packages/generator-react/src/build-react-generation-model.ts`
- Modify: `packages/generator-react/src/build-react-generation-model.test.ts`
- Modify: `packages/generator-react/src/build-import-model.ts` if required
- Modify: corresponding import-model tests if required

- [ ] Define a dedicated model that contains only emitter-ready data:
  - resolved local component names;
  - title and ordered sections/options;
  - render-only empty selected value;
  - render-only noop change handler;
  - fixed group name;
  - optional resolved asset local names;
  - deterministic class names;
  - source IDs for reports.

- [ ] Add failing tests proving:
  - five manifest options become five option models in order;
  - one root group owns both sections;
  - `selectedOptionId: null` becomes the documented empty-string group value rather than local state;
  - the group receives the emitter-owned noop handler and exposes no application callback;
  - option components receive values, not independent checked state;
  - absent optional icons do not create imports;
  - required missing bindings block before emission;
  - duplicate imports are coalesced through the normal import model;
  - an ordinary modal model is unchanged.

- [ ] Run:

  ```bash
  pnpm vitest run packages/generator-react/src/build-single-selection-model.test.ts packages/generator-react/src/build-react-generation-model.test.ts
  ```

- [ ] Implement lowering by matching `node.role` to a validated structured recipe before generic composition handling.

- [ ] Keep all concrete component names supplied by resolution bindings and pack recipes.

- [ ] Re-run focused tests and search for forbidden generator knowledge:

  ```bash
  rg -n 'sber|RadioGroup|RadioButton|70:118899' packages/generator-react/src --glob '!*.test.ts'
  ```

  Expected: no matches.

- [ ] Commit:

  ```bash
  git add packages/generator-react/src
  git commit -m "feat: lower single selection collections"
  ```

---

## Task 9: Emit deterministic TSX and CSS for the whole panel

**Files:**

- Modify: `packages/generator-react/src/build-style-model.ts`
- Modify: `packages/generator-react/src/build-style-model.test.ts`
- Modify: `packages/generator-react/src/emit-tsx.ts`
- Modify: `packages/generator-react/src/emit-tsx.test.ts`
- Modify: `packages/generator-react/src/emit-css.ts` if needed
- Modify: corresponding CSS tests if needed

**Expected structural shape:**

```tsx
<section className={styles.choicePanel}>
  <Stack className={styles.header}>...</Stack>
  <RadioGroup
    value=""
    onChange={() => {}}
    direction="column"
    groupName={title}
  >
    <section className={styles.choiceSection}>...</section>
    <section className={styles.choiceSection}>...</section>
  </RadioGroup>
</section>
```

- [ ] Add failing emitter tests for:
  - exactly one `RadioGroup` and five `RadioButton` elements;
  - both visual sections inside the same group;
  - title, section label, descriptions, and option IDs from the typed model;
  - optional leading/trailing icons;
  - no tooltip implementation;
  - no `useState`, native radio, checkbox, business handler, or invented text;
  - stable TSX under input-map permutation.

- [ ] Add failing style tests for:
  - root border, radius, padding, and background derived from DesignIR under the existing style policy;
  - fixed structural classes for header, sections, option rows, description, and trailing asset alignment;
  - deterministic declarations;
  - no `!important`, global selectors, library internals, or source IDs;
  - no selected-green recovery in this slice.

- [ ] Implement emission through TypeScript factory nodes, not string-interpolated JSX.

- [ ] If intrinsic wrappers are required, keep their tag set closed to the existing safe intrinsic model plus the minimum reviewed `section` extension.

- [ ] Run:

  ```bash
  pnpm vitest run packages/generator-react/src/emit-tsx.test.ts packages/generator-react/src/build-style-model.test.ts
  ```

- [ ] Commit:

  ```bash
  git add packages/generator-react/src
  git commit -m "feat: emit choice panel react output"
  ```

---

## Task 10: Review and accept the real generated artifact

**Files:**

- Create: `fixtures/react-generation/pixso-70-118899/sber-space-ui/resolution-plan.json`
- Create: `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.tsx`
- Create: `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.module.css`
- Create: `fixtures/react-generation/pixso-70-118899/sber-space-ui/generated/generation-report.json`
- Modify: `fixtures/react-generation/README.md`
- Modify: `scripts/generate-react-acceptance-candidates.ts`
- Modify: `apps/cli/src/react-generation-acceptance.test.ts`

- [ ] Add a failing acceptance case that expects a reviewed `pixso-70-118899` fixture set.

- [ ] Generate candidate files into the repository's candidate area:

  ```bash
  pnpm generate:react-acceptance-candidates
  ```

- [ ] Manually compare the candidate against the source image and contract:
  - complete outer bordered panel;
  - title and leading icon;
  - five radios in two sections;
  - all descriptions exactly once;
  - five trailing info icons when bindings are available;
  - no open tooltip;
  - no selected option;
  - imports match verified Sber paths.

- [ ] Copy only reviewed candidate bytes into the accepted fixture directory and record provenance.

- [ ] Run:

  ```bash
  pnpm test:acceptance
  pnpm verify:fixtures
  ```

- [ ] Re-run candidate generation and prove the accepted files are byte-identical.

- [ ] Commit:

  ```bash
  git add fixtures/react-generation/pixso-70-118899 fixtures/react-generation/README.md scripts/generate-react-acceptance-candidates.ts apps/cli/src/react-generation-acceptance.test.ts
  git commit -m "test: accept real choice panel generation"
  ```

---

## Task 11: Rebuild Qwen and verify the ordinary extension workflow

**Files:**

- Modify generated: `dist/qwen-adapter.mjs`
- Modify generated: `dist/qwen-adapter.provenance.json`
- Modify extension tests only if the public compact result contract genuinely changes.

- [ ] Run all focused suites once before the bundle rebuild:

  ```bash
  pnpm vitest run packages/contracts packages/design-normalizer packages/semantic-planner packages/component-catalog packages/component-resolver packages/generator-react apps/cli/src/offline-acceptance.test.ts apps/cli/src/react-generation-acceptance.test.ts
  ```

- [ ] Rebuild and verify the portable extension:

  ```bash
  pnpm build:qwen-extension
  pnpm verify:qwen-extension-bundle
  pnpm test:qwen-extension
  ```

- [ ] Run the full repository gate:

  ```bash
  pnpm verify
  ```

  Expected: formatting, typecheck, fixture provenance, bundle reproducibility, and all tests pass.

- [ ] Run the installed Qwen extension from a clean target workspace:

  ```text
  /uig:plan https://pixso.net/app/design/PqSywlhYgqSRDoWr78IrdA?item-id=70:118899 --design-system sber-space-ui
  /uig:generate <returned-run-id>
  ```

- [ ] Inspect durable artifacts under the target workspace `.uig/runs/<run-id>` and confirm:
  - planning status is ready;
  - one compound choice panel replaces the previous 79 blocked descendants;
  - the pack ID, version, and new SHA-256 are pinned;
  - generated TSX/CSS match the accepted fixture;
  - Qwen output remains compact and contains no raw DSL, provenance dump, or token.

- [ ] Commit the reproducible bundle separately:

  ```bash
  git add dist/qwen-adapter.mjs dist/qwen-adapter.provenance.json
  git commit -m "build: refresh qwen extension bundle"
  ```

---

## Final Review Checklist

- [ ] Read the approved design spec and map every requirement to a passing test or an explicit out-of-scope assertion.
- [ ] Confirm there are no placeholders, `TODO`, `TBD`, guessed APIs, or unverified imports.
- [ ] Confirm `choicePanel` remains provider-neutral through DesignIR and UiManifest.
- [ ] Confirm the normalizer preserves only factual `asset.name`.
- [ ] Confirm the recognizer is structural, all-or-nothing, deterministic, and provenance-aware.
- [ ] Confirm only proven descendants are consumed and unrelated nodes remain visible to diagnostics.
- [ ] Confirm structured field source IDs satisfy manifest integrity.
- [ ] Confirm the pack recipe is closed data and cannot execute arbitrary code or paths.
- [ ] Confirm required Sber bindings block when unavailable and optional icons only warn.
- [ ] Confirm generator production code contains no Sber names, Pixso IDs, or source copy.
- [ ] Confirm generated output contains no business logic, tooltip behavior, or local selected state.
- [ ] Confirm existing modal acceptance remains byte-identical unless a reviewed pack-hash update is mechanically required.
- [ ] Confirm fixture and generated-artifact provenance is exact.
- [ ] Confirm `pnpm verify` and the Qwen extension smoke run pass.
