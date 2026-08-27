# Wave 0 Measurement and Contracts Design

**Date:** 2026-08-27
**Status:** Design approved section-by-section; awaiting final specification review
**Scope:** Measurement infrastructure only; no generator-quality changes

## 1. Product objective

The product is not expected to autonomously generate a 100% production-ready frontend.
Its objective is to turn a Pixso design into a 70-80% complete layout/UI draft that a
frontend developer can bring to production-ready UI in no more than 30 minutes median
active correction time.

The primary users are an analyst and a frontend developer. The product is the complete
delivery loop, not only the first code-generation step:

```text
Pixso -> Generator -> Preview/Review -> AI-assisted correction -> PR -> Developer review
```

The generated scope is presentation-only:

- layout and visual structure;
- visible text and presentation states;
- design-system components and composition;
- responsive structure when supported by design evidence or explicit rules.

The following remain out of scope:

- API and data loading;
- domain state and state management;
- permissions;
- business validation;
- business logic;
- production submit handlers;
- navigation behavior not represented as presentation.

### Project Definition of Done

On a representative regression benchmark, the generator creates 70-80% of a page's
layout/UI with components from the selected design system. Using the Pixso-versus-generated
review flow and Qwen-assisted correction, a frontend developer reaches production-ready UI
with median active correction time no greater than 30 minutes.

The 70-80% phrase is a product objective, not a synthetic precision score. The benchmark
measures observable indicators and uses developer correction time as its primary outcome.

## 2. Existing pipeline and terminology

Wave 0 reuses the existing architecture:

```text
Pixso DSL
  -> DesignSnapshot
  -> DesignIRV2
  -> UiManifestV2
  -> ResolutionPlanV2
  -> generated React source
```

The contracts have the following ownership:

| Artifact | Responsibility |
| --- | --- |
| `DesignSnapshot` | Pixso acquisition identity, source URL/node and raw content hash |
| lossless Pixso `source.json` | immutable provider evidence |
| `DesignIRV2` | provider-normalized, UI-significant compact structure |
| `UiManifestV2` | design-system-neutral semantic interpretation |
| `ResolutionPlanV2` | concrete decisions for a selected design-system pack |
| generated React artifacts | presentation source produced from the plan |

`Compact UI Snapshot` is the product term for the normalized UI-significant artifact.
Its machine contract is the existing `design-ir/v2`; Wave 0 does not add a duplicate
`compact-ui-snapshot` schema. If benchmark evidence proves that `DesignIRV2` loses required
information, a later version of `DesignIR` will extend it explicitly.

## 3. Measurement model

### 3.1 Benchmark unit

One benchmark case is a reproducible combination of:

```text
Pixso source identity
+ frozen DesignIRV2
+ design-system pack
+ effective component-catalog provenance
+ generator version/commit
+ generated artifacts
+ automated validation
+ optional human review
```

Every run records exact SHA-256 values. A change in design input, design-system pack,
effective component catalog or generator commit is visible and affects comparability.

### 3.2 First-shot metrics

The uncorrected result records at least:

- generation status: `generated`, `blocked` or `failed`;
- contract, planning, resolution and generation stage status;
- syntax, typecheck, build and render validation status;
- resolved/reused, composed, fallback, blocked, ambiguous and unresolved counts;
- expected, matched, missing and extra element counts;
- expected, correct and incorrect design-system component counts;
- structural review: `acceptable`, `minor-corrections`, `major-corrections` or `unusable`;
- diagnostic code counts;
- artifact paths and hashes.

Derived indicators include:

```text
elementRecall = matchedElementCount / expectedElementCount
correctComponentRate = correctDsComponentCount / expectedDsComponentCount
```

No single synthetic `UI quality = 77.4%` score is introduced in Wave 0.

### 3.3 Developer correction time

The timer starts when a developer first opens the prepared review for a generation. It ends
when the layout/UI is visually accepted, required elements and components are acceptable,
available typecheck/build validation passes, and the developer considers the UI ready for a
PR without requiring business-logic implementation.

Included time:

- inspecting generated output and diagnostics;
- comparing with Pixso;
- preparing and running Qwen corrections;
- waiting for normal Qwen responses;
- manual TSX/CSS changes;
- repeated preview, typecheck and build checks.

