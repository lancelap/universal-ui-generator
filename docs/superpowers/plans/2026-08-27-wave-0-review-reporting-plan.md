# Wave 0 Review, Reporting, and Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record reproducible human correction evidence, aggregate automatic and human metrics, compare candidate runs with accepted baselines, and document the Wave 0 operating model.

**Architecture:** Human review remains a separate immutable artifact linked to an automatic run. Pure metric functions aggregate evidence deterministically; comparison separates hard regression, warning, improvement, and non-comparable outcomes. Thin scripts expose start/finish review, report, and compare workflows without invoking Qwen or accepting a baseline automatically.

**Tech Stack:** TypeScript 5.9, Node.js 22+, Vitest 3.2, existing benchmark contracts/runner, `node:readline/promises`, stable JSON and SHA-256 helpers.

**Spec:** `docs/superpowers/specs/2026-08-27-wave-0-measurement-contracts-design.md`

**Prerequisite Plans:**
- `docs/superpowers/plans/2026-08-27-wave-0-contracts-pilot-plan.md`
- `docs/superpowers/plans/2026-08-27-wave-0-automatic-runner-plan.md`

## Global Constraints

- Complete both prerequisite plans and their gates first.
- Automatic run artifacts remain immutable; reviews are new linked files.
- The primary correction median includes only comparable `qwen-assisted`, `ready-for-pr` reviews.
- Normal Qwen waiting is active time; only recorded external outages become pauses.
- Do not invoke Qwen, MCP, Pixso, Storybook, or a browser.
- Do not compute pixel similarity or use an AI visual judge.
- Do not auto-accept, overwrite, or promote a baseline.
- `not-run` technical validation is excluded from pass-rate denominators.
- A draft case without verified reference cannot start human review.
- Comparison never claims better/worse when identities make reports non-comparable.
- Use TDD and commit after every task.

---

## File and Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/benchmark-runner/src/metrics.ts` | median, p75, rates and human-metric denominators |
| `packages/benchmark-runner/src/review-session.ts` | safe two-phase review timing and immutable review publication |
| `packages/benchmark-runner/src/load-run.ts` | safe loading of run/report/case/review evidence |
| `packages/benchmark-runner/src/aggregate-report.ts` | full automatic + human report |
| `packages/benchmark-runner/src/compare-reports.ts` | deterministic classification of differences |
| `packages/benchmark-runner/src/baseline-eligibility.ts` | explicit official-baseline requirements |
| `scripts/benchmark/review.ts` | start/finish interactive review workflow |
| `scripts/benchmark/report.ts` | regenerate report from immutable evidence |
| `scripts/benchmark/compare.ts` | compare accepted baseline and candidate |
| `docs/product-goal.md` | users, scope, outcome and full product loop |
| `docs/benchmark.md` | suite/run/review/baseline operating model |
| `docs/benchmark-metrics.md` | exact formulas and timer rules |
| `docs/compact-ui-snapshot.md` | DesignIR/provenance contract boundary |

### Task 1: Pure Benchmark Metrics

**Files:**
- Create: `packages/benchmark-runner/src/metrics.ts`
- Create: `packages/benchmark-runner/src/metrics.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`

**Interfaces:**
- Produces: `median(values)`, `nearestRankPercentile(values, percentile)`, `technicalPassRate(statuses)`, `aggregateHumanMetrics(reviews)`.
- Consumed by: report aggregation and comparison.

- [ ] **Step 1: Write failing median and p75 tests**

```ts
expect(median([])).toBeNull();
expect(median([600])).toBe(600);
expect(median([600, 1200])).toBe(900);
expect(median([1800, 600, 1200])).toBe(1200);

expect(nearestRankPercentile([], 0.75)).toBeNull();
expect(nearestRankPercentile([10, 20, 30, 40], 0.75)).toBe(30);
expect(() => nearestRankPercentile([1], 0)).toThrow(/percentile/);
expect(() => nearestRankPercentile([1], 1.1)).toThrow(/percentile/);
```

Use nearest-rank index `Math.ceil(percentile * n) - 1`.

- [ ] **Step 2: Write failing denominator tests**

