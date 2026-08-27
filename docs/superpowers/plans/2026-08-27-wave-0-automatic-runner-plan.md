# Wave 0 Automatic Benchmark Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the frozen pilot suite through the existing semantic, resolution, and React-generation packages while preserving immutable per-case evidence and an automatic candidate report.

**Architecture:** The benchmark runner remains an outer package. It loads already-validated frozen inputs, loads one pinned DS pack, runs existing public functions directly, writes artifacts into a new `.uig/benchmarks/<run-id>` directory, and continues after individual blocked or failed cases. No app project is mutated and no live provider is invoked.

**Tech Stack:** TypeScript 5.9, Node.js 22+, Vitest 3.2, existing UIG workspace packages, TypeScript compiler API already used by generator-react.

**Spec:** `docs/superpowers/specs/2026-08-27-wave-0-measurement-contracts-design.md`

**Prerequisite Plan:** `docs/superpowers/plans/2026-08-27-wave-0-contracts-pilot-plan.md`

## Global Constraints

- Read and complete the prerequisite plan first.
- Use `buildUiManifestV2()`, `resolveUiManifestV2()`, and `generateReactBundle()` directly.
- Do not import `apps/cli` or parse CLI output.
- Do not re-normalize raw Pixso DSL during a normal benchmark run.
- Run cases sequentially in suite order; Wave 0 has no workers option.
- A case block/failure is evidence and must not abort remaining cases.
- A suite/path/hash/output collision is an infrastructure error and stops the run.
- Output directories and files are immutable and must not follow symlinks.
- Never write generated files into a team application.
- No live Pixso, Storybook MCP, DS MCP, Qwen, or network access.
- Typecheck/build/render remain explicit `not-run` when the validation profile disables them.
- Use TDD and commit after every task.

---

## File and Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/benchmark-runner/src/run-layout.ts` | deterministic run/case paths and unique run IDs |
| `packages/benchmark-runner/src/atomic-artifacts.ts` | safe exclusive directories and atomic stable JSON/source writes |
| `packages/benchmark-runner/src/environment.ts` | Git/runtime evidence with injectable process runner |
| `packages/benchmark-runner/src/summarize-diagnostics.ts` | stable semantic/resolution/diagnostic counters |
| `packages/benchmark-runner/src/validate-bundle.ts` | benchmark validation statuses from generated bundle/profile |
| `packages/benchmark-runner/src/run-case.ts` | one frozen case through existing pipeline APIs |
| `packages/benchmark-runner/src/aggregate-automatic-report.ts` | report with automatic metrics and null human metrics |
| `packages/benchmark-runner/src/run-suite.ts` | sequential orchestration and case-failure isolation |
| `scripts/benchmark/run.ts` | thin repository command |
| `packages/benchmark-runner/src/run-command.test.ts` | command-level offline acceptance |

### Task 1: Immutable Run Layout and Atomic Artifact Writes

**Files:**
- Create: `packages/benchmark-runner/src/run-layout.ts`
- Create: `packages/benchmark-runner/src/atomic-artifacts.ts`
- Create: `packages/benchmark-runner/src/run-layout.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`

**Interfaces:**
- Produces: `createBenchmarkRunLayout(input): BenchmarkRunLayout`.
- Produces: `createExclusiveRunDirectory(layout)`, `writeStableJsonExclusive()`, `writeBytesExclusive()`.
- Consumed by: case and suite runners.

- [ ] **Step 1: Write failing deterministic-layout and collision tests**

```ts
const layout = createBenchmarkRunLayout({
  repositoryRoot: "/repo",
  outputRoot: ".uig/benchmarks",
  suiteId: "sber-space-ui-pilot-v1",
  now: new Date("2026-08-27T10:30:00.000Z"),
});

expect(layout.runId).toBe(
  "benchmark_20260827T103000000Z_sber-space-ui-pilot-v1",
);
expect(layout.runDirectory).toBe(
  "/repo/.uig/benchmarks/benchmark_20260827T103000000Z_sber-space-ui-pilot-v1",
);
expect(layout.caseDirectory("modal-4-314")).toBe(
  `${layout.runDirectory}/cases/modal-4-314`,
);
```

