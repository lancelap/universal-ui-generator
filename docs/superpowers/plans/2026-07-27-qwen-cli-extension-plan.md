# Portable Qwen Code Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the existing Pixso-to-React workflow as a portable Qwen Code `0.21.0` extension installable from `lancelap/universal-ui-generator`, with compact `uig_plan` and `uig_generate` MCP tools and byte-identical durable output to the ordinary CLI.

**Architecture:** Keep `planFromUrl` and `generateFromRun` as the only planning and generation authorities. Add a thin stdio MCP adapter that validates Qwen inputs, invokes those services in `${workspacePath}`, and projects validated `.uig` contracts into compact results; bundle the adapter and its process-isolated generation worker into one committed ESM file that can fork itself in worker mode.

**Tech Stack:** TypeScript 5.9, Node.js `>=22`, pnpm 10.33, MCP SDK `@modelcontextprotocol/server@2.0.0-beta.5`, Zod 4, esbuild `0.28.1`, Vitest 3.2, Qwen Code `0.21.0`.

## Global Constraints

- The public extension version is exactly `universal-ui-generator@0.1.0`.
- The root Git repository must be installable with `qwen extensions install lancelap/universal-ui-generator`.
- The root manifest is `qwen-extension.json`; persistent context is `QWEN.md`; commands are under `commands/uig/`.
- The adapter exposes exactly `uig_plan` and `uig_generate`; there is no combined MCP tool.
- Planning and generation call the shared `planFromUrl` and `generateFromRun` services directly; the adapter never shells out to `pnpm`, parses CLI prose, starts Qwen, or implements a second planner or generator.
- The MCP process working directory is the only workspace authority. Tool inputs never accept a workspace path.
- All durable artifacts stay under `${workspacePath}/.uig`; the extension does not edit target-application source files.
- Qwen never receives raw Pixso DSL, DesignIR, a full UI manifest, a full resolution plan, diagnostic evidence, or `PIXSO_ACCESS_TOKEN`.
- Compact results contain no more than 50 diagnostics, retain canonical artifact order, and point to the complete durable artifact.
- `PIXSO_ACCESS_TOKEN` is a sensitive extension setting and must not occur in tool inputs, tool outputs, logs, fixtures, generated source, committed bundle bytes, or Git history.
- `dist/qwen-adapter.mjs` is one self-contained ESM file, runs on Node.js `>=22`, requires no extension-local `node_modules`, contains no source map, timestamp, local absolute path, fixture, run artifact, or secret, and is reproducible from the same source and lockfile.
- The bundled adapter preserves the existing process-isolated generation worker, pinned-run identity checks, pack authorization, path containment, and atomic publication.
- The first real ready acceptance node is `WSLukjrKancvZG0zbaMnyA / 4:314`; `6:12547` remains blocked until its separately scoped recognizer and contract work.
- Business logic, API binding, Qwen subagents, npm publication, GitHub Release archives, marketplace publication, and the legacy `/dsl-ui-direct` workflow are outside this plan.
- The unrelated `apps/cli/src/readme-commands.test.ts` full-suite timeout is a known red baseline. This plan must not change that test; integration to `main` still requires a separately approved fix or a newly clean baseline.

---

## File Map

### Shared application-service boundary

- `apps/cli/src/generate-from-run.ts` — accepts an internal worker entrypoint while preserving the public CLI behavior.
- `apps/cli/src/generate-from-run-worker.ts` — exports the reusable IPC worker function and no longer starts it as an import side effect.
- `apps/cli/src/generate-from-run-worker-entry.ts` — remains the ordinary CLI worker executable.
- `apps/cli/src/generate-from-run.test.ts` — proves a caller-supplied self-fork entrypoint preserves generation and security behavior.
- `apps/cli/package.json` — exposes only the three stable subpaths the adapter consumes.

### Qwen adapter source

- `extensions/qwen-cli/package.json` — private workspace package with exact MCP server dependency.
- `extensions/qwen-cli/src/results.ts` — public Zod schemas, result types, compact diagnostic projection, import aggregation, and artifact-to-result mapping.
- `extensions/qwen-cli/src/tools.ts` — input validation, pack-ID resolution, Pixso client creation, workspace anchoring, service invocation, and stable error conversion.
- `extensions/qwen-cli/src/server.ts` — MCP registration, stdio entrypoint, and the private self-fork worker mode.
- `extensions/qwen-cli/tests/results.test.ts` — compact result and leakage tests.
- `extensions/qwen-cli/tests/tools.test.ts` — service delegation, pack safety, workspace safety, blocked behavior, and error tests.
- `extensions/qwen-cli/tests/stdio.test.ts` — built-bundle initialize, tools/list, tool call, stdout, and clean shutdown tests.
- `extensions/qwen-cli/tests/parity.test.ts` — direct-service versus adapter durable-artifact parity.
- `extensions/qwen-cli/tests/manifest.test.ts` — root manifest, context, and commands contract.
- `extensions/qwen-cli/tests/install-smoke.test.ts` — install-copy test without extension-local dependencies.

### Extension packaging

- `scripts/build-qwen-extension.ts` — deterministic esbuild invocation for the single committed bundle.
- `scripts/verify-qwen-extension-bundle.ts` — rebuild comparison, SHA-256/provenance, runtime-version, secret, source-map, fixture, and absolute-path checks.
- `dist/qwen-adapter.mjs` — generated, committed runtime artifact; never hand-edited.
- `dist/qwen-adapter.provenance.json` — stable provenance containing hashes and compatibility metadata, but no timestamp or machine path.
- `qwen-extension.json` — Qwen Code root manifest.
- `QWEN.md` — small invariant authority boundary for Qwen.
- `commands/uig/plan.md` — `/uig:plan`.
- `commands/uig/generate.md` — `/uig:generate`.
- `commands/uig/pixso-to-react.md` — `/uig:pixso-to-react`.

### Monorepo and documentation

- `package.json` — build and verification scripts plus exact build dependencies.
- `pnpm-lock.yaml` — locked MCP server, Zod, and esbuild versions.
- `pnpm-workspace.yaml` — includes `extensions/*`.
- `tsconfig.base.json` — typechecks extension source and tests.
- `README.md` — installation, settings, usage, development, lifecycle commands, examples, and troubleshooting.

---

### Task 1: Make the generation worker reusable by a single-file adapter

**Files:**

- Modify: `apps/cli/src/generate-from-run.ts`
- Modify: `apps/cli/src/generate-from-run-worker.ts`
- Create: `apps/cli/src/generate-from-run-worker-entry.ts`
- Modify: `apps/cli/src/generate-from-run.test.ts`
- Modify: `apps/cli/package.json`

**Interfaces:**

- Consumes: the existing `generateFromRun({ runId, workspaceDir, explicitPackPath?, testHooks? })` call and existing IPC messages from `generate-worker-protocol.ts`.
- Produces:

```ts
export interface GenerationWorkerEntrypoint {
  modulePath: string;
  args: string[];
  execArgv: string[];
}

export async function generateFromRun(input: {
  runId: string;
  workspaceDir: string;
  explicitPackPath?: string;
  workerEntrypoint?: GenerationWorkerEntrypoint;
  testHooks?: {
    beforeInstall?: () => Promise<void>;
  };
}): Promise<{
  outputPath: string;
  status: "generated" | "blocked";
  writeStatus: "written" | "identical";
}>;

export async function runGenerateWorker(): Promise<void>;
```