```ts
expect(
  technicalPassRate([
    { status: "passed", durationMs: 1, evidence: ["tsc"] },
    { status: "failed", durationMs: 1, diagnosticCodes: ["TS2322"] },
    { status: "not-run", reason: "dependency-not-available" },
  ]),
).toBe(0.5);
```

For human metrics, provide three Qwen-assisted reviews: ready in 600 seconds, ready in 1800 seconds, and not recoverable in 2400 seconds. Assert:

```ts
expect(metrics.correctionTimeSeconds).toEqual({
  median: 1200,
  p75: 1800,
  minimum: 600,
  maximum: 1800,
});
expect(metrics.readyWithin30MinutesRate).toBe(2 / 3);
```

The correction distribution excludes the non-ready result; the ready-within-30 denominator includes every comparable timed Qwen-assisted review.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/metrics.test.ts
```

Expected: FAIL because metric functions do not exist.

- [ ] **Step 4: Implement pure non-mutating metrics**

Sort copies, never input arrays. Return `null` when a denominator is zero. Aggregate element recall as total matched divided by total expected across reviewed cases. Aggregate component correctness as total correct divided by total expected DS components. Exclude manual-only and non-comparable review records from primary correction metrics.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm vitest run packages/benchmark-runner/src/metrics.test.ts
pnpm typecheck
git add packages/benchmark-runner/src/metrics.ts packages/benchmark-runner/src/metrics.test.ts packages/benchmark-runner/src/index.ts
git commit -m "feat: calculate benchmark quality metrics"
```

### Task 2: Safe Two-Phase Human Review Recording

**Files:**
- Create: `packages/benchmark-runner/src/review-session.ts`
- Create: `packages/benchmark-runner/src/review-session.test.ts`
- Create: `scripts/benchmark/review.ts`
- Create: `packages/benchmark-runner/src/review-command.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `startBenchmarkReview(input): Promise<ReviewSession>`.
- Produces: `finishBenchmarkReview(input): Promise<BenchmarkReviewV1>`.
- Produces: `pnpm benchmark:review --run <run-dir> --case <case-id> --start|--finish`.
- Consumed by: full report aggregation.

- [ ] **Step 1: Write failing session lifecycle tests**

Create a temporary automatic run whose immutable root `suite.json` has a verified reference path. Assert:

```ts
const session = await startBenchmarkReview({
  repositoryRoot,
  runDirectory,
  caseId: "modal-4-314",
  reviewer: { id: "reviewer-1", experience: "senior" },
  now: () => new Date("2026-08-27T10:00:00Z"),
});

expect(session).toMatchObject({
  schema: "benchmark-review-session/v1",
  caseId: "modal-4-314",
  startedAt: "2026-08-27T10:00:00.000Z",
});
```

Starting again rejects `BENCHMARK_REVIEW_INVALID`. Starting a case without `referenceImagePath` also rejects `BENCHMARK_REVIEW_INVALID`.

- [ ] **Step 2: Write failing finish and immutability tests**

Finish at 10:20 with 120 paused seconds and assert `activeSeconds: 1080`. Assert the session file is removed only after the immutable review file is published. Finishing twice must reject and never overwrite the first review.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/review-session.test.ts packages/benchmark-runner/src/review-command.test.ts
```

Expected: FAIL because review-session APIs do not exist.

- [ ] **Step 4: Implement start/finish storage**

Store an internal closed session document under:

```text
<run-directory>/review-sessions/<case-id>.json
```

Publish reviews under:

```text
<run-directory>/reviews/<case-id>/<review-id>.json
```

Use exclusive/atomic writers from the automatic-runner plan. A review ID is:

```ts
`review_${finishedAt.replace(/[-:.]/g, "")}_${caseId}`
```

`finishBenchmarkReview()` accepts explicit first-shot counts/issues, pause reasons/seconds, workflow metadata, iterations, edits, changed files, and final status; it computes timestamps and active seconds, validates `BenchmarkReviewV1`, writes it exclusively, then removes the session file.

- [ ] **Step 5: Implement the interactive script**

Use `parseArgs()` with `--run`, `--case`, and exactly one of `--start` or `--finish`.

`--start` asks reviewer ID and experience, publishes the session, and prints reference/generated paths plus start time.

`--finish` uses `node:readline/promises` to request numeric counts, structural status, issue lines in `category|description|fixture-candidate` form, paused seconds/reasons, workflow, Qwen CLI/model/extension versions when Qwen-assisted, iterations, edits, changed files, and final status. Validate every answer before publication.

