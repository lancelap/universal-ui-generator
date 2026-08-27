# Wave 0 Contracts and Pilot Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the versioned benchmark and component-metadata contracts, then prove them with a safe offline draft pilot-suite validator.

**Architecture:** `@uig/contracts` owns closed TypeBox schemas and cross-artifact integrity checks. A new outer `@uig/benchmark-runner` package initially owns only safe loading and validation; it does not run generation until the second plan. The draft pilot freezes reviewed `DesignIRV2` and matching `NormalizationProvenanceV1` derived from existing real Pixso fixtures.

**Tech Stack:** TypeScript 5.9, Node.js 22+, TypeBox 0.34, Vitest 3.2, pnpm 10.33, existing `stableStringify`, `sha256`, and safe-directory helpers.

**Spec:** `docs/superpowers/specs/2026-08-27-wave-0-measurement-contracts-design.md`

## Global Constraints

- Do not change normalizer, semantic-planner, component-resolver, generator-react, Qwen extension, or DS-pack behavior.
- Reuse `design-ir/v2` as Compact UI Snapshot; do not add another compact snapshot schema.
- Every generation case freezes both `DesignIRV2` and matching `NormalizationProvenanceV1`.
- All JSON contracts are closed and versioned; unknown fields fail validation.
- All benchmark paths are repository-relative safe paths; reject absolute paths, `..`, and symlink escapes.
- Draft pilot cases may omit a reference image; active suites may not.
- Do not add fake `@sber-space-ui/*` dependencies or declaration stubs.
- Do not call Pixso, Storybook MCP, DS MCP, Qwen, or the network.
- Use TDD and commit after every task.

---

## File and Responsibility Map

| File | Responsibility |
| --- | --- |
| `packages/contracts/src/benchmark-shared.ts` | hashes, safe paths, stage/validation statuses and shared primitives |
| `packages/contracts/src/component-metadata-source.ts` | provider policy and frozen catalog provenance |
| `packages/contracts/src/benchmark-expectations.ts` | reviewed regions/elements/text/component expectations |
| `packages/contracts/src/benchmark-validation-profile.ts` | declarative syntax/typecheck/build/render configuration |
| `packages/contracts/src/benchmark-suite.ts` | suite/case/classification/source contract and lifecycle integrity |
| `packages/contracts/src/benchmark-candidate-inventory.ts` | intake state for future real benchmark cases |
| `packages/contracts/src/benchmark-suite-run.ts` | immutable root index for one complete suite execution |
| `packages/contracts/src/benchmark-run.ts` | immutable automated case evidence |
| `packages/contracts/src/benchmark-review.ts` | first-shot review and correction timing |
| `packages/contracts/src/benchmark-report.ts` | aggregate report contract |
| `packages/contracts/src/benchmark-comparison.ts` | regression/warning/improvement/non-comparable result |
| `packages/contracts/src/benchmark-baseline.ts` | accepted baseline identity |
| `packages/benchmark-runner/src/errors.ts` | stable benchmark error codes |
| `packages/benchmark-runner/src/load-suite.ts` | safe JSON/path/hash loading |
| `packages/benchmark-runner/src/validate-suite.ts` | cross-file suite integrity |
| `scripts/benchmark/validate.ts` | thin repository-development validation command |
| `scripts/benchmark/create-pilot-candidates.ts` | deterministic candidate production from existing fixtures |
| `benchmarks/suites/sber-space-ui-pilot-v1/**` | draft offline pilot inputs |

### Task 1: Shared Benchmark and Metadata-Provider Contracts

**Files:**
- Create: `packages/contracts/src/benchmark-shared.ts`
- Create: `packages/contracts/src/component-metadata-source.ts`
- Create: `packages/contracts/src/component-metadata-source.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `BenchmarkSha256Schema`, `BenchmarkRelativePathSchema`, `PipelineStageStatusSchema`, `ValidationStatusSchema`.
- Produces: `ComponentMetadataSourcePolicySchema`, `ComponentCatalogProvenanceSchema`, and static types.
- Consumed by: every later contract and runner task.

- [ ] **Step 1: Write the failing provider-policy tests**

```ts
import { describe, expect, it } from "vitest";
import {
  ComponentMetadataSourcePolicySchema,
  ContractValidationError,
  validateWithSchema,
} from "./index.js";