- The ordinary CLI default resolves `generate-from-run-worker-entry.ts` under `tsx` and `generate-from-run-worker-entry.js` after compilation.
- The Qwen adapter later supplies its own bundle path plus `["--generation-worker"]`, allowing the committed bundle to fork itself without a second shipped file.

- [ ] **Step 1: Add a failing custom-entrypoint generation test**

Add a focused case to `apps/cli/src/generate-from-run.test.ts`. Reuse the test file's existing run fixture helper and add a temporary executable proxy module whose only job is importing and calling the real worker:

```ts
it("uses a caller-supplied generation worker entrypoint", async () => {
  const fixture = await createGenerationFixture();
  const proxyPath = join(fixture.workspaceDir, "worker-proxy.mjs");
  await writeFile(
    proxyPath,
    [
      `import { runGenerateWorker } from ${JSON.stringify(
        pathToFileURL(
          join(import.meta.dirname, "generate-from-run-worker.ts"),
        ).href,
      )};`,
      "await runGenerateWorker();",
    ].join("\n"),
  );

  const result = await generateFromRun({
    runId: fixture.runId,
    workspaceDir: fixture.workspaceDir,
    explicitPackPath: fixture.packPath,
    workerEntrypoint: {
      modulePath: proxyPath,
      args: [],
      execArgv: ["--import", require.resolve("tsx")],
    },
  });

  expect(result.status).toBe("generated");
  expect(
    JSON.parse(
      await readFile(
        join(fixture.runDir, "generated", "generation-report.json"),
        "utf8",
      ),
    ).sourceRunId,
  ).toBe(fixture.runId);
});
```

Import `pathToFileURL` from `node:url` and use the test file's existing `createRequire` or add:

```ts
const require = createRequire(import.meta.url);
```

- [ ] **Step 2: Run the focused test and verify the contract is absent**

Run:

```bash
pnpm vitest run apps/cli/src/generate-from-run.test.ts \
  -t "uses a caller-supplied generation worker entrypoint"
```

Expected: TypeScript/Vitest fails because `workerEntrypoint` is not accepted and `runGenerateWorker` is not exported.

- [ ] **Step 3: Export the worker function without an import side effect**

In `apps/cli/src/generate-from-run-worker.ts`, replace:

```ts
void runWorker();

async function runWorker(): Promise<void> {
```

with:

```ts
export async function runGenerateWorker(): Promise<void> {
```

Keep all worker validation, pinned directory identity, safe JSON reads, pack loading, generation, and IPC behavior unchanged.

Create `apps/cli/src/generate-from-run-worker-entry.ts`:

```ts
import { runGenerateWorker } from "./generate-from-run-worker.js";

void runGenerateWorker();
```

- [ ] **Step 4: Add the internal worker-entrypoint seam**

In `apps/cli/src/generate-from-run.ts`, export `GenerationWorkerEntrypoint`, accept the optional property, and resolve the unchanged default:

```ts
export interface GenerationWorkerEntrypoint {
  modulePath: string;
  args: string[];
  execArgv: string[];
}

function defaultWorkerEntrypoint(): GenerationWorkerEntrypoint {
  const sourceExtension = extname(fileURLToPath(import.meta.url));
  return {
    modulePath: fileURLToPath(
      new URL(
        `./generate-from-run-worker-entry${sourceExtension}`,
        import.meta.url,
      ),
    ),
    args: [],
    execArgv:
      sourceExtension === ".ts" ? ["--import", require.resolve("tsx")] : [],
  };
}
```

Pass `input.workerEntrypoint ?? defaultWorkerEntrypoint()` into `runPinnedWorker`. Replace the worker construction with:

```ts
const worker = fork(
  input.workerEntrypoint.modulePath,
  input.workerEntrypoint.args,
  {
    cwd: input.canonicalRunDir,
    execArgv: input.workerEntrypoint.execArgv,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  },
);
```

Do not expose `cwd`, stdio, IPC, or the pinned identity through this interface.

- [ ] **Step 5: Export stable application-service subpaths**

Add to `apps/cli/package.json`:

```json
"exports": {
  "./plan-from-url": "./src/plan-from-url.ts",
  "./generate-from-run": "./src/generate-from-run.ts",
  "./generate-from-run-worker": "./src/generate-from-run-worker.ts"
}
```

These are source exports for workspace typechecking and esbuild bundling; the installed extension consumes only `dist/qwen-adapter.mjs`.

- [ ] **Step 6: Run focused and CLI regression tests**

Run:

```bash
pnpm vitest run \
  apps/cli/src/generate-from-run.test.ts \
  apps/cli/src/react-generation-acceptance.test.ts
```

Expected: all tests pass, including symlink replacement, pinned-run mutation, pack authorization, blocked output, atomic publication, and the new custom entrypoint case.

- [ ] **Step 7: Typecheck the shared boundary**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the worker seam**

```bash
git add \
  apps/cli/package.json \
  apps/cli/src/generate-from-run.ts \
  apps/cli/src/generate-from-run-worker.ts \
  apps/cli/src/generate-from-run-worker-entry.ts \
  apps/cli/src/generate-from-run.test.ts
git commit -m "refactor: expose portable generation worker entrypoint"
```

---

### Task 2: Define compact Qwen results from validated durable contracts

**Files:**

- Create: `extensions/qwen-cli/package.json`
- Create: `extensions/qwen-cli/src/results.ts`
- Create: `extensions/qwen-cli/tests/results.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.base.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `GenerationRun`, `DesignSnapshot`, `ResolutionPlanV2`, `ReactGenerationReport`, and their validators from `@uig/contracts`.
- Produces:

```ts
export const UigPlanInputSchema: z.ZodObject<{
  url: z.ZodString;
  designSystem: z.ZodDefault<z.ZodString>;
}>;

export const UigGenerateInputSchema: z.ZodObject<{
  runId: z.ZodString;
}>;

export const UigPlanResultSchema: z.ZodType<UigPlanResult>;
export const UigGenerateResultSchema: z.ZodType<UigGenerateResult>;

export function compactDiagnostics(
  diagnostics: readonly Diagnostic[],
  artifactPath: string,
): CompactDiagnostics;

export function buildPlanResult(input: {
  run: GenerationRun;
  runPath: string;
  snapshot: DesignSnapshot;
  resolutionPlan: ResolutionPlanV2;
}): UigPlanResult;

export function buildGenerateResult(input: {
  runId: string;
  outputPath: string;
  writeStatus: "written" | "identical";
  report: ReactGenerationReport;
  reportSha256: string;
  resolutionPlan: ResolutionPlanV2;
}): UigGenerateResult;
```

- `files` contains `generation-report.json` plus source files for generated runs and only `generation-report.json` for blocked runs.
- `imports` is the deterministic union of verified `binding` and `bindings` values from the resolution plan, grouped by package and sorted by package then export.
- `renderOnlyProps[].targets` is the sorted copy of the report's `propNames`; no value is inferred from source text.

- [ ] **Step 1: Register the extension workspace and exact dependencies**

Create `extensions/qwen-cli/package.json`:

```json
{
  "name": "@uig/qwen-cli-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/server": "2.0.0-beta.5",
    "@uig/cli": "workspace:*",
    "@uig/contracts": "workspace:*",
    "@uig/provider-pixso": "workspace:*",
    "zod": "4.2.0"
  }
}
```

Add `extensions/*` to `pnpm-workspace.yaml`, add `extensions/**/*.ts` to `tsconfig.base.json`, and add exact `esbuild: "0.28.1"` to root `devDependencies`.

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` contains exact resolved entries for the MCP server, Zod 4.2.0, and esbuild 0.28.1.