Add:

```json
"benchmark:review": "node --import tsx scripts/benchmark/review.ts"
```

- [ ] **Step 6: Run tests and commit**

```bash
pnpm vitest run packages/benchmark-runner/src/review-session.test.ts packages/benchmark-runner/src/review-command.test.ts
pnpm typecheck
git add packages/benchmark-runner/src/review-session.ts packages/benchmark-runner/src/review-session.test.ts packages/benchmark-runner/src/review-command.test.ts packages/benchmark-runner/src/index.ts scripts/benchmark/review.ts package.json
git commit -m "feat: record benchmark correction reviews"
```

### Task 3: Full Report Aggregation

**Files:**
- Create: `packages/benchmark-runner/src/load-run.ts`
- Create: `packages/benchmark-runner/src/aggregate-report.ts`
- Create: `packages/benchmark-runner/src/aggregate-report.test.ts`
- Create: `scripts/benchmark/report.ts`
- Create: `packages/benchmark-runner/src/report-command.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadBenchmarkRunEvidence(input): Promise<BenchmarkRunEvidence>`.
- Produces: `aggregateBenchmarkReport(input): BenchmarkReportV1`.
- Produces: `pnpm benchmark:report --run <run-dir>`.
- Replaces the automatic report atomically only through a new versioned filename; it never mutates case runs or reviews.

- [ ] **Step 1: Write failing aggregation tests**

Use generated, blocked, and failed runs plus two reviews. Assert:

```ts
expect(report.summary).toMatchObject({
  totalCases: 3,
  generatedCases: 1,
  blockedCases: 1,
  failedCases: 1,
  correctionTimeSeconds: {
    median: 1200,
    p75: 1800,
    minimum: 600,
    maximum: 1800,
  },
});
expect(report.cases.map((entry) => entry.caseId)).toEqual([
  "generated",
  "blocked",
  "failed",
]);
```

Add one `not-run` typecheck and assert it does not enter the pass-rate denominator.

- [ ] **Step 2: Write failing identity and duplicate-review tests**

A review whose `runId` does not match rejects with `BENCHMARK_REVIEW_INVALID`. Two reviews for one case are both retained as evidence, but the report requires an explicit selected review ID; it must not silently choose the latest.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/aggregate-report.test.ts packages/benchmark-runner/src/report-command.test.ts
```

Expected: FAIL because aggregation is not implemented.

- [ ] **Step 4: Implement safe evidence loading and aggregation**

Load `run.json`, the copied `suite.json`, run-level identity, every case run, and reviews using safe ordinary-file checks. Verify all schemas and integrity functions. Require exactly one automatic case run per suite case. Accept `selectedReviewIds: Record<caseId, reviewId>`; omit human metrics for unselected cases.

Write a new report filename:

```text
reports/report_<timestamp>.json
```

Never create or update a `latest` pointer; the command returns the exact immutable versioned report path.

- [ ] **Step 5: Implement report command**

Arguments:

```text
--run .uig/benchmarks/benchmark_20260827T103000000Z_sber-space-ui-pilot-v1
--select-review modal-4-314=review_20260827T110000000Z_modal-4-314
```

`--select-review` is repeatable; each value uses the exact `case-id=review-id` syntax.

Print report ID/path and summary only. Add:

```json
"benchmark:report": "node --import tsx scripts/benchmark/report.ts"
```

- [ ] **Step 6: Run tests and commit**

```bash
pnpm vitest run packages/benchmark-runner/src/aggregate-report.test.ts packages/benchmark-runner/src/report-command.test.ts
pnpm typecheck
git add packages/benchmark-runner/src/load-run.ts packages/benchmark-runner/src/aggregate-report.ts packages/benchmark-runner/src/aggregate-report.test.ts packages/benchmark-runner/src/report-command.test.ts packages/benchmark-runner/src/index.ts scripts/benchmark/report.ts package.json
git commit -m "feat: aggregate benchmark review reports"
```

### Task 4: Baseline Eligibility and Candidate Comparison

**Files:**
- Create: `packages/benchmark-runner/src/baseline-eligibility.ts`
- Create: `packages/benchmark-runner/src/compare-reports.ts`
- Create: `packages/benchmark-runner/src/compare-reports.test.ts`
- Create: `scripts/benchmark/compare.ts`
- Create: `packages/benchmark-runner/src/compare-command.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `evaluateBaselineEligibility(input): BaselineEligibility`.
- Produces: `compareBenchmarkReports(baseline, candidate): BenchmarkComparisonV1`.
- Produces: `pnpm benchmark:compare --baseline <report> --candidate <report>`.
- Exit 0: comparable with no hard regression; exit 2: hard regression; exit 1: invalid/infrastructure error.