const storybookPolicy = {
  schema: "component-metadata-source/v1",
  id: "payments-storybook",
  kind: "storybook-mcp",
  authority: "primary",
  requiredFor: ["component-contract", "component-activation"],
  generationMode: "accepted-snapshot",
  onMissing: "block-component-activation",
  onStale: "warn",
} as const;

describe("component metadata source contracts", () => {
  it("supports required activation with snapshot generation", () => {
    expect(
      validateWithSchema(ComponentMetadataSourcePolicySchema, storybookPolicy),
    ).toEqual(storybookPolicy);
  });

  it("rejects unknown properties", () => {
    expect(() =>
      validateWithSchema(ComponentMetadataSourcePolicySchema, {
        ...storybookPolicy,
        liveRequired: true,
      }),
    ).toThrowError(ContractValidationError);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm vitest run packages/contracts/src/component-metadata-source.test.ts
```

Expected: FAIL because `ComponentMetadataSourcePolicySchema` is not exported.

- [ ] **Step 3: Implement the shared schemas**

Use the following definitions in `benchmark-shared.ts`:

```ts
export const BenchmarkSha256Schema = Type.String({
  pattern: "^[a-f0-9]{64}$",
});

export const BenchmarkRelativePathSchema = Type.String({
  minLength: 1,
  pattern:
    "^(?![\\\\/])(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+$",
});

export const PipelineStageStatusSchema = Type.Union([
  Type.Literal("completed"),
  Type.Literal("blocked"),
  Type.Literal("failed"),
  Type.Literal("not-run"),
]);

export const ValidationStatusSchema = Type.Union([
  closedObject({
    status: Type.Literal("passed"),
    durationMs: Type.Integer({ minimum: 0 }),
    evidence: Type.Array(Type.String({ minLength: 1 })),
  }),
  closedObject({
    status: Type.Literal("failed"),
    durationMs: Type.Integer({ minimum: 0 }),
    diagnosticCodes: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
    }),
  }),
  closedObject({
    status: Type.Literal("not-run"),
    reason: Type.Union([
      Type.Literal("previous-stage-blocked"),
      Type.Literal("harness-not-configured"),
      Type.Literal("dependency-not-available"),
      Type.Literal("not-supported"),
    ]),
  }),
]);
```

Implement provider kinds:

```ts
"design-system-pack" | "static-catalog" | "project-scan" |
"project-mapping" | "storybook" | "storybook-mcp" |
"design-system-mcp"
```

Implement `ComponentCatalogProvenanceSchema` with `effectiveCatalogSha256` and at least one source containing `id`, `kind`, optional `version`, `sha256`, and `mode: "required" | "optional"`. Export the two new modules from `index.ts`.

- [ ] **Step 4: Run the focused test and typecheck**

```bash
pnpm vitest run packages/contracts/src/component-metadata-source.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/benchmark-shared.ts packages/contracts/src/component-metadata-source.ts packages/contracts/src/component-metadata-source.test.ts packages/contracts/src/index.ts
git commit -m "feat: add benchmark metadata source contracts"
```

### Task 2: Suite, Expectations, and Validation-Profile Contracts

**Files:**
- Create: `packages/contracts/src/benchmark-expectations.ts`
- Create: `packages/contracts/src/benchmark-validation-profile.ts`
- Create: `packages/contracts/src/benchmark-suite.ts`
- Create: `packages/contracts/src/benchmark-candidate-inventory.ts`
- Create: `packages/contracts/src/benchmark-suite.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: shared benchmark schemas from Task 1.
- Produces: `BenchmarkExpectationsV1`, `BenchmarkValidationProfileV1`, `BenchmarkSuiteV1`, `BenchmarkCandidateInventoryV1`, `assertBenchmarkSuiteIntegrity()`, `assertBenchmarkValidationProfileIntegrity()`.
- Consumed by: the safe suite loader and both later plans.

- [ ] **Step 1: Write failing lifecycle, duplicate-ID, and provenance tests**

Create a valid one-case draft fixture with these source fields:

```ts
source: {
  designIrPath: "benchmarks/suites/pilot/cases/modal/design-ir.json",
  designIrSha256: "b".repeat(64),
  normalizationProvenancePath:
    "benchmarks/suites/pilot/cases/modal/normalization-provenance.json",
  normalizationProvenanceSha256: "c".repeat(64),
  pixso: {
    fileKey: "WSLukjrKancvZG0zbaMnyA",
    nodeId: "4:314",
    url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
  },
}
```

Assert:

```ts
expect(validateWithSchema(BenchmarkSuiteV1Schema, draftSuite)).toEqual(
  draftSuite,
);
expect(() =>
  assertBenchmarkSuiteIntegrity({ ...draftSuite, lifecycle: "active" }),
).toThrow(/^BENCHMARK_SUITE_INTEGRITY:/);
expect(() =>
  assertBenchmarkSuiteIntegrity({
    ...draftSuite,
    cases: [draftSuite.cases[0]!, draftSuite.cases[0]!],
  }),
).toThrow(/duplicate case ID/);
```

Also assert that `referenceImagePath` is optional for `draft` and required by integrity for `active`.
Validate one candidate inventory entry and assert that duplicate candidate IDs fail its integrity check.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/contracts/src/benchmark-suite.test.ts
```

Expected: FAIL because the schemas do not exist.

- [ ] **Step 3: Implement the three contracts**

`benchmark-expectations/v1`:

```ts
{
  schema: "benchmark-expectations/v1";
  regions: Array<{ id: string; role: string; required: boolean }>;
  elements: Array<{
    id: string;
    role: string;
    text?: string;
    required: boolean;
    allowedComponents?: string[];
  }>;
  requiredText: string[];
  forbiddenText: string[];
}
```

`benchmark-validation-profile/v1`:

```ts
{
  schema: "benchmark-validation-profile/v1";
  id: string;
  projectFixturePath?: string;
  validation: {
    syntax: { enabled: true } | { enabled: false; reason: ValidationNotRunReason };
    typecheck: { enabled: true } | { enabled: false; reason: ValidationNotRunReason };
    build: { enabled: true } | { enabled: false; reason: ValidationNotRunReason };
    render: { enabled: true } | { enabled: false; reason: ValidationNotRunReason };
  };
}
```

`assertBenchmarkValidationProfileIntegrity()` throws
`BENCHMARK_VALIDATION_PROFILE_INTEGRITY` when typecheck, build, or render is enabled without `projectFixturePath`. Disabled validators must carry one of the exact `ValidationStatusSchema` not-run reasons so the runner never infers a reason from a design-system ID.

The suite contains `id`, `title`, `version`, lifecycle, target pack identity/path, validation-profile path, and ordered cases. Implement every category, trait, and complexity-profile field from the spec. `assertBenchmarkSuiteIntegrity()` rejects duplicate case IDs and rejects an active suite with fewer than 15 cases or a missing reference image.

`benchmark-candidate-inventory/v1` contains unique candidates with exact Pixso URL/file key/node
ID and these independent states: permission (`unknown|approved|rejected`), reference
(`missing|captured|verified`), artifact pair (`missing|generated|verified`), classification
(`unclassified|classified`), and inclusion (`candidate|selected|duplicate|rejected`).

- [ ] **Step 4: Run contract tests and typecheck**

```bash
pnpm vitest run packages/contracts/src/benchmark-suite.test.ts packages/contracts/src/component-metadata-source.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/benchmark-expectations.ts packages/contracts/src/benchmark-validation-profile.ts packages/contracts/src/benchmark-suite.ts packages/contracts/src/benchmark-candidate-inventory.ts packages/contracts/src/benchmark-suite.test.ts packages/contracts/src/index.ts
git commit -m "feat: add benchmark suite contracts"
```

### Task 3: Automated Run and Human Review Contracts

**Files:**
- Create: `packages/contracts/src/benchmark-suite-run.ts`
- Create: `packages/contracts/src/benchmark-run.ts`
- Create: `packages/contracts/src/benchmark-review.ts`
- Create: `packages/contracts/src/benchmark-run.test.ts`
- Create: `packages/contracts/src/benchmark-review.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: stage/validation schemas and component-catalog provenance.
- Produces: `BenchmarkSuiteRunV1`, `BenchmarkRunV1`, `BenchmarkReviewV1`, `assertBenchmarkSuiteRunIntegrity()`, `assertBenchmarkRunIntegrity()`, `assertBenchmarkReviewIntegrity()`.
- Consumed by: automatic runner, report aggregation, and review recording.

- [ ] **Step 1: Write failing run-integrity tests**

Build one valid generated run, then assert:

```ts
expect(() => assertBenchmarkRunIntegrity(generatedRun)).not.toThrow();

expect(() =>
  assertBenchmarkRunIntegrity({
    ...generatedRun,
    result: { ...generatedRun.result, status: "blocked" },
  }),
).toThrow(/blocked result requires blocking diagnostics/);

expect(() =>
  assertBenchmarkRunIntegrity({
    ...generatedRun,
    artifacts: {
      ...generatedRun.artifacts,
      generatedSourceDirectory: "../outside",
    },
  }),
).toThrow(/unsafe artifact path/);
```

Use distinct counters:

```ts
semantic: { ambiguous: 0, unresolved: 0 },
resolution: { reuse: 3, compose: 1, fallback: 0, blocked: 0 }
```

Also create a two-case suite-run index and assert that duplicate/missing case IDs and a case
path outside the suite run directory fail `assertBenchmarkSuiteRunIntegrity()`.

- [ ] **Step 2: Write failing review-integrity tests**

```ts
expect(() => assertBenchmarkReviewIntegrity(validReview)).not.toThrow();

expect(() =>
  assertBenchmarkReviewIntegrity({
    ...validReview,
    correction: { ...validReview.correction, activeSeconds: 1 },
  }),
).toThrow(/activeSeconds/);

expect(() =>
  validateWithSchema(BenchmarkReviewV1Schema, {
    ...validReview,
    correctionEnvironment: { workflow: "qwen-assisted" },
  }),
).toThrowError(ContractValidationError);
```

- [ ] **Step 3: Run both tests and verify failure**

```bash
pnpm vitest run packages/contracts/src/benchmark-run.test.ts packages/contracts/src/benchmark-review.test.ts
```

Expected: FAIL because the contracts do not exist.

- [ ] **Step 4: Implement exact run and review fields**

`BenchmarkSuiteRunV1` records:

```ts
{
  schema: "benchmark-suite-run/v1";
  runId: string;
  suite: { id: string; version: string; sha256: string; snapshotPath: string };
  startedAt: string;
  finishedAt: string;
  environmentPath: string;
  cases: Array<{
    caseId: string;
    status: "generated" | "blocked" | "failed";
    runPath: string;
  }>;
  reportPath: string;
}
```

The case order and IDs must exactly match the suite passed to the integrity function.

`BenchmarkRunV1` records suite/case/timestamps; generator commit/version; OS, architecture, Node, pnpm, dirty flag; both frozen source hashes; pack identity; catalog provenance; pipeline stages; validation statuses; semantic and resolution counts; diagnostic summary; and safe artifact paths.

`BenchmarkReviewV1` records first-shot counts and issues, correction timestamps/pauses, Qwen iterations, changed files, final status, workflow, Qwen CLI/extension versions, and pseudonymous reviewer identity/experience. Its first-shot counters are exactly:

```ts
{
  expectedElementCount: number;
  matchedElementCount: number;
  missingElementCount: number;
  extraElementCount: number;
  expectedDsComponentCount: number;
  correctDsComponentCount: number;
  incorrectDsComponentCount: number;
  unresolvedDsComponentCount: number;
}
```

Integrity requires `expectedElementCount === matchedElementCount + missingElementCount` and
`expectedDsComponentCount === correctDsComponentCount + incorrectDsComponentCount + unresolvedDsComponentCount`.

Compute active time exactly:

```ts
const elapsedSeconds = Math.floor(
  (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
);
const expectedActiveSeconds = elapsedSeconds - pausedSeconds;
```

Reject invalid dates, negative time, active-time mismatch, unsafe changed files, and `qwen-assisted` reviews without Qwen CLI and extension versions.

- [ ] **Step 5: Run tests, typecheck, and commit**

```bash
pnpm vitest run packages/contracts/src/benchmark-run.test.ts packages/contracts/src/benchmark-review.test.ts
pnpm typecheck
git add packages/contracts/src/benchmark-suite-run.ts packages/contracts/src/benchmark-run.ts packages/contracts/src/benchmark-review.ts packages/contracts/src/benchmark-run.test.ts packages/contracts/src/benchmark-review.test.ts packages/contracts/src/index.ts
git commit -m "feat: add benchmark run and review contracts"
```

### Task 4: Report, Comparison, and Baseline Contracts

**Files:**
- Create: `packages/contracts/src/benchmark-report.ts`
- Create: `packages/contracts/src/benchmark-comparison.ts`
- Create: `packages/contracts/src/benchmark-baseline.ts`
- Create: `packages/contracts/src/benchmark-report.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: run/review identities and shared hashes.
- Produces: `BenchmarkReportV1`, `BenchmarkComparisonV1`, `BenchmarkBaselineV1`, and integrity assertions.
- Consumed by: the reporting plan.

- [ ] **Step 1: Write failing aggregate-contract tests**

```ts
expect(validateWithSchema(BenchmarkReportV1Schema, validReport)).toEqual(
  validReport,
);

expect(() =>
  assertBenchmarkReportIntegrity({
    ...validReport,
    summary: { ...validReport.summary, totalCases: 99 },
  }),
).toThrow(/totalCases/);

expect(() =>
  validateWithSchema(BenchmarkBaselineV1Schema, {
    ...validBaseline,
    automaticallyAccepted: true,
  }),
).toThrowError(ContractValidationError);
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/contracts/src/benchmark-report.test.ts
```

Expected: FAIL because the contracts do not exist.

- [ ] **Step 3: Implement the aggregate contracts**

The report contains report/suite/generator/catalog identities; total/generated/blocked/failed counts; nullable build/typecheck/element/component rates; nullable correction median/p75/min/max; nullable ready-within-30-minutes rate; baseline eligibility/reasons; and one case entry per suite case.

Each report case entry carries enough immutable comparison evidence without reloading the run:

```ts
{
  caseId: string;
  runId: string;
  status: "generated" | "blocked" | "failed";
  designIrSha256: string;
  normalizationProvenanceSha256: string;
  referenceVerified: boolean;
  validation: BenchmarkRunV1["validation"];
  semantic: BenchmarkRunV1["result"]["semantic"];
  resolution: BenchmarkRunV1["result"]["resolution"];
  diagnostics: BenchmarkRunV1["result"]["diagnostics"];
  review?: {
    reviewId: string;
    workflow: "qwen-assisted" | "manual-only";
    qwenCliVersion?: string;
    qwenModel?: string;
    extensionVersion?: string;
    structuralReview: "acceptable" | "minor-corrections" | "major-corrections" | "unusable";
    expectedElementCount: number;
    matchedElementCount: number;
    missingElementCount: number;
    extraElementCount: number;
    expectedDsComponentCount: number;
    correctDsComponentCount: number;
    incorrectDsComponentCount: number;
    unresolvedDsComponentCount: number;
    activeCorrectionSeconds: number;
    finalStatus: "ready-for-pr" | "requires-business-logic" | "not-recoverable";
  };
}
```

The comparison has exact arrays:

```ts
type BenchmarkComparisonEntry = {
  caseId?: string;
  code: string;
  message: string;
  baselineValue?: number | string | boolean;
  candidateValue?: number | string | boolean;
};

type BenchmarkComparisonV1 = {
  schema: "benchmark-comparison/v1";
  baselineReportId: string;
  candidateReportId: string;
  comparable: boolean;
  nonComparableReasons: BenchmarkComparisonEntry[];
  hardRegressions: BenchmarkComparisonEntry[];
  warnings: BenchmarkComparisonEntry[];
  improvements: BenchmarkComparisonEntry[];
};
```

The baseline contains ID, suite ID/version/hash, generator commit, createdAt, approvedBy, report path/hash, and `baselineEligible: true`. There is no automatic-acceptance property.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm vitest run packages/contracts/src/benchmark-report.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/benchmark-report.ts packages/contracts/src/benchmark-comparison.ts packages/contracts/src/benchmark-baseline.ts packages/contracts/src/benchmark-report.test.ts packages/contracts/src/index.ts
git commit -m "feat: add benchmark reporting contracts"
```

### Task 5: Safe Suite Loader and Validator

**Files:**
- Create: `packages/benchmark-runner/package.json`
- Create: `packages/benchmark-runner/src/index.ts`
- Create: `packages/benchmark-runner/src/errors.ts`
- Create: `packages/benchmark-runner/src/load-suite.ts`
- Create: `packages/benchmark-runner/src/validate-suite.ts`
- Create: `packages/benchmark-runner/src/load-suite.test.ts`

**Interfaces:**
- Consumes: suite/expectations/profile/DesignIR/provenance schemas, `sha256()`, `assertContainedOrdinaryPath()`.
- Produces: `loadAndValidateBenchmarkSuite(input): Promise<ValidatedBenchmarkSuite>`.
- Produces: ordered `ValidatedBenchmarkCase` values with parsed inputs and verified paths.
- Consumed by: the pilot command and automatic runner plan.

- [ ] **Step 1: Write failing path, hash, and artifact-pair tests**

Use `mkdtemp()` and real JSON files. Cover:

```ts
await expect(loadAndValidateBenchmarkSuite(validInput)).resolves.toMatchObject({
  suite: { id: "pilot" },
  cases: [{ case: { id: "case-1" } }],
});

await expect(
  loadAndValidateBenchmarkSuite(inputWithWrongDesignIrHash),
).rejects.toMatchObject({ code: "BENCHMARK_CASE_HASH_MISMATCH" });

await expect(
  loadAndValidateBenchmarkSuite(inputWithMismatchedArtifactIds),
).rejects.toMatchObject({ code: "BENCHMARK_RUN_INTEGRITY_FAILED" });

await expect(
  loadAndValidateBenchmarkSuite(inputWithSymlinkEscape),
).rejects.toMatchObject({ code: "BENCHMARK_CASE_PATH_OUTSIDE_ROOT" });
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/load-suite.test.ts
```

Expected: FAIL because `@uig/benchmark-runner` does not exist.

- [ ] **Step 3: Add the package and stable error type**

`package.json`:

```json
{
  "name": "@uig/benchmark-runner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@uig/component-catalog": "workspace:*",
    "@uig/contracts": "workspace:*",
    "@uig/design-context": "workspace:*"
  }
}
```

Error shape:

```ts
export class BenchmarkError extends Error {
  readonly name = "BenchmarkError";

  constructor(
    readonly code: BenchmarkErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
```

Use only stable codes from the spec.

- [ ] **Step 4: Implement safe loading and integrity validation**

`loadAndValidateBenchmarkSuite()` must:

1. verify the suite path under `repositoryRoot` with `assertContainedOrdinaryPath()`;
2. parse and validate suite/profile/case JSON;
3. verify DesignIR and provenance bytes before parsing;
4. compare both hashes to the suite;
5. call `assertDesignIRV2Integrity()`;
6. require equal DesignIR/provenance `sourceArtifactId`;
7. validate expectations;
8. load the pack and compare ID/version/SHA-256;
9. return cases in suite order.

Never normalize raw Pixso DSL in this loader.

- [ ] **Step 5: Run tests, typecheck, and commit**

```bash
pnpm install
pnpm vitest run packages/benchmark-runner/src/load-suite.test.ts
pnpm typecheck
git add packages/benchmark-runner pnpm-lock.yaml
git commit -m "feat: validate offline benchmark suites"
```

### Task 6: Draft Sber Pilot and Validation Command

**Files:**
- Create: `scripts/benchmark/create-pilot-candidates.ts`
- Create: `scripts/benchmark/validate.ts`
- Test: `packages/benchmark-runner/src/validate-command.test.ts`
- Create: `benchmarks/README.md`
- Create: `benchmarks/candidate-inventory.json`
- Create: `benchmarks/validation-profiles/syntax-only-v1/profile.json`
- Create: `benchmarks/suites/sber-space-ui-pilot-v1/suite.json`
- Create: `benchmarks/suites/sber-space-ui-pilot-v1/cases/modal-4-314/{design-ir.json,normalization-provenance.json,expectations.json,notes.md}`
- Create: `benchmarks/suites/sber-space-ui-pilot-v1/cases/choice-panel-70-118899/{design-ir.json,normalization-provenance.json,expectations.json,notes.md}`
- Modify: `package.json`
- Modify: `.prettierignore`

**Interfaces:**
- Consumes: `normalizePixsoDesignV2WithProvenance()` only during candidate creation.
- Produces: `pnpm benchmark:validate --suite <repo-relative-path>`.
- Produces: two real, offline draft cases; neither claims human-review readiness without a reference image.

- [ ] **Step 1: Write the failing command test**

Export a dependency-injected `main()` and assert:

```ts
expect(exitCode).toBe(0);
expect(stdout).toBe(
  "sber-space-ui-pilot-v1@1.0.0: 2 cases validated (draft)\n",
);
expect(stderr).toBe("");
```

Pass `../outside.json` and assert exit code 1 with `BENCHMARK_CASE_PATH_OUTSIDE_ROOT`.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/benchmark-runner/src/validate-command.test.ts
```

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement deterministic candidate creation**

Use these exact descriptors:

```ts
const candidates = [
  {
    id: "modal-4-314",
    fixture: "fixtures/pixso/modal-4-314/source.json",
    artifactId: "pixso_WSLukjrKancvZG0zbaMnyA_4_314_0d6c50995105",
    rootNodeId: "4:314",
  },
  {
    id: "choice-panel-70-118899",
    fixture: "fixtures/pixso/node-70-118899/source.json",
    artifactId: "pixso_PqSywlhYgqSRDoWr78IrdA_70_118899_1ff9d4c80454",
    rootNodeId: "70:118899",
  },
] as const;
```

The script requires `--output <directory>`, rejects output inside `benchmarks/` or `fixtures/`, normalizes each raw fixture, and writes stable candidate JSON. Run it into an OS temporary directory, review roots/provenance, then add accepted files. Do not copy `.uig/runs`.

- [ ] **Step 4: Add exact expectations and hashes**

`modal-4-314` requires roles `dialog`, `combobox`, `actionGroup`, and `heading`.
`choice-panel-70-118899` requires `choicePanel` with two sections and five options.
Use the Sber pack ID/version/hash returned by `loadDesignSystemPackV2()`.

The profile is:

```json
{
  "schema": "benchmark-validation-profile/v1",
  "id": "syntax-only-v1",
  "validation": {
    "syntax": { "enabled": true },
    "typecheck": {
      "enabled": false,
      "reason": "dependency-not-available"
    },
    "build": {
      "enabled": false,
      "reason": "harness-not-configured"
    },
    "render": {
      "enabled": false,
      "reason": "harness-not-configured"
    }
  }
}
```

Create `candidate-inventory.json` with the selected pilot nodes `4:314` and `70:118899`, the
existing frozen candidates `6:12547` and `70:118892`, and the known unverified candidates
`4:2469`, `4:11919`, `4:10047`, and `6:9447`. Only the two reviewed pilot nodes have inclusion
`selected`; unverified nodes remain `candidate` and do not enter the suite.

Append these exact preservation rules to `.prettierignore`:

```text
benchmarks/suites/**/design-ir.json
benchmarks/suites/**/normalization-provenance.json
benchmarks/baselines/**/*.json
```

Do not ignore suite manifests, expectations, profiles, candidate inventory, or Markdown.

- [ ] **Step 5: Implement the thin validation command**

Use `node:util` `parseArgs()` with required `--suite`. Call:

```ts
loadAndValidateBenchmarkSuite({
  repositoryRoot: process.cwd(),
  suitePath: values.suite,
});
```

Add:

```json
"benchmark:validate": "node --import tsx scripts/benchmark/validate.ts"
```

- [ ] **Step 6: Run acceptance and repository verification**

```bash
pnpm benchmark:validate --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
pnpm vitest run packages/contracts/src/component-metadata-source.test.ts packages/contracts/src/benchmark-suite.test.ts packages/contracts/src/benchmark-run.test.ts packages/contracts/src/benchmark-review.test.ts packages/contracts/src/benchmark-report.test.ts packages/benchmark-runner/src/load-suite.test.ts packages/benchmark-runner/src/validate-command.test.ts
pnpm format:check
pnpm typecheck
pnpm verify:fixtures
pnpm verify:qwen-extension-bundle
```

Expected: two draft cases validate offline; every command passes; no network or MCP call occurs.

- [ ] **Step 7: Commit**

```bash
git add .prettierignore package.json pnpm-lock.yaml scripts/benchmark benchmarks packages/benchmark-runner packages/contracts
git commit -m "feat: add offline benchmark pilot"
```

## Plan 1 Completion Gate

Before starting the automatic runner plan, run:

```bash
git status --short
pnpm benchmark:validate --suite benchmarks/suites/sber-space-ui-pilot-v1/suite.json
pnpm typecheck
pnpm test
```

Expected: only pre-existing unrelated untracked files remain; the draft suite validates; all existing and new tests pass. Review the two frozen artifact pairs and hashes before accepting the checkpoint.