- [ ] **Step 2: Write failing compact-result tests**

Create `extensions/qwen-cli/tests/results.test.ts` with these cases:

```ts
describe("compactDiagnostics", () => {
  it("preserves canonical order, strips evidence, and caps results at 50", () => {
    const diagnostics = Array.from({ length: 52 }, (_, index) => ({
      severity: index === 0 ? ("warning" as const) : ("error" as const),
      blocking: index > 0,
      stage: "resolve",
      code: `CODE_${String(index).padStart(2, "0")}`,
      message: `message ${index}`,
      source: {
        nodeId: `source:${index}`,
        manifestNodeId: `ui_${index}`,
      },
      evidence: { rawDsl: "must-not-leak" },
      suggestions: ["must-not-leak"],
    }));

    const result = compactDiagnostics(
      diagnostics,
      ".uig/runs/run_test/diagnostics.json",
    );

    expect(result.totalCount).toBe(52);
    expect(result.returnedCount).toBe(50);
    expect(result.truncated).toBe(true);
    expect(result.items[0]?.code).toBe("CODE_00");
    expect(result.items[49]?.code).toBe("CODE_49");
    expect(JSON.stringify(result)).not.toContain("rawDsl");
    expect(JSON.stringify(result)).not.toContain("suggestions");
  });
});
```

Add plan-result assertions for ready and blocked statuses, source `{ fileKey, nodeId }`, target proof, summary, and durable diagnostics path.

Add generation-result assertions:

```ts
expect(result.files).toEqual([
  { path: "GeneratedModal.module.css", sha256: cssSha },
  { path: "GeneratedModal.tsx", sha256: tsxSha },
  { path: "generation-report.json", sha256: reportSha },
]);
expect(result.imports).toEqual([
  { package: "@sber-space-ui/autocomplete", exports: ["Autocomplete"] },
  {
    package: "@sber-space-ui/modal",
    exports: ["Modal", "ModalBody", "ModalFooter"],
  },
]);
expect(result.renderOnlyProps).toEqual([
  {
    manifestNodeId: "ui_combobox_4-316",
    targets: ["mode", "onChange", "options", "value"],
  },
]);
```

Add a blocked report case asserting `files` contains only the report and the status remains `"blocked"`.

- [ ] **Step 3: Run the result tests and verify failure**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/results.test.ts
```

Expected: FAIL because `extensions/qwen-cli/src/results.ts` does not exist.

- [ ] **Step 4: Implement exact input and result schemas**

Create `extensions/qwen-cli/src/results.ts`. Define closed Zod objects with `.strict()`. Use these input constraints:

```ts
export const UigPlanInputSchema = z
  .object({
    url: z.string().url().startsWith("https://pixso.net/app/design/"),
    designSystem: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .default("sber-space-ui"),
  })
  .strict();

export const UigGenerateInputSchema = z
  .object({
    runId: z.string().regex(/^run_[A-Za-z0-9_-]+$/),
  })
  .strict();
```

Define `CompactDiagnosticSchema`, `CompactDiagnosticsSchema`, `UigPlanResultSchema`, and `UigGenerateResultSchema` to match the approved spec literals exactly. Export inferred TypeScript types.

- [ ] **Step 5: Implement lossless status and compact projections**

Implement `compactDiagnostics` as an order-preserving `slice(0, 50)` mapping:

```ts
const items = diagnostics.slice(0, 50).map((diagnostic) => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  blocking: diagnostic.blocking,
  stage: diagnostic.stage,
  ...(diagnostic.source?.manifestNodeId
    ? { manifestNodeId: diagnostic.source.manifestNodeId }
    : {}),
  ...(diagnostic.source?.nodeId
    ? { sourceNodeId: diagnostic.source.nodeId }
    : {}),
  message: diagnostic.message,
}));
```

`buildPlanResult` maps `run.status === "blocked"` to `"blocked"` and every other valid run status to `"ready"`. Use `snapshot.source.documentId` as `fileKey`, `snapshot.source.nodeId` as `nodeId`, and do not include `snapshot.content`.

`buildGenerateResult`:

1. validates `report.sourceRunId === runId`;
2. copies and sorts `report.files`, then appends the separately hashed `generation-report.json` and sorts the final list by path;
3. gathers only resolved design-system bindings from `resolutionPlan.nodes`;
4. deduplicates exports with `Map<string, Set<string>>`;
5. maps V2 `renderOnlyProps` to `{ manifestNodeId, targets: [...propNames].sort() }`; V1 reports produce an empty list;
6. uses the generation report diagnostics artifact path `${outputPath}/generation-report.json`;
7. validates the returned object with the exported Zod result schema.

- [ ] **Step 6: Run result tests and typecheck**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/results.test.ts
pnpm typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit compact contracts**

```bash
git add \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.base.json \
  extensions/qwen-cli/package.json \
  extensions/qwen-cli/src/results.ts \
  extensions/qwen-cli/tests/results.test.ts
git commit -m "feat: define compact Qwen tool contracts"
```

---

### Task 3: Implement workspace-anchored shared-service tools

**Files:**

- Create: `extensions/qwen-cli/src/tools.ts`
- Create: `extensions/qwen-cli/tests/tools.test.ts`

**Interfaces:**

- Consumes:

```ts
planFromUrl(input: {
  url: string;
  designSystemPackPath: string;
  workspaceDir: string;
  pixsoClient: PixsoDslClient;
  now: () => Date;
}): Promise<GenerationRun>;

generateFromRun(input: {
  runId: string;
  workspaceDir: string;
  explicitPackPath?: string;
  workerEntrypoint?: GenerationWorkerEntrypoint;
}): Promise<{
  outputPath: string;
  status: "generated" | "blocked";
  writeStatus: "written" | "identical";
}>;
```

- Produces:

```ts
export class UigToolError extends Error {
  readonly code:
    | "UIG_INPUT_INVALID"
    | "UIG_PROVIDER_CONFIG_MISSING"
    | "UIG_PROVIDER_FAILED"
    | "UIG_PACK_INVALID"
    | "UIG_RUN_INVALID"
    | "UIG_GENERATION_FAILED"
    | "UIG_FILESYSTEM_FAILED";
}

export interface UigToolDependencies {
  workspaceDir: string;
  extensionRoot: string;
  adapterModulePath: string;
  token: string | undefined;
  now: () => Date;
  createPixsoClient(token: string): PixsoDslClient;
  planFromUrl: typeof planFromUrl;
  generateFromRun: typeof generateFromRun;
}