- [ ] **Step 1: Write failing baseline eligibility tests**

Assert these exact reasons independently:

```text
SUITE_NOT_ACTIVE
SUITE_HAS_FEWER_THAN_15_CASES
DIRTY_WORKTREE
MISSING_CASE_RUN
MISSING_REQUIRED_REVIEW
REFERENCE_NOT_VERIFIED
```

A clean active 15-case report with all required evidence returns `{ eligible: true, reasons: [] }`.

- [ ] **Step 2: Write failing non-comparable tests**

Change each global identity independently and assert one reason:

```text
SUITE_ID_CHANGED
SUITE_VERSION_CHANGED
SUITE_HASH_CHANGED
GENERATOR_INPUT_CHANGED
DESIGN_SYSTEM_PACK_CHANGED
EFFECTIVE_CATALOG_CHANGED
```

When any global reason exists:

```ts
expect(comparison.comparable).toBe(false);
expect(comparison.hardRegressions).toEqual([]);
expect(comparison.warnings).toEqual([]);
expect(comparison.improvements).toEqual([]);
```

- [ ] **Step 3: Write failing comparable classification tests**

Cover exact transitions:

```text
generated -> blocked/failed                    hard regression
technical passed -> failed                     hard regression
case missing                                   hard regression
new required missing element                   hard regression
blocked/failed -> generated                    improvement
technical failed -> passed                     improvement
unresolved count decreased                     improvement
unresolved count increased                     warning
correct-component rate decreased               warning
median correction time increased               warning
structural review worsened                     warning
```

Do not introduce percentage thresholds in Wave 0.

