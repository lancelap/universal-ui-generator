# Pixso 70:118892 Post-fix Baseline

- **Date:** 2026-07-29
- **Fixture:** `PqSywlhYgqSRDoWr78IrdA / 70:118892`
- **Artifact:** `pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628`
- **Design system:** `sber-space-ui`
- **Run:** `run_20260729T024101358Z_70-118892`

## Normalization

- Result: PASS
- Root node: `70:118892`
- Normalized node count: 324
- Normalization diagnostics: 0
- Keyless instance: `70:118899`
- Keyless definition: `31:100831`
- Recovered property: `27:101325/4:63130`
- Recovered geometry: `x=0`, `y=20`, `width=561`, `height=32`

The property text remains an `instance-override`. Its four geometry fields
are `component-default` values from definition `31:100831`. No component key
is synthesized.

## Semantic Manifest

The manifest contains 324 nodes:

| Role | Count |
| --- | ---: |
| `verticalGroup` | 10 |
| `horizontalGroup` | 6 |
| `unresolved` | 308 |

All 16 recognized nodes resolve through the verified Sber
`base.Stack` binding:

| Manifest node ID | Role | Source node IDs |
| --- | --- | --- |
| `ui_verticalGroup_70-118892` | `verticalGroup` | `70:118892` |
| `ui_verticalGroup_70-118899` | `verticalGroup` | `70:118899` |
| `ui_horizontalGroup_27-101324` | `horizontalGroup` | `27:101324` |
| `ui_verticalGroup_27-101369` | `verticalGroup` | `27:101369` |
| `ui_verticalGroup_31-100831` | `verticalGroup` | `31:100831` |
| `ui_verticalGroup_70-118897` | `verticalGroup` | `70:118897` |
| `ui_horizontalGroup_66-112964` | `horizontalGroup` | `66:112964` |
| `ui_horizontalGroup_66-113067` | `horizontalGroup` | `66:113067` |
| `ui_verticalGroup_66-113068` | `verticalGroup` | `66:113068` |
| `ui_horizontalGroup_70-139877` | `horizontalGroup` | `70:139877` |
| `ui_horizontalGroup_71-80329` | `horizontalGroup` | `71:80329` |
| `ui_horizontalGroup_70-139876` | `horizontalGroup` | `70:139876` |
| `ui_verticalGroup_71-80333` | `verticalGroup` | `71:80333` |
| `ui_verticalGroup_70-118898` | `verticalGroup` | `70:118898` |
| `ui_verticalGroup_66-99075` | `verticalGroup` | `66:99075` |
| `ui_verticalGroup_66-99477` | `verticalGroup` | `66:99477` |

The other 308 manifest nodes retain their source IDs but have the role
`unresolved`. Representative unresolved source IDs for the first missing
structure are recorded below.

## Resolution

| Decision | Count |
| --- | ---: |
| `reuse` | 16 |
| `compose` | 0 |
| `fallback` | 0 |
| `blocked` | 308 |

Resolution diagnostic counts:

| Diagnostic code | Count |
| --- | ---: |
| `SEMANTIC_CONFIDENCE_TOO_LOW` | 308 |
| `NATIVE_FALLBACK_FORBIDDEN` | 308 |
| `VISUAL_TOKEN_MISMATCH` | 58 |

First blocking diagnostic:

```json
{
  "blocking": true,
  "code": "SEMANTIC_CONFIDENCE_TOO_LOW",
  "evidence": {
    "candidateRole": "none",
    "confidence": 0
  },
  "message": "No semantic role reached confidence 0.6",
  "severity": "error",
  "source": {
    "artifactId": "pixso_PqSywlhYgqSRDoWr78IrdA_70_118892_899812d8c628",
    "nodeId": "2:7982/27:101320"
  },
  "stage": "semantic-planning"
}
```

## First Missing Semantic Structure

A read-only key/value details grid is visible in the design but is not
represented by a dedicated manifest role.

The first complete evidence block is:

- `70:118897`, named `Дополнительные атрибуты сделки`, is a `752x116`
  instance at `x=24`, `y=300` with 15 normalized children.
- The parent `2:7646/66:112965` contains two text children:
  `2:7648/66:112965/2:7648` with `Дата договора` and
  `2:7650/66:112965/2:7650` with `31.07.2020`.
- The manifest classifies `70:118897` only as `verticalGroup`.
- The pair parent is `ui_unresolved_2-7646-66-112965`, role `unresolved`,
  confidence `0.35`, with evidence
  `label-value-text: two text children`.
- Both text children are separately `unresolved`, also at confidence `0.35`.

The same structure repeats more extensively in `70:118898`, named
`Реквизиты`:

- it is a `752x284` instance at `x=24`, `y=440` with 45 normalized children;
- `2:7864/66:98907` groups label
  `2:7866/66:98907/2:7866` (`Наименование`) and value
  `2:7868/66:98907/2:7868` (`ПАО СБЕРБАНК`);
- the pair parent and both text children remain `unresolved` at confidence
  `0.35`;
- other repeated fields include `Номер счета`,
  `Корреспондентский счет`, `Наименование банка`, `КПП`, `SWIFT-код`, and
  `Бик`.

This is structural evidence for a details-field/details-grid pattern, not an
editable text input. The current planner has the two-text-child signal but
does not yet convert it into label/value semantics or group repeated fields
into a details section.

## Secondary Observed Gap

`70:118899`, named `Выбор действий`, contains repeated action choices and is
also reduced to a generic `verticalGroup` plus unresolved children. For
example, `4:63078/27:101325` contains an action title and explanatory text,
including the newly materialized `4:63130/27:101325/4:63130`.

This action-choice structure is real, but it is not the first follow-up slice.
It should be reconsidered after the details-grid recognizer is designed and
verified.

## Recommended Next Slice

Design a provider-neutral `detailsField` and `detailsGrid` structural
recognizer:

1. recognize a stable label/value pair from hierarchy, geometry, and the
   existing `label-value-text` signal;
2. group repeated pairs under a details section without relying on Russian
   strings or fixture node IDs;
3. keep read-only details distinct from editable `textInput`;
4. add a Sber projection/recipe only after the semantic contract is approved;
5. test both `Дополнительные атрибуты сделки` and `Реквизиты` as real
   acceptance evidence.

Do not implement that recognizer as part of keyless definition resolution.
