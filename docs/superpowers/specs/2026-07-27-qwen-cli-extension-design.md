# Portable Qwen Code Extension Design

**Date:** 2026-07-27  
**Status:** approved design, awaiting written-spec review  
**Repository:** `https://github.com/lancelap/universal-ui-generator`  
**Target Qwen Code:** `0.21.0`  
**Extends:**

- `2026-07-26-universal-ui-generator-design.md`
- `2026-07-26-react-generation-design.md`
- `2026-07-26-render-only-component-recipes-design.md`

## 1. Outcome

Package the repository-owned UI generation workflow as a portable Qwen Code
extension that a user can install from the public GitHub repository:

```bash
qwen extensions install lancelap/universal-ui-generator
```

The extension gives Qwen three user-facing commands:

```text
/uig:plan
/uig:generate
/uig:pixso-to-react
```

These commands invoke a small structured adapter over the same planning and
generation functions used by the ordinary `uig` CLI. The extension does not
contain a second semantic planner, resolver, design-system catalog, React
generator, or workflow engine.

The direct CLI and Qwen extension must produce identical run artifacts and
generated file hashes for identical inputs.

## 2. Approved decisions

The user approved the following direction:

1. Qwen is a thin host over the repository-owned workflow.
2. The extension must be installable from the public GitHub repository.
3. The old `/dsl-ui-direct` and external `gigacode-extension` workflow are not
   used.
4. Qwen does not read or reinterpret the raw Pixso DSL.
5. Qwen does not choose Sber components, imports, props, or composition.
6. Qwen does not synthesize or repair TSX outside the generator.
7. The existing ordinary TypeScript CLI remains a first-class interface.
8. Business logic remains outside this slice.

## 3. Verified Qwen Code contract

The design is grounded in the locally installed Qwen Code `0.21.0`
documentation and starter extension:

- an installable extension is a directory containing
  `qwen-extension.json`;
- installing a Git repository expects the manifest at the repository root;
- `QWEN.md` supplies persistent extension context;
- `commands/` supplies Markdown slash commands;
- `agents/` may supply extension subagents;
- `mcpServers` may launch a bundled stdio server;
- `${extensionPath}` resolves to the installed extension copy;
- `${workspacePath}` resolves to the user's current Qwen workspace;
- extension settings may securely supply sensitive environment variables to
  extension MCP servers;
- Git installations track the selected ref, defaulting to the repository's
  default branch;
- installation does not perform the monorepo's `pnpm install` or TypeScript
  build.

The last point requires the extension runtime to be shipped as an executable
JavaScript artifact rather than depending on source TypeScript or
`node_modules` inside the installed copy.

## 4. Rejected approaches

### 4.1 Prompt-only extension that shells into the current workspace

This would work only when Qwen is started inside a separately cloned and
installed `universal-ui-generator` checkout. It would not make
`qwen extensions install` portable and would require the model to parse shell
output and orchestrate run IDs.

### 4.2 Copy the generator into a Qwen-specific runtime

This would create two implementations of planning and generation. Contracts,
diagnostics, pack behavior, and security checks would drift.

### 4.3 Reuse the legacy experimental Qwen branch

The legacy experiment contains absolute paths to:

```text
/Users/danilel/dev/qoder-front-ext/gigacode-extension
/Users/danilel/dev/gigacode-mcp
```

It also dispatches `/dsl-ui-direct`. That benchmark is not portable and is not
the repository-owned workflow approved for this project.

### 4.4 Extension only in `extensions/qwen-cli/`

A subdirectory-only manifest cannot satisfy direct Git-repository installation
from the current repository default branch. It would require a separate
extension repository or a custom GitHub Release archive.

The first version favors one repository and a root manifest. A release-only
extension archive may be added later as a download optimization.

## 5. Repository layout

The extension-facing files live at the repository root or in conventional Qwen
directories:

```text
qwen-extension.json
QWEN.md
commands/
└── uig/
    ├── plan.md
    ├── generate.md
    └── pixso-to-react.md
dist/
└── qwen-adapter.mjs
extensions/
└── qwen-cli/
    ├── src/
    │   ├── server.ts
    │   ├── tools.ts
    │   └── results.ts
    └── tests/
        ├── manifest.test.ts
        ├── stdio.test.ts
        └── install-smoke.test.ts
```