Excluded time:

- initial environment setup unrelated to the generated UI;
- waiting for Pixso access;
- external authentication, network or service outages;
- API, state, permission, domain-validation and business-logic work;
- unrelated pre-existing project failures.

Pauses require a recorded external reason. A bad prompt, an incorrect Qwen change, another
Qwen iteration or a required manual UI fix is not a pause.

The primary metric is:

```text
median(activeCorrectionSeconds) <= 1800
```

Reports also show p75, minimum, maximum, the rate completed within 30 minutes, blocked and
unusable cases, and category/complexity breakdowns. The primary median includes only
comparable `qwen-assisted` reviews completed as `ready-for-pr`.

### 3.4 Automatic and human evidence

Automatic evidence includes stage status, diagnostics, artifacts, hashes, syntax,
typecheck/build/render when configured, resolution counts and pipeline durations.

Human evidence includes element and component correctness, structural quality, issue
classification, active correction time, Qwen iterations, manual edit count and final status.

Wave 0 deliberately does not add a visual AI judge. Human review of a small representative
suite is the initial source of product-quality evidence.

## 4. Three regression levels

### 4.1 Normalizer regression

Five to eight selected lossless Pixso fixtures exercise:

```text
frozen raw Pixso DSL -> rule-based normalizer -> DesignIRV2
```

Coverage includes multiple exported roots, instances and overrides, auto-layout, absolute
positioning, large/repeated structures, and UI-significant geometry, appearance, typography,
component and asset data. These fixtures remain under `fixtures/pixso` and follow the current
fixture provenance policy.

### 4.2 Generation benchmark

The representative 15-25-screen suite starts from frozen `DesignIRV2`:

```text
frozen DesignIRV2
  -> semantic planner
  -> component resolver
  -> React generator
  -> automated validation
  -> human review and correction
```

This is the product benchmark and the source of developer correction-time metrics. Starting
from compact artifacts makes it fast, offline and independent of Pixso availability while
isolating semantic/resolution/generation changes from normalizer changes.

### 4.3 End-to-end smoke

Two to four real nodes exercise live Pixso retrieval through generation and render. The smoke
run is used before releases or after Pixso provider/normalizer changes. It is not required for
every local benchmark because it depends on a token, network and an external service.

## 5. Benchmark suite composition

The first active suite targets 20 cases, with a permitted range of 15-25:

| Primary category | Target count |
| --- | ---: |
| simple form | 2 |
| long form | 2 |
| table | 2 |
| table with filters | 2 |
| details/read-only | 2 |
| modal | 3 |
| side panel | 2 |
| complex page layout | 3 |
| toolbar/action-heavy | 1 |
| empty/error/loading presentation | 1 |

Each case has one primary category and any number of orthogonal traits, including
`repeated-content`, `nested-layout`, `ambiguous-component`, `project-component`,
`design-system-composition`, `mixed-flow-and-absolute`, `overlay`, `tooltip`, `icons`,
`large-text-content`, `conditional-looking-ui`, `multiple-sections` and `large-screen`.

The suite must include representative coverage of nested/repeated layouts, ambiguous and
project components, design-system compositions, overlays/tooltips and large screens. Target
complexity distribution is five small, ten medium and five large cases. Complexity is based
on semantic elements, regions, semantic depth, repeated collections, ambiguities and
composition candidates, not raw Pixso node count.

Each case contains:

```text
cases/<case-id>/
  design-ir.json
  reference.png
  expectations.json
  notes.md
```

`expectations.json` describes required regions, semantic elements, text and optionally
allowed design-system components. It does not prescribe a single React implementation.
There is no product-level `expected.tsx`; existing React generation fixtures continue to
test deterministic generator behavior separately.

An accepted case has an exact Pixso URL/file key/node ID, verified reference and DesignIR,
approved test-material status, no secrets or personal data, classification, expectations and
a reason for adding distinct coverage.

A typical benchmark bug becomes a minimal regression fixture at the layer that caused it.
Whole-screen benchmark cases are added only for new representative scenarios or errors that
depend on full-screen composition.

## 6. Contracts

Wave 0 adds closed, versioned TypeBox schemas and TypeScript types under `@uig/contracts`:

```text
benchmark-suite/v1
benchmark-expectations/v1
benchmark-validation-profile/v1
benchmark-run/v1
benchmark-review/v1
benchmark-report/v1
benchmark-comparison/v1
benchmark-baseline/v1
component-metadata-source/v1
```

Unknown fields are rejected. Integrity checks cover relationships that JSON Schema alone
cannot prove.

### 6.1 Suite and expectations

The suite records its ID, version, lifecycle (`draft`, `active`, `retired`), target framework,
design system, validation profile, cases, source hashes, classification and review
requirements. Case IDs are unique and paths must stay within the suite root.

An active official suite must have at least 15 approved cases and required category/trait
coverage. Smaller draft suites are valid for runner development but not baseline-eligible.

### 6.2 Validation status

Every validation stage uses a discriminated status:

```text
passed  -> duration and evidence
failed  -> duration and diagnostic codes
not-run -> explicit reason
```

Supported `not-run` reasons include `previous-stage-blocked`, `harness-not-configured`,
`dependency-not-available` and `not-supported`. `not-run` is not counted as a pass or a
failure.

### 6.3 Run

`benchmark-run/v1` is immutable and records suite/case identity, environment, generator and
catalog provenance, stage outcomes, resolution and diagnostic counts, and artifact paths.
`generated` requires source artifacts, `blocked` requires blocking evidence, and artifact
paths must remain inside the run directory.

### 6.4 Review

`benchmark-review/v1` is separate from the automatic run. It records first-shot review,
issues, correction timing, workflow (`qwen-assisted` or `manual-only`), Qwen metadata,
pseudonymous reviewer ID/experience, iterations, edits, changed files and final status.

### 6.5 Report and comparison

`benchmark-report/v1` aggregates runs and reviews. Summary metrics are recalculated from case
evidence rather than trusted from input. `benchmark-comparison/v1` separates hard regressions,
warnings, improvements and non-comparable changes.

Hard regressions include a previously generated case becoming blocked/failed, a previously
passing technical validation failing, a missing case or required element, invalid contracts
and absent required artifacts. Human-metric decreases start as warnings until repeated runs
provide enough evidence for numeric gates.

Changed suite, DesignIR, design-system pack, effective catalog, project context or correction
workflow can make results non-comparable. The report must state the reason rather than claim
an improvement or regression.

### 6.6 Baseline

`benchmark-baseline/v1` identifies the accepted suite/report/generator commit and approver.
A dirty-worktree run is useful for exploration but cannot become an official baseline.
Baselines are never overwritten or promoted automatically.

## 7. Component metadata providers and Storybook MCP

Core generation consumes a normalized effective component catalog and does not know whether
metadata came from static JSON, project scan, Storybook, Storybook MCP or another DS MCP.

Providers are policy-driven per team adapter:

```text
static catalog
+ project scanner
+ project mappings
+ accepted Storybook snapshot
+ accepted Storybook MCP snapshot
+ accepted design-system MCP snapshot
  -> Effective Component Catalog
  -> Component Resolver
```

### 7.1 Two-level requirement

Storybook MCP may be mandatory for onboarding, contract verification and activation of a
team's Shared or custom design-system components. A live Storybook MCP request is not required
for every normal generation by default. Normal generation requires the last accepted,
verified metadata snapshot.

If a required provider has never produced an accepted snapshot, affected components cannot
become `enabled`. If a provider is temporarily unavailable but an accepted snapshot exists,
generation uses it and applies the team's staleness policy.

### 7.2 Component lifecycle

```text
discovered
  -> contract-resolved
  -> semantic-mapped
  -> verified
  -> enabled
```

Only `enabled` components are eligible for automatic resolution. Other states remain visible
for review/search but are not silently emitted into generated source.

For Shared components, project scan can prove package/export existence, Storybook MCP can
provide props, variants and examples, and explicit mapping can prove semantic role. A team
with a custom design system may declare Storybook MCP as its primary authoritative metadata
provider and optionally expose semantic annotations through Storybook.

### 7.3 Provider policy

`component-metadata-source/v1` records provider ID/kind, authority, required lifecycle stages,
generation mode (`accepted-snapshot` or explicit `live`), and missing/stale policies. The
recommended default is:

```text
required for component activation
accepted-snapshot for generation
warn on stale
block component activation on missing snapshot
```

A team may explicitly choose stricter `block-generation` behavior. Core does not impose it.

### 7.4 Benchmark provenance

Benchmark runs never call metadata MCPs live. They record the effective catalog hash and all
source snapshot IDs, kinds, versions, hashes and required/optional modes. A changed catalog
hash is visible in comparison and may make the result non-comparable.

Wave 0 implements policy/provenance contracts only. It does not implement a Storybook MCP
transport, live refresh or project-aware resolver integration.

## 8. Runner architecture

Wave 0 adds `@uig/benchmark-runner` as an outer orchestration/measurement layer. It depends
on existing contracts, catalog, semantic planner, resolver, generator and design context.
Core pipeline packages never depend on the runner.

The runner uses public package functions directly and never parses CLI output or invokes the
existing CLI as a subprocess.

Main operations:

```ts
validateBenchmarkSuite(...)
runBenchmark(...)
recordBenchmarkReview(...)
aggregateBenchmarkReport(...)
compareBenchmarkReports(...)
```

Thin repo scripts expose:

```text
pnpm benchmark:validate
pnpm benchmark:run
pnpm benchmark:report
pnpm benchmark:compare
pnpm benchmark:review
```

These are repository-development commands, not new Qwen `/uig:*` user commands.

### 8.1 Run lifecycle

The runner validates the suite, paths and hashes; captures generator, pack, catalog and
environment identity; creates a new output directory; runs cases sequentially; saves all
case evidence; aggregates a candidate report; and optionally compares it with a baseline.

Suite-level contract/path/hash/output errors stop the run. A blocked, unresolved, failed
generation, typecheck failure or build failure is a case result and does not hide remaining
case results.

Execution is sequential (`workers = 1`) in Wave 0 for deterministic resource use and easier
diagnosis.

### 8.2 Immutable artifacts

Temporary runs are stored under:

```text
.uig/benchmarks/<run-id>/
  run.json
  report.json
  environment.json
  cases/<case-id>/...
  workspaces/<case-id>/...
```

An existing run ID is never reused. Generated workspaces are isolated and the runner never
writes into a team's working application.

Accepted baselines are explicitly copied to:

```text
benchmarks/baselines/<suite-id>/<baseline-id>/
```

Node modules, caches and heavy temporary build files are excluded from committed baselines.

### 8.3 Validation profiles

A declarative validation profile identifies a controlled target-project fixture and enabled
syntax/typecheck/build/render validators. Suite files cannot contain arbitrary shell commands.

The current repository has Sber catalog/recipes but does not install real
`@sber-space-ui/*` packages. Wave 0 must not invent declaration stubs and claim real API
compatibility. The pilot can perform contract/planning/resolution/generation and TypeScript
syntax validation. Sber typecheck/build/render are recorded as `not-run` with an explicit
reason until an approved validation project with real dependencies is available.

## 9. Repository layout

```text
benchmarks/
  README.md
  candidate-inventory.json
  suites/
    sber-space-ui-pilot-v1/
      suite.json
      cases/<case-id>/...
  validation-profiles/
    sber-space-ui-react-v1/...
  baselines/
    <suite-id>/<baseline-id>/...

packages/contracts/src/
  benchmark-*.ts
  component-metadata-source.ts

packages/benchmark-runner/
  package.json
  src/...

scripts/benchmark/
  validate.ts
  run.ts
  report.ts
  compare.ts
  review.ts
```

The current four real Pixso fixtures (`4:314`, `6:12547`, `70:118892`, `70:118899`) are
candidates for a draft `sber-space-ui-pilot-v1`. Only those with reviewed `DesignIRV2` are
included. The pilot validates infrastructure but is not presented as the representative
project baseline. An official active suite requires at least 15 approved real cases.

## 10. Stable runner errors

Wave 0 introduces stable benchmark error codes including:

```text
BENCHMARK_SUITE_INVALID
BENCHMARK_CASE_DUPLICATE
BENCHMARK_CASE_SOURCE_MISSING
BENCHMARK_CASE_HASH_MISMATCH
BENCHMARK_CASE_PATH_OUTSIDE_ROOT
BENCHMARK_EXPECTATIONS_INVALID
BENCHMARK_VALIDATION_PROFILE_INVALID
BENCHMARK_PACK_NOT_FOUND
BENCHMARK_PACK_HASH_MISMATCH
BENCHMARK_OUTPUT_ALREADY_EXISTS
BENCHMARK_RUN_INTEGRITY_FAILED
BENCHMARK_REVIEW_INVALID
BENCHMARK_BASELINE_INELIGIBLE
BENCHMARK_REPORT_NOT_COMPARABLE
```

Existing pipeline codes such as `SEMANTIC_CONFIDENCE_TOO_LOW` remain intact and are recorded
inside the case result rather than being replaced by a generic benchmark failure.

## 11. Testing

Contract tests cover valid fixtures, closed schemas, invalid versions/counters/timestamps,
duplicates, inconsistent summaries, missing references and path traversal.

Runner unit tests cover suite loading, deterministic order, hashes, immutable outputs, stage
transitions, blocked and failed cases, syntax validation, `not-run` propagation, aggregation,
median/p75, report comparability and review timing.

Integration tests include generated, semantic-blocked and simulated-failure cases plus a
mixed-outcome suite that must preserve every case result.

The pilot acceptance run is offline and requires no Pixso token, MCP, network, Qwen or
installed Sber packages.

Repository verification after implementation includes the existing formatting, TypeScript,
fixture, Qwen bundle and test gates plus pilot suite validation/run. The Qwen extension bundle
must remain reproducible because Wave 0 does not change its user-facing behavior.

## 12. Documentation

Wave 0 adds durable documentation for:

- the product goal and layout/UI-only boundary;
- benchmark architecture and case policy;
- metric definitions and correction timing;
- `DesignIRV2` as the Compact UI Snapshot;
- baseline acceptance and comparison;
- honest distinction between syntax, typecheck, build and render;
- provider-agnostic metadata and Storybook MCP policy;
- the future Preview/Review, correction and OpenSpec layers as explicitly unimplemented.

## 13. Implementation boundary and Definition of Done

The implementation changes measurement infrastructure only. It does not change normalizer,
semantic, resolution, render recipes or generated React behavior.

Wave 0 implementation is complete when:

- all benchmark/provider-provenance contracts and integrity checks are implemented/exported;
- the draft pilot suite validates and runs offline;
- blocked cases do not stop the suite;
- run evidence is immutable;
- reports aggregate reproducibly;
- comparisons classify regressions, warnings, improvements and non-comparable changes;
- reviews can be recorded without hand-editing JSON;
- unavailable real Sber typecheck/build/render are honestly `not-run`;
- no fake Sber type declarations are introduced;
- existing repository and Qwen bundle verification passes;
- documentation captures the product DoD, contracts, benchmark policy and metadata-provider
  decision;
- no official representative baseline is claimed until 15-25 real cases are approved.

## 14. Deferred roadmap

After Wave 0, separate approved slices may implement:

1. project catalog and accepted metadata snapshots in component resolution;
2. resolved/ambiguous/unresolved diagnostics and component activation;
3. generated preview and Pixso-versus-generated review page;
4. correction-context generation and Qwen-assisted refresh loop;
5. OpenSpec compact context and semantic enrichment;
6. automated regression reporting and structural/visual diff;
7. stable design-system adapter SDK and second-team onboarding.

OpenSpec remains the functional/semantic truth, Pixso the visual truth, the team adapter and
accepted catalogs the component truth, the generator the translation layer, and developer
review the final acceptance gate. Custom OpenSpec schemas are deferred until benchmark data
shows that a stable shared `ui-plan` artifact is needed.

## 15. Known inputs still required

The specification is implementable with the current repository, but the product benchmark
cannot be declared complete without external project inputs:

- 15-25 approved and classified real screens;
- verified reference images and DesignIR artifacts for them;
- an approved project or fixture containing real Sber dependencies for meaningful
  typecheck/build/render validation;
- team adapter policies and accepted Storybook/MCP snapshots when those providers are added.

Their absence does not block the Wave 0 contracts, runner or draft pilot. It blocks only an
official active benchmark and claims against the 30-minute product target.