Create the run directory twice and assert the second call rejects with:

```ts
{ code: "BENCHMARK_OUTPUT_ALREADY_EXISTS" }
```

Also reject unsafe suite/case IDs instead of sanitizing two different values to one path.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/run-layout.test.ts
```

Expected: FAIL because the layout functions do not exist.

- [ ] **Step 3: Implement safe immutable layout**

Use strict IDs:

```ts
const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
```

Construct the timestamp with:

```ts
input.now.toISOString().replace(/[-:.]/g, "")
```

Create the output parent safely, then create the final run directory with non-recursive `mkdir()`. Map `EEXIST` to `BENCHMARK_OUTPUT_ALREADY_EXISTS`.

Atomic JSON writes use `stableStringify()`, a sibling temporary filename containing `randomUUID()`, `writeFile(..., { flag: "wx" })`, and `rename()`. Reject destinations that already exist; clean only the temporary file after a failed rename. Source-byte writes use the same exclusive policy.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm vitest run packages/benchmark-runner/src/run-layout.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/benchmark-runner/src/run-layout.ts packages/benchmark-runner/src/atomic-artifacts.ts packages/benchmark-runner/src/run-layout.test.ts packages/benchmark-runner/src/index.ts
git commit -m "feat: add immutable benchmark run storage"
```

### Task 2: Reproducible Environment Identity

**Files:**
- Create: `packages/benchmark-runner/src/environment.ts`
- Create: `packages/benchmark-runner/src/environment.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`

**Interfaces:**
- Produces: `captureBenchmarkEnvironment(input): Promise<BenchmarkEnvironment>`.
- Input includes injectable `execFile(command, args, cwd)` and `runtime` values.
- Consumed by: `runBenchmark()` and baseline eligibility.

- [ ] **Step 1: Write failing clean/dirty repository tests**

```ts
const clean = await captureBenchmarkEnvironment({
  repositoryRoot: "/repo",
  execFile: fakeExec({
    "git rev-parse HEAD": "a".repeat(40) + "\n",
    "git status --porcelain": "",
    "pnpm --version": "10.33.0\n",
  }),
  runtime: {
    os: "darwin",
    architecture: "arm64",
    nodeVersion: "v22.18.0",
  },
});

expect(clean).toEqual({
  os: "darwin",
  architecture: "arm64",
  nodeVersion: "v22.18.0",
  pnpmVersion: "10.33.0",
  gitCommit: "a".repeat(40),
  dirty: false,
});
```