The root manifest enables direct installation. Adapter source remains isolated
under `extensions/qwen-cli`; only the self-contained bundle is placed in
`dist/`.

The first version does not add an extension subagent. The commands plus
persistent context are sufficient, and avoiding a subagent keeps execution in
one Qwen conversation with one structured tool boundary. A subagent may be
introduced later only for a proven context-isolation need.

## 6. Manifest

The root `qwen-extension.json` has this conceptual shape:

```json
{
  "name": "universal-ui-generator",
  "version": "0.1.0",
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "mcpServers": {
    "uig": {
      "command": "node",
      "args": ["${extensionPath}${/}dist${/}qwen-adapter.mjs"],
      "cwd": "${workspacePath}"
    }
  },
  "settings": [
    {
      "name": "Pixso access token",
      "description": "Access token used only by the Pixso Remote MCP client",
      "envVar": "PIXSO_ACCESS_TOKEN",
      "sensitive": true
    }
  ]
}
```

The implementation must validate the exact manifest fields against Qwen Code
`0.21.0`. The manifest contains no user-specific absolute path.

`cwd: "${workspacePath}"` anchors `.uig` artifacts to the user's active project
instead of the installed extension directory.

The adapter entry point is resolved only through `${extensionPath}`. The
separator uses `${/}` so the manifest syntax remains platform-neutral. The
v0.1 runtime is intentionally limited to macOS and Linux because safe artifact
access depends on POSIX `O_NOFOLLOW`; Windows support is not claimed.

## 7. Authority boundary

```text
Qwen command
        ↓
structured MCP tool call
        ↓
Qwen adapter
        ↓
shared planFromUrl / generateFromRun application services
        ↓
DesignIR / UI Manifest / Resolution Plan
        ↓
design-system pack
        ↓
React generator
```

The adapter owns:

- MCP input validation;
- mapping the current workspace to existing application-service arguments;
- compact structured tool results;
- stable error serialization;
- preventing raw DSL from entering model context.

The adapter does not own:

- Pixso URL parsing;
- network retrieval semantics;
- artifact storage;
- normalization;
- semantic recognition;
- component resolution;
- pack loading;
- React modeling;
- source emission;
- atomic output publication.

These remain in the existing packages and application services.

## 8. Shared application services

The ordinary CLI currently wires command parsing directly to exported
functions such as:

```text
planFromUrl
planFromSnapshot
generateFromRun
```

The extension adapter imports and invokes those same functions. If a function
is currently too CLI-shaped, implementation may extract a narrowly scoped
application service used by both adapters. The CLI remains a thin Commander
adapter and the MCP server becomes a thin MCP adapter.

The change must not introduce:

- shelling out from the MCP server to `pnpm`;
- parsing CLI text output;
- spawning a second Qwen process;
- importing from built CLI files through unstable relative paths;
- a Qwen-only plan or generation implementation.

## 9. MCP tool surface

The first version exposes exactly two tools.

### 9.1 `uig_plan`

Input:

```ts
interface UigPlanInput {
  url: string;
  designSystem: string;
}
```

The adapter:

1. uses the MCP process working directory as `workspaceDir`;
2. invokes the shared live planning service;
3. persists all ordinary `.uig` artifacts;
4. returns a compact result.

Result:

```ts
interface UigPlanResult {
  schema: "uig-qwen-plan-result/v1";
  status: "ready" | "blocked";
  runId: string;
  runPath: string;
  source: {
    fileKey: string;
    nodeId: string;
  };
  target: {
    designSystem: string;
    designSystemVersion: string;
    packSha256: string;
  };
  summary: {
    reuse: number;
    compose: number;
    fallback: number;
    blocked: number;
  };
  diagnostics: CompactDiagnostics;
}
```

The result does not include snapshot bytes, DesignIR, the full manifest, the
full resolution plan, or raw Pixso DSL.

### 9.2 `uig_generate`

Input:

```ts
interface UigGenerateInput {
  runId: string;
}
```

The adapter:

1. anchors run lookup to the MCP process working directory;
2. invokes the shared generation service;
3. preserves all authorization, pack-hash, path, and atomic-write checks;
4. returns a compact generated or blocked result.

Result:

```ts
interface UigGenerateResult {
  schema: "uig-qwen-generate-result/v1";
  status: "generated" | "blocked";
  runId: string;
  outputPath: string;
  writeStatus: "written" | "identical";
  files: Array<{
    path: string;
    sha256: string;
  }>;
  imports: Array<{
    package: string;
    exports: string[];
  }>;
  renderOnlyProps: Array<{
    manifestNodeId: string;
    targets: string[];
  }>;
  diagnostics: CompactDiagnostics;
}
```