export function createUigTools(dependencies: UigToolDependencies): {
  plan(input: unknown): Promise<UigPlanResult>;
  generate(input: unknown): Promise<UigGenerateResult>;
};
```

- [ ] **Step 1: Write failing service-delegation tests**

Create `extensions/qwen-cli/tests/tools.test.ts` with injected fakes so tests do not call the network.

For planning, capture the service input and assert:

```ts
expect(capturedPlanInput).toMatchObject({
  url: "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
  workspaceDir,
  designSystemPackPath: join(
    extensionRoot,
    "design-system-packs",
    "sber-space-ui",
  ),
});
```

Assert the tool reads validated `snapshot.json`, `resolution-plan.json`, and diagnostics from the run the fake service writes beneath `workspaceDir/.uig/runs/<runId>`.

For generation, capture:

```ts
expect(capturedGenerateInput).toMatchObject({
  runId: "run_test",
  workspaceDir,
  explicitPackPath: join(
    extensionRoot,
    "design-system-packs",
    "sber-space-ui",
  ),
  workerEntrypoint: {
    modulePath: adapterModulePath,
    args: ["--generation-worker"],
    execArgv: [],
  },
});
```

The generation fixture must write `generation-report.json` under the returned output path so the tool can validate and project it.

- [ ] **Step 2: Add failing safety, blocked, and leakage tests**

Add cases proving:

- `designSystem: "../sber-space-ui"` and `designSystem: "/tmp/pack"` return `UIG_INPUT_INVALID` before the plan service is called;
- a safe but absent pack ID returns `UIG_PACK_INVALID`;
- absent or blank token returns `UIG_PROVIDER_CONFIG_MISSING`, contains no environment values, and creates no `.uig/runs` entry;
- a blocked plan remains blocked;
- a blocked generation remains blocked and has no source files;
- `runId: "../run_test"` returns `UIG_INPUT_INVALID`;
- generated and error JSON contain neither a sentinel token nor `rawDsl`;
- dependency failures are converted to a stable concise code without a stack.

- [ ] **Step 3: Run the tool tests and verify failure**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/tools.test.ts
```

Expected: FAIL because `createUigTools` and `UigToolError` do not exist.

- [ ] **Step 4: Implement safe pack and artifact resolution**

In `extensions/qwen-cli/src/tools.ts`, validate all input with the exported Zod schemas. Resolve pack paths only after the safe-ID regex succeeds:

```ts
function packPath(extensionRoot: string, designSystem: string): string {
  const packsRoot = resolve(extensionRoot, "design-system-packs");
  const candidate = resolve(packsRoot, designSystem);
  if (
    candidate === packsRoot ||
    !candidate.startsWith(`${packsRoot}${sep}`)
  ) {
    throw new UigToolError("UIG_INPUT_INVALID", "Unsafe design-system ID");
  }
  return candidate;
}
```

Require the pack candidate to be an ordinary non-symlink directory before invoking a service. For generation, load and validate `run.json` first, then load its validated resolution plan and resolve the exact `resolutionPlan.target.designSystem` pack. Do not accept a design-system override in `uig_generate`.

Use safe run artifact basenames from `GenerationRunSchema`; reject empty, `"."`, `".."`, slash, or backslash before joining them to the run directory.

- [ ] **Step 5: Implement planning delegation**

`plan()` must:

1. parse input;
2. reject a missing/blank token;
3. create the Pixso client only from the injected token;
4. invoke `planFromUrl` with `workspaceDir`, the extension-root pack path, and `now`;
5. derive `.uig/runs/<runId>` without accepting a path from the model;
6. validate `snapshot.json` with `DesignSnapshotSchema`;
7. validate the referenced resolution plan with `ResolutionPlanV2Schema`;
8. call `buildPlanResult`.

No catch block may include the original token, raw response body, stack, or serialized provider object.

- [ ] **Step 6: Implement generation delegation**

`generate()` must:

1. parse the run ID;
2. validate the selected run and resolution plan;
3. resolve the authorized pack from the extension's bundled `design-system-packs`;
4. invoke `generateFromRun` with the same workspace and:

```ts
workerEntrypoint: {
  modulePath: dependencies.adapterModulePath,
  args: ["--generation-worker"],
  execArgv: [],
}
```

5. read the returned output's `generation-report.json`;
6. hash the exact report bytes with SHA-256;
7. validate JSON with `ReactGenerationReportSchema` and `assertReactGenerationReportIntegrity`;
8. reject any mismatch among requested run ID, service status, and report status;
9. call `buildGenerateResult`.

- [ ] **Step 7: Implement stable concise errors**

Use `UigToolError` for all expected adapter failures. Map:

- Zod parse errors → `UIG_INPUT_INVALID`;
- missing token → `UIG_PROVIDER_CONFIG_MISSING`;
- Pixso fetch/client errors → `UIG_PROVIDER_FAILED`;
- pack path/load errors → `UIG_PACK_INVALID`;
- run selection/contract errors → `UIG_RUN_INVALID`;
- `ReactGenerationError` → `UIG_GENERATION_FAILED` with its public code included but no stack;
- remaining safe filesystem failures → `UIG_FILESYSTEM_FAILED`.

Error messages identify the failed stage and stable domain code only. They do not interpolate the token, raw provider payload, environment, absolute workspace path, or stack trace.

- [ ] **Step 8: Run tool, shared-service, and type tests**

Run:

```bash
pnpm vitest run \
  extensions/qwen-cli/tests/tools.test.ts \
  apps/cli/src/plan-from-url.test.ts \
  apps/cli/src/generate-from-run.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit the adapter application layer**

```bash
git add \
  extensions/qwen-cli/src/tools.ts \
  extensions/qwen-cli/tests/tools.test.ts
git commit -m "feat: add Qwen workflow tool adapter"
```

---

### Task 4: Expose exactly two MCP tools over stdio

**Files:**

- Create: `extensions/qwen-cli/src/server.ts`
- Create: `extensions/qwen-cli/tests/server.test.ts`

**Interfaces:**

- Consumes: `createUigTools`, the exported Zod input/output schemas, `serveStdio`, and `runGenerateWorker`.
- Produces:

```ts
export function createUigMcpServer(input: {
  tools: ReturnType<typeof createUigTools>;
}): McpServer;

export async function runQwenAdapter(): Promise<void>;
```

- `node dist/qwen-adapter.mjs` serves MCP.
- `node dist/qwen-adapter.mjs --generation-worker` runs only the existing generation IPC worker.

- [ ] **Step 1: Write failing in-process server tests**

Create `extensions/qwen-cli/tests/server.test.ts`. Instantiate the server with fake tools and use the MCP SDK's in-memory transport pair to initialize and list tools.

Assert:

```ts
expect(toolNames).toEqual(["uig_generate", "uig_plan"]);
expect(planTool.inputSchema).toBeDefined();
expect(planTool.outputSchema).toBeDefined();
expect(generateTool.inputSchema).toBeDefined();
expect(generateTool.outputSchema).toBeDefined();
```

Call each tool once and assert both:

```ts
expect(response.structuredContent).toEqual(expectedResult);
expect(response.content).toEqual([
  { type: "text", text: JSON.stringify(expectedResult) },
]);
```

Make a fake throw `new UigToolError("UIG_INPUT_INVALID", "Invalid plan input")` and assert the MCP response is an error with stable code and no stack.

- [ ] **Step 2: Run the server test and verify failure**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/server.test.ts
```

Expected: FAIL because `createUigMcpServer` does not exist.

- [ ] **Step 3: Register the exact MCP surface**

Implement `createUigMcpServer` with:

```ts
const server = new McpServer(
  { name: "universal-ui-generator", version: "0.1.0" },
  { capabilities: { tools: {} } },
);
```

Register only `uig_plan` and `uig_generate`. Each registration uses the matching Zod input and output schema and returns both `structuredContent` and compact JSON text. Do not register resources, prompts, logging, raw-artifact readers, or combined plan-and-generate tools.

Convert `UigToolError` to:

```ts
{
  isError: true,
  content: [
    {
      type: "text",
      text: JSON.stringify({
        code: error.code,
        message: error.message,
      }),
    },
  ],
}
```

Unexpected errors return code `UIG_INTERNAL_ERROR` and message `Unexpected adapter failure`.

- [ ] **Step 4: Implement stdio and private worker modes**

At module start, branch only on the exact private argument:

```ts
const workerMode =
  process.argv.length === 3 && process.argv[2] === "--generation-worker";

if (workerMode) {
  void runGenerateWorker();
} else {
  void runQwenAdapter();
}
```

`runQwenAdapter()`:

- uses `process.cwd()` as `workspaceDir`;
- calculates `adapterModulePath` from `fileURLToPath(import.meta.url)`;
- calculates `extensionRoot` as the parent of the bundle's `dist` directory;
- reads only `process.env.PIXSO_ACCESS_TOKEN`;
- creates the Pixso client with endpoint `https://pixso.net/api/mcp/mcp`;
- calls `serveStdio(() => createUigMcpServer(...))`;
- never writes informational text to stdout;
- writes only the constant `uig adapter failed to start` to stderr on an unexpected startup failure and sets `process.exitCode = 1`.

- [ ] **Step 5: Run MCP and type tests**

Run:

```bash
pnpm vitest run \
  extensions/qwen-cli/tests/server.test.ts \
  extensions/qwen-cli/tests/tools.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit the MCP server**

```bash
git add \
  extensions/qwen-cli/src/server.ts \
  extensions/qwen-cli/tests/server.test.ts
git commit -m "feat: expose Qwen workflow over MCP stdio"
```

---

### Task 5: Build and verify the deterministic single-file runtime

**Files:**

- Create: `scripts/build-qwen-extension.ts`
- Create: `scripts/verify-qwen-extension-bundle.ts`
- Create: `extensions/qwen-cli/tests/stdio.test.ts`
- Create: `dist/qwen-adapter.mjs`
- Create: `dist/qwen-adapter.provenance.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: `extensions/qwen-cli/src/server.ts`.
- Produces:

```bash
pnpm build:qwen-extension
pnpm verify:qwen-extension-bundle
node dist/qwen-adapter.mjs
```

- The provenance JSON schema is:

```ts
interface QwenAdapterProvenance {
  schema: "uig-qwen-adapter-provenance/v1";
  artifact: "dist/qwen-adapter.mjs";
  sha256: string;
  sourceEntry: "extensions/qwen-cli/src/server.ts";
  buildCommand: "pnpm build:qwen-extension";
  lockfile: "pnpm-lock.yaml";
  lockfileSha256: string;
  node: ">=22";
  bundler: "esbuild@0.28.1";
}
```

- [ ] **Step 1: Write a failing bundle-verification test**

Create `extensions/qwen-cli/tests/stdio.test.ts` with a first case that asserts `dist/qwen-adapter.mjs` and provenance exist, that the bundle is a regular file, and that:

```ts
expect(bundle).not.toMatch(/sourceMappingURL/);
expect(bundle).not.toContain("/Users/");
expect(bundle).not.toContain("\\Users\\");
expect(bundle).not.toContain("fixtures/");
expect(bundle).not.toContain("PIXSO_ACCESS_TOKEN=");
expect(bundle).not.toContain("your_access_token");
```

Read provenance, recompute both bundle and lockfile SHA-256, and compare every literal field to the interface above.