Return one porcelain line and assert `dirty: true`. Return an invalid commit and assert `BENCHMARK_RUN_INTEGRITY_FAILED`.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/environment.test.ts
```

Expected: FAIL because environment capture does not exist.

- [ ] **Step 3: Implement dependency-injected environment capture**

The production adapter uses promisified `node:child_process.execFile` with argument arrays:

```ts
execFile("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
execFile("git", ["status", "--porcelain"], { cwd: repositoryRoot });
execFile("pnpm", ["--version"], { cwd: repositoryRoot });
```

Do not invoke a shell. Validate Git commit with `/^[a-f0-9]{40}$/` and trim version output.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm vitest run packages/benchmark-runner/src/environment.test.ts
pnpm typecheck
git add packages/benchmark-runner/src/environment.ts packages/benchmark-runner/src/environment.test.ts packages/benchmark-runner/src/index.ts
git commit -m "feat: capture benchmark environment identity"
```

### Task 3: Diagnostic Summary and Validation Mapping

**Files:**
- Create: `packages/benchmark-runner/src/summarize-diagnostics.ts`
- Create: `packages/benchmark-runner/src/validate-bundle.ts`
- Create: `packages/benchmark-runner/src/summarize-diagnostics.test.ts`
- Create: `packages/benchmark-runner/src/validate-bundle.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`

**Interfaces:**
- Produces: `summarizeSemantic(manifest)`, `summarizeResolution(plan)`, `summarizeDiagnostics(diagnostics)`.
- Produces: `validationFromBundle({ bundle, profile, durations }): BenchmarkRunV1["validation"]`.
- Consumed by: `runBenchmarkCase()`.

- [ ] **Step 1: Write failing semantic and diagnostic counter tests**

Use a manifest with one `unresolved` node and two `SEMANTIC_ROLE_AMBIGUOUS` diagnostics:

```ts
expect(summarizeSemantic(manifest)).toEqual({
  ambiguous: 2,
  unresolved: 1,
});

expect(summarizeDiagnostics(diagnostics)).toEqual({
  total: 3,
  blocking: 1,
  warnings: 2,
  codes: {
    SEMANTIC_CONFIDENCE_TOO_LOW: 1,
    SEMANTIC_ROLE_AMBIGUOUS: 2,
  },
});
```

Code keys must be emitted in lexical order.

- [ ] **Step 2: Write failing validation mapping tests**

For a generated bundle whose report says syntax passed and the syntax-only profile, assert:

```ts
expect(validation.syntax.status).toBe("passed");
expect(validation.typecheck).toEqual({
  status: "not-run",
  reason: "dependency-not-available",
});
expect(validation.build).toEqual({
  status: "not-run",
  reason: "harness-not-configured",
});
expect(validation.render).toEqual({
  status: "not-run",
  reason: "harness-not-configured",
});
```

The validation profile must supply these disabled-validator reasons; do not branch on the Sber pack ID.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/summarize-diagnostics.test.ts packages/benchmark-runner/src/validate-bundle.test.ts
```

Expected: FAIL because the helpers do not exist.

- [ ] **Step 4: Implement counters and mapping**

Flatten semantic nodes recursively. Count semantic ambiguity from diagnostics code and unresolved from node role. Copy resolution counts from the already integrity-checked `ResolutionPlanV2.summary`.

For a blocked bundle, syntax is `not-run/previous-stage-blocked`. For a generated bundle, require generator report syntax `passed`; otherwise throw `BENCHMARK_RUN_INTEGRITY_FAILED`. Map every disabled profile validator to its configured reason.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm vitest run packages/benchmark-runner/src/summarize-diagnostics.test.ts packages/benchmark-runner/src/validate-bundle.test.ts
pnpm typecheck
git add packages/benchmark-runner/src/summarize-diagnostics.ts packages/benchmark-runner/src/validate-bundle.ts packages/benchmark-runner/src/summarize-diagnostics.test.ts packages/benchmark-runner/src/validate-bundle.test.ts packages/benchmark-runner/src/index.ts
git commit -m "feat: summarize benchmark pipeline evidence"
```

### Task 4: One-Case Pipeline Execution

**Files:**
- Create: `packages/benchmark-runner/src/run-case.ts`
- Create: `packages/benchmark-runner/src/run-case.test.ts`
- Modify: `packages/benchmark-runner/package.json`
- Modify: `packages/benchmark-runner/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `ValidatedBenchmarkCase`, loaded `LoadedDesignSystemPackV2`, run layout, environment.
- Produces: `runBenchmarkCase(input): Promise<BenchmarkRunV1>`.
- Produces per-case `ui-manifest.json`, `resolution-plan.json`, `generation-report.json`, `diagnostics.json`, and generated files when available.
- Consumed by: sequential suite runner.

- [ ] **Step 1: Write a failing generated-case test**

Use the reviewed `modal-4-314` pilot input and real Sber pack. Assert:

```ts
const run = await runBenchmarkCase(input);

expect(run).toMatchObject({
  schema: "benchmark-run/v1",
  caseId: "modal-4-314",
  stages: {
    semanticPlanning: "completed",
    componentResolution: "completed",
    sourceGeneration: "completed",
  },
  validation: {
    contracts: { status: "passed" },
    syntax: { status: "passed" },
    typecheck: {
      status: "not-run",
      reason: "dependency-not-available",
    },
  },
  result: { status: "generated" },
});
```

Read every reported artifact path and verify it exists inside the case directory.

- [ ] **Step 2: Write a failing blocked-case test**

Use an in-memory `ValidatedBenchmarkCase` whose DesignIR produces low-confidence diagnostics. Assert:

```ts
expect(run.result.status).toBe("blocked");
expect(run.stages.sourceGeneration).toBe("blocked");
expect(run.artifacts).not.toHaveProperty("generatedSourceDirectory");
expect(run.result.diagnostics.blocking).toBeGreaterThan(0);
```

- [ ] **Step 3: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/run-case.test.ts
```

Expected: FAIL because `runBenchmarkCase()` does not exist.

- [ ] **Step 4: Add runtime dependencies and implement the pipeline**

Add workspace dependencies:

```json
"@uig/component-resolver": "workspace:*",
"@uig/generator-react": "workspace:*",
"@uig/semantic-planner": "workspace:*"
```

Execute exactly:

```ts
const uiManifest = buildUiManifestV2({
  ir: benchmarkCase.designIr,
  provenance: benchmarkCase.normalizationProvenance,
  exactMappings: [...pack.exactPixsoMappings],
});

const resolutionPlan = resolveUiManifestV2({
  manifest: uiManifest,
  designIr: benchmarkCase.designIr,
  pack,
});

const bundle = generateReactBundle({
  sourceRunId: runId,
  designIr: benchmarkCase.designIr,
  uiManifest,
  resolutionPlan,
  pack,
});
```

Set semantic stage `blocked` only for blocking diagnostics whose stage is `semantic-planning`. Set resolution stage from component-resolution diagnostics and plan decisions, without reclassifying inherited semantic diagnostics. The generation stage follows `bundle.status`.

Use `bundle.report.diagnostics` as the canonical diagnostic list. Write bundle files from their bytes after `assertReactGenerationBundleIntegrity()` has passed.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm install
pnpm vitest run packages/benchmark-runner/src/run-case.test.ts
pnpm typecheck
git add packages/benchmark-runner pnpm-lock.yaml
git commit -m "feat: execute benchmark cases through generator"
```

### Task 5: Sequential Suite Runner and Automatic Report

**Files:**
- Create: `packages/benchmark-runner/src/aggregate-automatic-report.ts`
- Create: `packages/benchmark-runner/src/run-suite.ts`
- Create: `packages/benchmark-runner/src/run-suite.test.ts`
- Modify: `packages/benchmark-runner/src/index.ts`

**Interfaces:**
- Produces: `runBenchmark(input): Promise<RunBenchmarkResult>`.
- Input: `{ repositoryRoot, suitePath, outputRoot, now?, environmentReader? }`.
- Result: `{ runDirectory, suiteRunPath, reportPath, report, caseRuns }`.
- Consumed by: run command and the reporting plan.

- [ ] **Step 1: Write a failing mixed-outcome suite test**

Inject a case executor returning generated, blocked, then throwing. Assert execution order and preservation:

```ts
expect(executedCaseIds).toEqual(["generated", "blocked", "failed"]);
expect(result.caseRuns.map((run) => run.result.status)).toEqual([
  "generated",
  "blocked",
  "failed",
]);
expect(result.report.summary).toMatchObject({
  totalCases: 3,
  generatedCases: 1,
  blockedCases: 1,
  failedCases: 1,
});
```

The thrown case must become a failed `benchmark-run/v1` with
`BENCHMARK_CASE_EXECUTION_FAILED` evidence; the suite itself resolves successfully.

- [ ] **Step 2: Write a failing dirty-run eligibility test**

Return `environment.dirty = true` and assert:

```ts
expect(result.report.baselineEligibility).toEqual({
  eligible: false,
  reasons: ["DIRTY_WORKTREE"],
});
```

A draft suite additionally includes `SUITE_NOT_ACTIVE`.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/run-suite.test.ts
```

Expected: FAIL because orchestration does not exist.

- [ ] **Step 4: Implement sequential orchestration**

Load/validate once, load the pack once, capture environment once, create one exclusive run directory, and use a `for...of` loop with `await`. Never use `Promise.all()` for cases.

At the run root, write immutable `suite.json` and `environment.json` snapshots before case
execution. After every case and the automatic report are complete, publish one validated
`benchmark-suite-run/v1` as `run.json`. Its ordered case paths/statuses must match the suite.

For unexpected case errors, write a valid failed run and `failure.json`, then continue. Do not catch suite/path/hash/output errors raised before case execution.

- [ ] **Step 5: Implement automatic report aggregation**

Automatic reports have human metrics set to `null`. Rates for technical validation include only `passed` and `failed`; `not-run` is excluded from the denominator. Case order matches suite order. Report ID is `report_<benchmark-run-id>`.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm vitest run packages/benchmark-runner/src/run-suite.test.ts
pnpm typecheck
git add packages/benchmark-runner/src/aggregate-automatic-report.ts packages/benchmark-runner/src/run-suite.ts packages/benchmark-runner/src/run-suite.test.ts packages/benchmark-runner/src/index.ts
git commit -m "feat: run benchmark suites sequentially"
```

### Task 6: Run Command and Offline Pilot Acceptance

**Files:**
- Create: `scripts/benchmark/run.ts`
- Create: `packages/benchmark-runner/src/run-command.test.ts`
- Modify: `package.json`
- Modify: `.gitignore` only if `.uig/` is no longer sufficient; otherwise leave it unchanged.

**Interfaces:**
- Produces: `pnpm benchmark:run --suite <path>`.
- Exit 0 means infrastructure completed and evidence was written, even when cases are blocked/failed.
- Infrastructure errors exit 1 with stable benchmark code.

- [ ] **Step 1: Write the failing command test**

Run with fixed injected time and temporary output root. Parse the one JSON output line and assert:

```ts
expect(JSON.parse(stdout)).toEqual({
  runId: "benchmark_20260827T103000000Z_sber-space-ui-pilot-v1",
  suiteId: "sber-space-ui-pilot-v1",
  total: 2,
  generated: 2,
  blocked: 0,
  failed: 0,
  suiteRunPath:
    ".uig/benchmarks/benchmark_20260827T103000000Z_sber-space-ui-pilot-v1/run.json",
  reportPath:
    ".uig/benchmarks/benchmark_20260827T103000000Z_sber-space-ui-pilot-v1/report.json",
});
```

Do not print raw DesignIR, generated TSX, diagnostics, tokens, or absolute home paths.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/run-command.test.ts
```

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement the thin command**

Use `parseArgs()` with required `--suite` and optional `--output-root` defaulting to `.uig/benchmarks`. Call `runBenchmark()` and print `stableStringify(summary)`. Map `BenchmarkError` to `CODE: message` on stderr and exit 1.

Add:

```json
"benchmark:run": "node --import tsx scripts/benchmark/run.ts"
```

- [ ] **Step 4: Run the real pilot twice**

```bash
pnpm benchmark:run --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
pnpm benchmark:run --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
```

Expected: two distinct timestamped directories; each contains two case runs and a report. No source fixture or application file changes.

- [ ] **Step 5: Run full verification**

```bash
pnpm format:check
pnpm typecheck
pnpm verify:fixtures
pnpm verify:qwen-extension-bundle
pnpm test
pnpm benchmark:validate --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
pnpm benchmark:run --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
```

Expected: all commands pass; real Sber target typecheck/build/render remain explicit `not-run`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/benchmark/run.ts packages/benchmark-runner
git commit -m "feat: add automatic benchmark runner"
```

## Plan 2 Completion Gate

Inspect one run directory and verify:

- exact suite, generator commit, pack and catalog hashes;
- matching DesignIR/provenance hashes;
- semantic and resolution artifacts;
- generated source only for generated cases;
- blocked/failed evidence retained;
- syntax pass sourced from real generator validation;
- typecheck/build/render are not falsely reported as passed;
- no live provider call or target-project write occurred.

Then run:

```bash
git status --short
pnpm test
pnpm benchmark:run --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
```