For a blocked run, `files` contains only the generated report when the
blocked-report contract supports that input. The adapter never converts a
blocked result into generated source.

### 9.3 Why there is no combined MCP tool

`uig_plan` and `uig_generate` correspond directly to the repository's existing
durable boundary. Keeping them separate preserves:

- an inspectable planning checkpoint;
- explicit user review before generation when desired;
- replayable generation without a new Pixso request;
- clean blocked semantics;
- parity with the ordinary CLI.

The `/uig:pixso-to-react` command may call both tools sequentially, but the MCP
server does not hide the two-stage model.

## 10. Compact diagnostics

Tool results include only diagnostics needed for Qwen to report status:

```ts
interface CompactDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  blocking: boolean;
  stage: string;
  manifestNodeId?: string;
  sourceNodeId?: string;
  message: string;
}

interface CompactDiagnostics {
  items: CompactDiagnostic[];
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  artifactPath: string;
}
```

Diagnostics are deterministically ordered using the same canonical ordering as
the underlying plan or generation report.

Large evidence objects remain in `.uig` artifacts. Qwen may report their paths
but must not dump them into the conversation.

The adapter returns at most 50 diagnostics in one tool result. When the full
list is larger, it returns:

- the first 50 entries in canonical order;
- total count;
- returned count;
- `truncated: true`;
- the durable diagnostic artifact path.

Truncation never changes `status`, blocking counts, or the stored artifacts.

## 11. Qwen commands

### 11.1 `/uig:plan`

Usage:

```text
/uig:plan <pixso-url> [design-system]
```

Default design system:

```text
sber-space-ui
```

The command calls only `uig_plan` and reports:

- ready or blocked;
- run ID and run path;
- pack ID, version, and hash;
- resolution summary;
- compact blocking diagnostics.

It does not call generation automatically.

### 11.2 `/uig:generate`

Usage:

```text
/uig:generate <run-id>
```

The command calls only `uig_generate` and reports:

- generated or blocked;
- output path;
- emitted file paths and hashes;
- verified imports;
- render-only props;
- diagnostics.

It does not edit generated files after the tool returns.

### 11.3 `/uig:pixso-to-react`

Usage:

```text
/uig:pixso-to-react <pixso-url> [design-system]
```

The command:

1. calls `uig_plan`;
2. stops and reports when the plan is blocked;
3. passes the returned run ID to `uig_generate` only when ready;
4. reports the generated result without modifying it.

The command never:

- invokes `/dsl-ui-direct`;
- calls Pixso Remote MCP directly;
- asks the model to read raw DSL;
- writes TSX through Qwen file tools;
- invents a component import;
- retries by bypassing a blocker.

## 12. Persistent Qwen context

The root `QWEN.md` is extension context, not a second workflow specification.
It states invariant behavior:

1. use `uig_plan` and `uig_generate` for Pixso-to-React work;
2. treat the tool result as authoritative;
3. never synthesize or repair generated source;
4. keep blocked status explicit;
5. do not request raw DSL unless the user explicitly asks to inspect a durable
   local artifact;
6. do not claim business logic is implemented;
7. report pack ID, version, hash, output paths, file hashes, render-only props,
   and blocking diagnostics;
8. never reveal `PIXSO_ACCESS_TOKEN`.

It does not duplicate semantic roles, Sber component rules, or React emission
rules.

## 13. Token configuration

`PIXSO_ACCESS_TOKEN` is declared as a sensitive Qwen extension setting. Qwen
stores it through its normal extension-settings mechanism and supplies it only
to the adapter process.

Users may configure it at user or workspace scope:

```bash
qwen extensions settings set universal-ui-generator "Pixso access token"
qwen extensions settings set \
  --scope=workspace \
  universal-ui-generator \
  PIXSO_ACCESS_TOKEN
```

Qwen Code `0.21.0` accepts either the display name or the environment variable
as the setting selector. User scope is the default; `--scope=workspace`
overrides it for the current workspace.

The token must never appear in:

- `qwen-extension.json`;
- `QWEN.md`;
- command Markdown;
- tool input or output;
- MCP logs;
- `.uig` metadata;
- error messages;
- generated source;
- test fixtures;
- Git history.