- [ ] **Step 4: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/compare-reports.test.ts packages/benchmark-runner/src/compare-command.test.ts
```

Expected: FAIL because comparison APIs do not exist.

- [ ] **Step 5: Implement eligibility and comparison**

Compare cases by `caseId`, preserve lexical code ordering within each classification, and include baseline/candidate values when scalar. Human comparisons require selected reviews with the same workflow and compatible Qwen configuration; otherwise add a case-scoped non-comparable reason for human metrics without suppressing comparable automatic evidence.

If global identities differ, the entire report is non-comparable as specified above.

- [ ] **Step 6: Implement compare command and exit codes**

Use required `--baseline` and `--candidate`, validate both reports, print stable JSON comparison, and set exit code 2 only when `hardRegressions.length > 0`.

Add:

```json
"benchmark:compare": "node --import tsx scripts/benchmark/compare.ts"
```

- [ ] **Step 7: Run tests and commit**

```bash
pnpm vitest run packages/benchmark-runner/src/compare-reports.test.ts packages/benchmark-runner/src/compare-command.test.ts
pnpm typecheck
git add packages/benchmark-runner/src/baseline-eligibility.ts packages/benchmark-runner/src/compare-reports.ts packages/benchmark-runner/src/compare-reports.test.ts packages/benchmark-runner/src/compare-command.test.ts packages/benchmark-runner/src/index.ts scripts/benchmark/compare.ts package.json
git commit -m "feat: compare benchmark candidates with baselines"
```

### Task 5: Product and Benchmark Documentation

**Files:**
- Create: `docs/product-goal.md`
- Create: `docs/benchmark.md`
- Create: `docs/benchmark-metrics.md`
- Create: `docs/compact-ui-snapshot.md`
- Modify: `README.md`
- Modify: `docs/contracts.md`
- Modify: `docs/fixture-policy.md`

**Interfaces:**
- Documents the exact implemented workflow and the deferred Preview/OpenSpec layers.
- Provides the operating instructions used to collect the first official 15-25-screen suite.

- [ ] **Step 1: Write the product-goal document**

State verbatim outcomes:

```text
70-80% layout/UI draft
median active correction time <= 30 minutes
analyst + frontend developer
layout/UI only
```

Show the complete future flow and clearly mark Preview/Review, Qwen correction automation, and OpenSpec enrichment as deferred.

- [ ] **Step 2: Write benchmark operating documentation**

Document three regression levels, suite classification/traits, draft versus active lifecycle, candidate intake, exact run/review/report/compare commands, immutable artifacts, baseline manual acceptance, and bug-to-minimal-fixture routing.

- [ ] **Step 3: Write exact metric definitions**

Include formulas and denominators from Task 1, timer start/stop/pause rules, Qwen wait treatment, nullable metrics, and why there is no synthetic UI-quality percentage.

- [ ] **Step 4: Document Compact UI Snapshot and provenance**

State that `DesignIRV2` plus `NormalizationProvenanceV1` is the frozen offline semantic-planning input. Explain raw fixture, snapshot metadata, DesignIR, provenance, semantic manifest, resolution plan, and generated source boundaries.

- [ ] **Step 5: Update entry-point docs**

README links to the four documents and labels benchmark commands repository-development tooling, not Qwen `/uig:*` commands. `docs/contracts.md` lists every new schema. `docs/fixture-policy.md` distinguishes normalizer fixtures from product benchmark cases.

- [ ] **Step 6: Check documentation and commit**

```bash
pnpm exec prettier --check README.md docs/product-goal.md docs/benchmark.md docs/benchmark-metrics.md docs/compact-ui-snapshot.md docs/contracts.md docs/fixture-policy.md
git diff --check
git add README.md docs/product-goal.md docs/benchmark.md docs/benchmark-metrics.md docs/compact-ui-snapshot.md docs/contracts.md docs/fixture-policy.md
git commit -m "docs: explain benchmark operating model"
```

### Task 6: End-to-End Wave 0 Verification

**Files:**
- Modify only files required to correct failures discovered by the commands below.
- Do not change accepted semantics, recipes, or generator output to make the pilot look better.

**Interfaces:**
- Produces final evidence for Wave 0 implementation completion.
- Does not produce an official active baseline from the two-case draft pilot.

- [ ] **Step 1: Run all static and fixture gates**

```bash
pnpm format:check
pnpm typecheck
pnpm verify:fixtures
pnpm verify:qwen-extension-bundle
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite with bounded workers if needed**

```bash
pnpm vitest run --maxWorkers=4
```

Expected: all tests pass. If the unrestricted worker count is load-sensitive, keep the bounded command as verification evidence; do not weaken assertions.

- [ ] **Step 3: Validate and run the draft pilot**

```bash
pnpm benchmark:validate --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
pnpm benchmark:run --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
```

Expected: two cases preserved; no network; no application writes; honest `not-run` technical statuses.

- [ ] **Step 4: Exercise report and comparison through deterministic command tests**

```bash
pnpm vitest run packages/benchmark-runner/src/report-command.test.ts packages/benchmark-runner/src/compare-command.test.ts
```

Expected: the report command publishes a versioned report in an OS temporary run fixture; the
comparison command compares that report with itself and returns comparable with no regressions,
warnings, or improvements. Synthetic human timing remains inside the temporary test fixture.

- [ ] **Step 5: Verify repository scope**

```bash
git status --short
git diff main...HEAD --stat
git log --oneline --decorate -15
```

Confirm there are no changes to semantic rules, DS recipes, generated acceptance fixtures, Qwen bundle, or user tool configuration.

- [ ] **Step 6: Request code review before integration**

Invoke `superpowers:requesting-code-review` and provide the spec, all three plans, commit list, verification output, known `not-run` Sber validation, and the fact that the pilot is draft.

## Plan 3 Completion Gate

Wave 0 measurement infrastructure is complete only when:

- contracts, runner, reviews, reports, comparisons, and docs pass;
- automatic runs remain immutable and offline;
- blocked/failed cases remain visible;
- primary human metrics use only comparable Qwen-assisted evidence;
- Storybook/DS MCP provenance is representable without live benchmark calls;
- the two-case pilot remains explicitly draft;
- no official 30-minute claim is made before an active 15-25-screen suite and real Sber validation harness exist.