- [ ] **Step 2: Run the test and verify missing artifacts**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/stdio.test.ts
```

Expected: FAIL because the committed bundle and provenance do not exist.

- [ ] **Step 3: Implement deterministic bundle generation**

Create `scripts/build-qwen-extension.ts` using the esbuild JavaScript API:

```ts
await build({
  entryPoints: ["extensions/qwen-cli/src/server.ts"],
  outfile: "dist/qwen-adapter.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  sourcemap: false,
  legalComments: "none",
  charset: "utf8",
  minify: false,
  treeShaking: true,
  banner: {
    js: [
      'import { createRequire as __uigCreateRequire } from "node:module";',
      "const require = __uigCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
```

Create `dist/` if absent. After esbuild returns, hash the bundle and `pnpm-lock.yaml`, construct the provenance object with only the stable fields above, and write it with the repository's `stableStringify`.

Add root scripts:

```json
"build:qwen-extension": "node --import tsx scripts/build-qwen-extension.ts",
"verify:qwen-extension-bundle": "node --import tsx scripts/verify-qwen-extension-bundle.ts"
```

- [ ] **Step 4: Implement rebuild and policy verification**

`scripts/verify-qwen-extension-bundle.ts` must:

1. read the committed bundle and provenance;
2. verify provenance with an exact Zod schema;
3. verify the bundle and lockfile hashes;
4. rebuild into a `mkdtemp(join(tmpdir(), "uig-qwen-bundle-"))` directory with the same exported build function;
5. compare rebuilt bytes to committed bytes;
6. scan UTF-8 bundle text for:
   - `/Users/`;
   - `C:\\Users\\`;
   - `sourceMappingURL`;
   - `fixtures/`;
   - `.uig/runs/`;
   - `your_access_token`;
   - PEM private-key headers;
   - token assignment patterns;
7. verify the running Node major version is at least 22;
8. remove only the exact temporary directory it created in a `finally` block.

The checker must never print bundle contents or environment values.

- [ ] **Step 5: Build and verify reproducibility**

Run:

```bash
pnpm build:qwen-extension
pnpm verify:qwen-extension-bundle
```

Expected:

```text
Qwen adapter bundle verified
```

Run `git diff --exit-code dist/qwen-adapter.mjs dist/qwen-adapter.provenance.json` immediately after a second:

```bash
pnpm build:qwen-extension
```

Expected: exit code 0; the second build changes no committed bytes.

- [ ] **Step 6: Add built stdio initialization and listing**

Extend `extensions/qwen-cli/tests/stdio.test.ts` to spawn:

```ts
spawn(process.execPath, [bundlePath], {
  cwd: workspaceDir,
  env: {
    PATH: process.env.PATH,
    PIXSO_ACCESS_TOKEN: "stdio-test-token",
  },
  stdio: ["pipe", "pipe", "pipe"],
});
```

Use the MCP client stdio transport or exact JSON-RPC framing supported by `@modelcontextprotocol/server@2.0.0-beta.5` to:

1. initialize;
2. call `tools/list`;
3. assert names equal `["uig_generate", "uig_plan"]`;
4. assert both input and output schemas are present;
5. close the client;
6. assert clean process exit;
7. assert parsed stdout contained protocol messages only;
8. assert stderr and all responses contain neither the sentinel token nor a stack.

- [ ] **Step 7: Prove the built bundle can fork itself for generation**

Add a stdio integration case that creates a complete stored fixture run in a temporary workspace, starts the built adapter with that workspace as `cwd`, initializes MCP, calls `uig_generate`, and asserts:

```ts
expect(result.structuredContent).toMatchObject({
  schema: "uig-qwen-generate-result/v1",
  status: "generated",
  runId,
});
expect(
  await readFile(
    join(workspaceDir, ".uig", "runs", runId, "generated", "GeneratedModal.tsx"),
    "utf8",
  ),
).toContain("export");
```

This test exercises `dist/qwen-adapter.mjs --generation-worker` through the real parent process; it must not invoke the source worker entry.

- [ ] **Step 8: Run bundle and stdio checks**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/stdio.test.ts
pnpm verify:qwen-extension-bundle
```

Expected: all tests and policy checks pass.

- [ ] **Step 9: Commit source and generated runtime together**

```bash
git add \
  package.json \
  scripts/build-qwen-extension.ts \
  scripts/verify-qwen-extension-bundle.ts \
  extensions/qwen-cli/tests/stdio.test.ts \
  dist/qwen-adapter.mjs \
  dist/qwen-adapter.provenance.json
git commit -m "build: ship portable Qwen adapter bundle"
```

---

### Task 6: Add the root Qwen manifest, invariant context, and commands

**Files:**

- Create: `qwen-extension.json`
- Create: `QWEN.md`
- Create: `commands/uig/plan.md`
- Create: `commands/uig/generate.md`
- Create: `commands/uig/pixso-to-react.md`
- Create: `extensions/qwen-cli/tests/manifest.test.ts`

**Interfaces:**

- Consumes: Qwen Code `0.21.0` extension manifest, settings, and Markdown command contracts.
- Produces the commands `/uig:plan`, `/uig:generate`, and `/uig:pixso-to-react`.

- [ ] **Step 1: Write failing manifest and command tests**

Create `extensions/qwen-cli/tests/manifest.test.ts`. Parse the root JSON and assert exact equality:

```ts
expect(manifest).toEqual({
  name: "universal-ui-generator",
  version: "0.1.0",
  contextFileName: "QWEN.md",
  commands: "commands",
  mcpServers: {
    uig: {
      command: "node",
      args: ["${extensionPath}${/}dist${/}qwen-adapter.mjs"],
      cwd: "${workspacePath}",
    },
  },
  settings: [
    {
      name: "Pixso access token",
      description: "Access token used only by the Pixso Remote MCP client",
      envVar: "PIXSO_ACCESS_TOKEN",
      sensitive: true,
    },
  ],
});
```

Assert:

- `QWEN.md` and all three command files exist;
- no extension-facing file contains `/Users/`, `C:\Users\`, `/dsl-ui-direct`, `gigacode-extension`, or `gigacode-mcp`;
- command files mention only `uig_plan` and/or `uig_generate` in the approved sequence;
- no file contains a token value or raw-DSL retrieval instruction;
- there is no `agents/` directory added by this feature.

- [ ] **Step 2: Run the manifest test and verify failure**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/manifest.test.ts
```

Expected: FAIL because root extension files do not exist.

- [ ] **Step 3: Create the exact root manifest**

Create `qwen-extension.json` with exactly the object asserted in Step 1. Do not add `trust`, hooks, arbitrary environment values, extra MCP servers, or absolute paths.

- [ ] **Step 4: Write concise invariant Qwen context**

Create `QWEN.md` containing these enforceable rules:

```markdown
# Universal UI Generator

For Pixso-to-React work, use the `uig_plan` and `uig_generate` MCP tools.
Their structured results and durable `.uig` artifacts are authoritative.

- Never call Pixso Remote MCP directly or ask for raw Pixso DSL.
- Never choose, invent, replace, or repair design-system imports, props, or composition.
- Never edit generated TSX or CSS after `uig_generate`.
- Keep `blocked` status explicit and stop instead of bypassing a blocker.
- Report the run ID and path, pack ID/version/hash, generated paths/hashes,
  render-only props, and compact blocking diagnostics returned by the tools.
- Do not claim business logic or API binding is implemented.
- Never reveal, print, store, or repeat `PIXSO_ACCESS_TOKEN`.
```

- [ ] **Step 5: Write `/uig:plan`**

Create `commands/uig/plan.md` with usage `/uig:plan <pixso-url> [design-system]`. Its instructions must:

1. require a Pixso URL from the user arguments;
2. default design system to `sber-space-ui`;
3. call `uig_plan` exactly once;
4. report status, run ID/path, pack proof, summary, and compact blocking diagnostics;
5. stop without generation, source edits, raw-DSL requests, or blocker bypass.

- [ ] **Step 6: Write `/uig:generate`**

Create `commands/uig/generate.md` with usage `/uig:generate <run-id>`. Its instructions must:

1. require the run ID from user arguments;
2. call `uig_generate` exactly once;
3. report status, output path, file paths/hashes, verified imports, render-only props, and diagnostics;
4. leave every generated file unchanged;
5. stop honestly for blocked or tool-error results.

- [ ] **Step 7: Write `/uig:pixso-to-react`**

Create `commands/uig/pixso-to-react.md` with usage `/uig:pixso-to-react <pixso-url> [design-system]`. Its instructions must:

1. call `uig_plan`;
2. report and stop if its status is blocked;
3. call `uig_generate` with exactly the returned run ID only if plan status is ready;
4. report the generated result without editing it;
5. never invoke a Qwen file-writing tool for TSX/CSS and never retry by weakening validation.

- [ ] **Step 8: Run manifest and formatting checks**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/manifest.test.ts
pnpm format:check
```

Expected: both pass.

- [ ] **Step 9: Commit extension metadata and commands**

```bash
git add \
  qwen-extension.json \
  QWEN.md \
  commands/uig/plan.md \
  commands/uig/generate.md \
  commands/uig/pixso-to-react.md \
  extensions/qwen-cli/tests/manifest.test.ts
git commit -m "feat: add installable Qwen extension commands"
```

---

### Task 7: Prove CLI/MCP parity and installation without local dependencies

**Files:**

- Create: `extensions/qwen-cli/tests/parity.test.ts`
- Create: `extensions/qwen-cli/tests/install-smoke.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: the built adapter, the stored Pixso `4:314` fixture, both design-system packs, and the direct application services.
- Produces:

```bash
pnpm test:qwen-extension
```

- [ ] **Step 1: Write a failing direct-service/MCP parity test**

Create `extensions/qwen-cli/tests/parity.test.ts`. Use two fresh temporary workspaces, the same stored Pixso snapshot fixture, a fixed time, and the MCP SDK's in-memory transport.

Workspace A:

1. invoke `planFromSnapshot` or the existing offline CLI-adapter helper with the Sber pack;
2. invoke `generateFromRun`;
3. read the run, snapshot, resolution plan, generation report, and generated file bytes.

Workspace B:

1. construct `createUigTools` with a deterministic `PixsoDslClient` that returns the identical fixture;
2. construct `createUigMcpServer` with those tools;
3. connect through the MCP SDK's in-memory client/server transport;
4. call `uig_plan`;
5. call `uig_generate` with the returned run ID;
6. read the same durable artifacts and generated files.

Normalize only run-specific timestamps and run IDs when comparing JSON. Assert exact equality for:

```ts
expect(mcpResolutionPlan.target).toEqual(cliResolutionPlan.target);
expect(mcpResolutionPlan.summary).toEqual(cliResolutionPlan.summary);
expect(mcpGenerationReport.status).toBe(cliGenerationReport.status);
expect(mcpGeneratedHashes).toEqual(cliGeneratedHashes);
```

The MCP result may be smaller, but the stored contracts and source bytes must not differ.

- [ ] **Step 2: Run parity and observe the missing parity implementation**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/parity.test.ts
```

Expected: FAIL until the server supports an internal test-only Pixso endpoint injection or the parity harness supplies the existing `PixsoDslClient` through `createUigTools`.

- [ ] **Step 3: Use the existing dependency seam without adding production configuration**

Prefer in-process MCP transport for parity so production stdio behavior and production environment remain unchanged:

```ts
const tools = createUigTools({
  workspaceDir: mcpWorkspace,
  extensionRoot,
  adapterModulePath,
  token: "test-token",
  now: fixedNow,
  createPixsoClient: () => fixturePixsoClient,
  planFromUrl,
  generateFromRun,
});
const server = createUigMcpServer({ tools });
```

Do not add a public tool field, manifest setting, production environment variable, or command argument for fixture injection.

- [ ] **Step 4: Complete parity assertions**

Compare:

- `generation-run/v1` stage/status shape after normalizing run ID;
- snapshot source file key and node ID;
- resolution target pack ID, version, and SHA-256;
- resolution summary and diagnostics codes/order;
- output relative paths;
- SHA-256 of every generated TSX, CSS, fallback file, and `generation-report.json`;
- generated versus blocked status.

Also assert serialized MCP responses do not contain snapshot content, `design-ir/v2`, `ui-manifest/v2`, `resolution-plan/v2`, diagnostic evidence, or the sentinel token.

- [ ] **Step 5: Write an install-copy smoke test**

Create `extensions/qwen-cli/tests/install-smoke.test.ts`. Build a temporary installation directory containing only Git-tracked release inputs:

```text
qwen-extension.json
QWEN.md
commands/
dist/
design-system-packs/
```

Do not copy `node_modules`, `apps`, `packages`, `extensions`, fixtures, or source TypeScript. Spawn the copied `dist/qwen-adapter.mjs`, initialize MCP, list tools, and assert exactly two tools are operational. Create a stored fixture run under a separate temporary workspace and call copied-bundle `uig_generate` to prove self-fork generation works from the install copy.

- [ ] **Step 6: Add the focused extension test script**

Add to root `package.json`:

```json
"test:qwen-extension": "vitest run extensions/qwen-cli/tests"
```

Extend `verify` to run bundle verification before tests:

```json
"verify": "pnpm format:check && pnpm typecheck && pnpm verify:fixtures && pnpm verify:qwen-extension-bundle && pnpm test"
```

- [ ] **Step 7: Run focused extension, pack, and acceptance tests**

Run:

```bash
pnpm test:qwen-extension
pnpm vitest run \
  packages/component-catalog/src/design-system-pack-v2.test.ts \
  apps/cli/src/offline-acceptance.test.ts \
  apps/cli/src/react-generation-acceptance.test.ts
pnpm verify:qwen-extension-bundle
```

Expected: all pass for both Sber Space UI and Material UI pack validation and the `4:314` fixture.

- [ ] **Step 8: Commit parity and install proof**

```bash
git add \
  package.json \
  extensions/qwen-cli/tests/parity.test.ts \
  extensions/qwen-cli/tests/install-smoke.test.ts
git commit -m "test: prove Qwen extension parity and portability"
```

---

### Task 8: Document install, lifecycle, usage, and honest limitations

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: exact Qwen Code `0.21.0` commands and the manifest setting name.
- Produces: a complete operator guide with no reference to the legacy experiment.

- [ ] **Step 1: Add a failing README contract test**

Extend `extensions/qwen-cli/tests/manifest.test.ts` with assertions that `README.md` contains:

```text
Qwen Code 0.21.0
qwen extensions install lancelap/universal-ui-generator
qwen extensions update universal-ui-generator
qwen extensions enable universal-ui-generator
qwen extensions disable universal-ui-generator
qwen extensions uninstall universal-ui-generator
qwen extensions settings set universal-ui-generator "Pixso access token"
/uig:plan
/uig:generate
/uig:pixso-to-react
qwen extensions link
.uig
business logic
```

Assert it does not contain `/dsl-ui-direct`, the external gigacode repository names, a token value, or a user-specific path.

- [ ] **Step 2: Run the README contract and verify failure**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/manifest.test.ts
```

Expected: FAIL on the missing Qwen extension documentation.

- [ ] **Step 3: Add installation and configuration documentation**

Add a `Qwen Code extension` section to `README.md` with:

```bash
qwen extensions install lancelap/universal-ui-generator
qwen extensions settings set \
  universal-ui-generator \
  "Pixso access token"
```

State Node.js `>=22`, Qwen Code `0.21.0`, default `sber-space-ui`, and that the sensitive setting supplies `PIXSO_ACCESS_TOKEN` only to the adapter.

- [ ] **Step 4: Add command and result examples**

Document:

```text
/uig:plan https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314
/uig:generate run_20260727_example
/uig:pixso-to-react https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314
```

The ready example must show run ID/path, pack version/hash, resolution counts, and diagnostics count. The generated example must show output path, file hashes, verified imports, and render-only props. The blocked example must explicitly state that no TSX is authorized and generation stops.

State that `.uig` contains complete durable artifacts, generated source is not copied into the application, and business logic/API binding is not implemented.

- [ ] **Step 5: Add lifecycle, development, and troubleshooting**

Document:

```bash
qwen extensions update universal-ui-generator
qwen extensions enable universal-ui-generator
qwen extensions disable universal-ui-generator
qwen extensions uninstall universal-ui-generator
qwen extensions link "$(git rev-parse --show-toplevel)"
```

State that the link command must be run from the repository checkout.

Troubleshooting must cover:

- missing token → configure the sensitive setting;
- missing Node.js → install Node.js `>=22`;
- blocked resolution → inspect the returned durable diagnostics path and do not bypass it;
- MCP startup failure → verify the extension is enabled, then use `qwen --debug` to inspect startup without printing the sensitive setting;
- no source-tree changes → inspect `.uig/runs/<run-id>/generated`.

- [ ] **Step 6: Run documentation and formatting tests**

Run:

```bash
pnpm vitest run extensions/qwen-cli/tests/manifest.test.ts
pnpm format:check
```

Expected: both pass.

- [ ] **Step 7: Commit documentation**

```bash
git add README.md extensions/qwen-cli/tests/manifest.test.ts
git commit -m "docs: document Qwen extension workflow"
```

---

### Task 9: Validate local Qwen discovery and public feature-ref installation

**Files:**

- Modify only if validation exposes a contract defect: `qwen-extension.json`, `QWEN.md`, `commands/uig/*.md`, adapter source/tests, or build scripts.
- Do not modify the user's global Qwen extension registry by automated tests.

**Interfaces:**

- Consumes: locally installed Qwen Code `0.21.0`, the feature worktree, and the public branch.
- Produces: manual validation evidence for link discovery and a clean Git installation without local dependencies.

- [ ] **Step 1: Confirm exact Qwen version and clean extension state**

Run:

```bash
qwen --version
qwen extensions list
```

Expected: Qwen reports `0.21.0`. Record existing extension names so validation can remove only the test installation it creates.

- [ ] **Step 2: Link the feature worktree**

Run:

```bash
qwen extensions link \
  /Users/danilel/Documents/Codex/universal-ui-generator/.worktrees/qwen-cli-extension
qwen extensions list
```

Expected: `universal-ui-generator` is discovered with no manifest error. Confirm Qwen exposes `/uig:plan`, `/uig:generate`, and `/uig:pixso-to-react`, and starts the `uig` MCP server.

- [ ] **Step 3: Run the supported real acceptance through the linked extension**

Configure the sensitive setting without printing its value:

```bash
qwen extensions settings set \
  --scope=workspace \
  universal-ui-generator \
  PIXSO_ACCESS_TOKEN
```

In Qwen, run:

```text
/uig:pixso-to-react https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314 sber-space-ui
```

Expected:

- plan status is ready;
- generation status is generated;
- Qwen reports pack ID/version/hash, output paths/hashes, render-only props, and compact diagnostics;
- the complete ordinary artifacts exist under that workspace's `.uig`;
- Qwen makes no post-generation TSX/CSS edit.

- [ ] **Step 4: Compare real direct CLI and Qwen hashes**

Run the direct CLI against the same URL and Sber pack in a clean temporary workspace, then compare:

```bash
find <cli-workspace>/.uig/runs/<run-id>/generated \
  -type f -exec shasum -a 256 {} \;
find <qwen-workspace>/.uig/runs/<run-id>/generated \
  -type f -exec shasum -a 256 {} \;
```

Expected: identical relative generated paths and SHA-256 values. Compare resolution target pack ID, version, and hash from both `resolution-plan.json` files.

- [ ] **Step 5: Confirm honest blocked behavior**

In a clean Qwen workspace, run:

```text
/uig:plan https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=6:12547 sber-space-ui
```

Expected: the known unsupported form/table modal remains blocked, compact diagnostics identify the blocker, and Qwen neither calls generation nor writes TSX.

- [ ] **Step 6: Push the feature branch for Git-ref installation**

Run:

```bash
git status --short
git push origin feature/qwen-cli-extension
```

Expected: worktree is clean before push and the public feature ref advances to the local branch.

- [ ] **Step 7: Install the public feature ref in isolated Qwen scope**

Remove only the development link created in Step 2, then install the public feature ref:

```bash
qwen extensions uninstall universal-ui-generator
qwen extensions install lancelap/universal-ui-generator \
  --ref=feature/qwen-cli-extension
qwen extensions list
```

Expected: the installed Git copy discovers the manifest and starts `dist/qwen-adapter.mjs` without `pnpm install` and without extension-local `node_modules`.

- [ ] **Step 8: Re-run MCP discovery from the installed copy**

Confirm `/uig:plan` can produce a compact result in an isolated workspace and that the extension installation directory contains the committed bundle and design-system packs. Confirm it does not require the development worktree.

- [ ] **Step 9: Restore the user's pre-validation extension state**

Remove only the feature-ref test installation created in Step 7 if it was not present before Step 1. Do not disable, uninstall, or overwrite any pre-existing extension. Preserve the user's chosen workspace token setting.

No commit is expected for a successful validation-only task. If validation exposes a defect, add a failing automated regression first, implement the smallest fix, rebuild the bundle, rerun Tasks 5–9 checks, and commit the fix with a scope-specific message.

---

### Task 10: Final verification, review, and integration gate

**Files:**

- Review all files changed by Tasks 1–9.
- Do not change `apps/cli/src/readme-commands.test.ts` in this feature.

**Interfaces:**

- Consumes: every feature test, provenance check, pack check, direct acceptance, and the known baseline record.
- Produces: a reviewable, pushed feature branch that is either integration-ready or explicitly stopped on the independent baseline timeout.

- [ ] **Step 1: Rebuild and prove the committed bundle is current**

Run:

```bash
pnpm build:qwen-extension
git diff --exit-code \
  dist/qwen-adapter.mjs \
  dist/qwen-adapter.provenance.json
pnpm verify:qwen-extension-bundle
```

Expected: no bundle diff and verification passes.

- [ ] **Step 2: Run all Qwen-focused checks**

Run:

```bash
pnpm test:qwen-extension
pnpm typecheck
pnpm format:check
pnpm verify:fixtures
pnpm vitest run \
  apps/cli/src/generate-from-run.test.ts \
  apps/cli/src/plan-from-url.test.ts \
  apps/cli/src/offline-acceptance.test.ts \
  apps/cli/src/react-generation-acceptance.test.ts \
  packages/component-catalog/src/design-system-pack-v2.test.ts
```

Expected: every command passes.

- [ ] **Step 3: Run the full repository gate and classify the baseline**

Run:

```bash
pnpm verify
```

Expected acceptable feature evidence:

- all Qwen-focused checks pass;
- if the known baseline remains, the only failure is
  `apps/cli/src/readme-commands.test.ts` timing out at 5000 ms under the parallel full suite;
- no new failure is accepted.

Do not edit or relax that test under this feature scope. If the full suite passes cleanly, record the new clean baseline. If the known timeout remains, stop integration and request the separately approved baseline fix.

- [ ] **Step 4: Audit forbidden content**

Run:

```bash
rg -n \
  '/Users/|C:\\\\Users\\\\|dsl-ui-direct|gigacode-extension|gigacode-mcp|your_access_token|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY' \
  qwen-extension.json QWEN.md commands extensions/qwen-cli dist
```

Expected: no matches.

Run:

```bash
rg -n 'rawDsl|DesignIR|ui-manifest/v2|resolution-plan/v2|evidence' \
  extensions/qwen-cli/src QWEN.md commands/uig
```

Expected: matches occur only in internal validation or explicit prohibition code, never in a result field or command that asks Qwen to retrieve them.

- [ ] **Step 5: Review the exact public surface**

Verify:

```bash
git diff main...HEAD -- qwen-extension.json QWEN.md commands/uig
git diff main...HEAD -- apps/cli/src extensions/qwen-cli/src
git status --short
```

Confirm:

- exactly two MCP tools;
- exactly three slash commands;
- no subagent;
- no target source editing;
- no arbitrary workspace or pack path input;
- no shell-out orchestration;
- no Qwen-specific semantic decision;
- clean worktree.

- [ ] **Step 6: Request code review**

Use `superpowers:requesting-code-review` against the full feature diff. The review must focus on:

- spec coverage;
- bundle self-fork behavior;
- workspace and pack containment;
- token/error leakage;
- blocked status preservation;
- direct CLI/MCP artifact parity;
- manifest correctness for Qwen Code `0.21.0`;
- reproducibility and install-copy behavior.

Address accepted findings with failing regression tests and focused commits, then repeat Steps 1–5.

- [ ] **Step 7: Push final reviewed commits**

```bash
git push origin feature/qwen-cli-extension
```

Expected: public branch matches the reviewed local HEAD.

- [ ] **Step 8: Apply the integration gate**

If `pnpm verify` is green, use `superpowers:finishing-a-development-branch` to present merge options.

If the only failure is the known `readme-commands.test.ts` timeout, report:

```text
Qwen extension checks are green, but integration is stopped by the pre-existing
full-suite timeout in apps/cli/src/readme-commands.test.ts. This feature did not
modify that test. A separate approved baseline fix or a clean rerun is required
before merging to main.
```

Do not merge to `main` while the required repository gate is red.

---

## Plan Self-Review Record

### Spec coverage

- Root Git install, manifest, context, settings, and three commands: Tasks 6, 8, and 9.
- Exactly two structured tools and no combined tool: Tasks 2–4 and 10.
- Shared application services with no shell parsing: Tasks 1 and 3.
- One self-contained bundle with preserved worker isolation: Tasks 1, 4, and 5.
- Compact ordered diagnostics and no raw DSL: Tasks 2–5 and 10.
- Workspace, run, pack, token, and filesystem safety: Tasks 1, 3–5, and 10.
- Direct CLI/MCP parity and installed-copy portability: Tasks 7 and 9.
- Ready `4:314` and blocked `6:12547` behavior: Tasks 7 and 9.
- README and operator lifecycle: Task 8.
- Known baseline timeout remains independently gated: Task 10.

### Type consistency

- The worker entrypoint created in Task 1 is the same structure injected in Task 3 and exercised through self-fork in Task 5.
- Result schemas created in Task 2 are used unchanged by Tasks 3 and 4.
- `files`, `imports`, and `renderOnlyProps` are derived from validated reports and resolution bindings, not parsed TSX.
- Every later task uses `workspaceDir`, `extensionRoot`, `adapterModulePath`, and `token` only through `UigToolDependencies`.

### Scope integrity

- No business logic, API work, target source installation, Qwen subagent, second workflow engine, npm package, marketplace work, or legacy workflow is introduced.
- The single-file bundle constraint is satisfied without removing the existing process-isolation and pinned-run security boundary.