An absent token produces a concise provider configuration error and no partial
run.

## 14. Portable bundle

`dist/qwen-adapter.mjs` is:

- a single self-contained ESM file;
- runnable with Node.js `>=22`;
- independent of extension-local `node_modules`;
- built from `extensions/qwen-cli/src`;
- deterministic for the same source and lockfile;
- committed so Git installations work without a build step.

The bundle may include shared internal package code and required third-party
runtime dependencies. It must not embed:

- access tokens;
- local absolute paths;
- test fixtures;
- `.uig` artifacts;
- source maps containing local paths;
- timestamps or nondeterministic build IDs.

A provenance check records or verifies:

- bundle SHA-256;
- source entry point;
- build command;
- dependency-lock identity through `pnpm-lock.yaml`;
- Node and bundler compatibility;
- absence of known secret patterns and local user paths.

The source TypeScript remains authoritative. Direct edits to the committed
bundle are forbidden.

## 15. Workspace and filesystem safety

The MCP server starts with:

```text
cwd = ${workspacePath}
```

All run artifacts remain under:

```text
${workspacePath}/.uig
```

Tool inputs do not accept an arbitrary workspace directory. This prevents the
model from redirecting generation into unrelated filesystem locations.

Existing protections remain active:

- content-addressed snapshot storage;
- exact Pixso file key and node ID;
- run ID validation;
- run-path containment;
- pack ID/version/hash authorization;
- worker identity checks;
- atomic publication;
- no partial TSX on blockers.

The extension does not modify the target application's source tree. It only
writes ordinary `.uig` run artifacts in this slice.

The filesystem threat model covers a workspace that already contains malicious
symlinks or paths escaping the authorized workspace and extension roots. The
adapter validates each storage directory, pack, selected run, and generated
publication path before using it. Concurrent same-user replacement of those
paths while a command is running is outside the v0.1 threat model. Users must
not run the extension in a workspace whose `.uig` tree is concurrently
controlled by an untrusted process. Closing that remaining TOCTOU class would
require descriptor-relative filesystem operations that Node.js does not expose
for this workflow.

## 16. Error behavior

The adapter serializes expected domain failures into stable MCP error results or
tool results according to one rule:

- valid domain status (`ready`, `blocked`, `generated`) is a successful tool
  response with that status;
- invalid input, provider failure, pack failure, authorization failure, or
  filesystem failure is an MCP tool error with a stable code and concise
  message.

Unexpected errors do not expose stack traces or environment values to the
model. Full local debugging detail may be written only to an explicitly
documented safe log that redacts sensitive values. The first version should
prefer no persistent adapter log over an unproven redaction mechanism.

Qwen commands report the error and stop. They do not retry with weaker
validation.

## 17. Versioning and release channel

The root manifest begins at:

```text
universal-ui-generator@0.1.0
```

Git installation defaults to `main`, which is the stable channel:

```bash
qwen extensions install lancelap/universal-ui-generator
```

Development validation may install the feature branch explicitly:

```bash
qwen extensions install lancelap/universal-ui-generator \
  --ref=feature/qwen-cli-extension
```

Users update with:

```bash
qwen extensions update universal-ui-generator
```

The first release does not create preview/stable branches or publish an npm
package. Git refs and the default `main` branch are sufficient.

## 18. Testing

### 18.1 Manifest tests

Validate:

- required name and version;
- root manifest location;
- `QWEN.md` path;
- commands directory;
- MCP server command, arguments, and cwd;
- use of `${extensionPath}`, `${workspacePath}`, and `${/}`;
- sensitive token setting;
- absence of `trust` and user-specific paths.

### 18.2 Adapter contract tests

Test:

- input schema rejection;
- structured ready and blocked planning results;
- structured generated and blocked generation results;
- compact diagnostic ordering and truncation;
- no raw DSL in output;
- stable error codes;
- no token leakage;
- workspace anchoring;
- preservation of existing pack and path authorization.

### 18.3 CLI/MCP parity

For one stored fixture and one temporary workspace:

1. run the ordinary application service through the CLI adapter;
2. run the same application service through the MCP adapter;
3. compare run schemas, pack proofs, resolution summary, generated paths, and
   file SHA-256 hashes.

The MCP adapter may format a smaller result, but durable `.uig` artifacts and
generated file bytes must match.

### 18.4 Stdio test

Launch:

```bash
node dist/qwen-adapter.mjs
```

Perform MCP initialize, tools/list, and focused tool calls against a temporary
workspace. Confirm:

- only `uig_plan` and `uig_generate` are exposed;
- schemas are visible;
- stdout contains only MCP protocol traffic;
- diagnostics or logs use stderr without secrets;
- shutdown is clean.

### 18.5 Install/link smoke tests

Against the locally installed Qwen Code `0.21.0`:

```bash
qwen extensions link <worktree>
qwen extensions list
```

Confirm the extension name, commands, context, and MCP server are discovered.

Before release, install from the public feature ref in an isolated Qwen
configuration:

```bash
qwen extensions install lancelap/universal-ui-generator \
  --ref=feature/qwen-cli-extension
```

Confirm the installed copy runs without repository-local `node_modules`.

Tests must not overwrite or disable the user's existing Qwen extensions.

### 18.6 Real acceptance

Use the known supported Pixso modal:

```text
WSLukjrKancvZG0zbaMnyA / 4:314
```

Acceptance sequence:

1. run direct CLI plan and generation in a clean temporary workspace;
2. run `/uig:pixso-to-react` through the linked extension;
3. compare pack ID, version, and hash;
4. compare generated file paths and SHA-256 hashes;
5. verify Qwen reports render-only props and diagnostics honestly;
6. verify Qwen does not edit generated files.

The newer `6:12547` modal remains a valid blocked acceptance until its separate
form/table feature and blocked-contract work are implemented.

## 19. Documentation

The repository README gains:

- supported Qwen version;
- install, update, enable, disable, and uninstall commands;
- token configuration;
- command usage;
- generated and blocked examples;
- local development with `qwen extensions link`;
- statement that `.uig` holds durable artifacts;
- statement that the extension does not implement business logic;
- troubleshooting for missing token, missing Node.js, blocked resolution, and
  extension MCP startup failure.

The documentation must not suggest using the legacy experiment branch.

## 20. Known baseline issue

Before this feature branch changed any file, `pnpm verify` on `main` produced:

```text
Test Files  1 failed | 43 passed
Tests       1 failed | 324 passed

apps/cli/src/readme-commands.test.ts
Test timed out in 5000ms
```

The test passes in isolation and exceeds its timeout under the full parallel
suite. The user explicitly chose to continue Qwen extension design on this
known baseline.

The Qwen extension implementation must not silently modify this unrelated test.
Final integration still requires either:

- an independently approved fix for the baseline timeout; or
- a new clean baseline that proves the issue no longer reproduces.

All Qwen-focused tests and checks must pass independently regardless.

## 21. Completion criteria

The Qwen extension slice is complete only when:

1. `qwen-extension.json` is valid and installable from the repository root.
2. No manifest, context, command, source, or bundle contains a user-specific
   absolute path.
3. `qwen extensions link` discovers the extension.
4. Git-ref installation works without extension-local `node_modules`.
5. The adapter exposes exactly `uig_plan` and `uig_generate`.
6. Both tools call shared application services rather than shelling out.
7. Tool results are compact, deterministic, and contain no raw DSL or token.
8. `${workspacePath}/.uig` contains the ordinary durable artifacts.
9. `/uig:plan`, `/uig:generate`, and `/uig:pixso-to-react` behave as specified.
10. Direct CLI and Qwen outputs for `4:314` have identical file SHA-256 hashes.
11. A blocked plan remains blocked and produces no unauthorized source.
12. Both design-system packs remain valid.
13. Focused adapter, bundle, stdio, install, and acceptance tests pass.
14. The repository README documents installation and use.
15. The committed bundle is reproducible and passes provenance/secret checks.
16. The pre-existing full-suite timeout is resolved or explicitly cleared
    before integration to `main`.

## 22. Out of scope

- A second workflow engine.
- A Qwen-specific semantic planner or React generator.
- Direct Pixso Remote MCP calls by the model.
- Raw DSL in model context.
- Target-application source edits.
- Business logic and API binding.
- Automatic repair of blocked generation.
- The legacy `/dsl-ui-direct` workflow.
- External `gigacode-extension` or `gigacode-mcp` runtime dependencies.
- Qwen subagents in the first extension release.
- npm publication.
- GitHub Release archives.
- Marketplace publication.
- Support for Qwen versions older than the verified `0.21.0`.
