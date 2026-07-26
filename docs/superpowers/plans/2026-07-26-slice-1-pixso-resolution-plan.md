# Slice 1: Pixso to ResolutionPlan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic TypeScript CLI that turns a Pixso node URL into inspectable `DesignSnapshot`, `DesignIR`, bounded `DesignSummary`, `UiManifest`, and design-system-specific `ResolutionPlan` artifacts.

**Architecture:** A pnpm monorepo exposes small packages for contracts, source storage, Pixso retrieval, normalization, semantic planning, pack loading, and component resolution. The CLI composes those packages without duplicating their logic; all normal tests use recorded fixtures, and live Pixso access is an opt-in smoke test.

**Tech Stack:** Node.js 22 or newer, pnpm 10, TypeScript 5.x, ESM, `@sinclair/typebox` 0.34 LTS, Vitest, Prettier, `tsx`, Commander, Node `crypto`/`fs`, and the official Model Context Protocol TypeScript client.

## Global Constraints

- Slice 1 ends at `ResolutionPlan`; do not create a production React/TSX generator.
- Do not add an LLM, MCP server, database, vector store, daemon, or browser renderer.
- Raw Pixso DSL must never be embedded in `DesignSnapshot`, `DesignSummary`, `UiManifest`, or `ResolutionPlan`.
- Public artifacts use opaque IDs and relative artifact references; never serialize absolute machine paths.
- Identical normalized input must produce byte-identical stable JSON.
- Component imports come only from a validated design-system pack.
- `fallback` is allowed only when the selected pack policy explicitly permits it.
- A normal `pnpm verify` run must not require network access or `PIXSO_ACCESS_TOKEN`.
- The optional live test reads `PIXSO_ACCESS_TOKEN` but never logs or snapshots it.
- All schemas are closed with `additionalProperties: false` unless a field is explicitly documented as an open provider payload.
- Every task follows test-first development and ends with a focused commit.

---

## File and package map

```text
package.json                         root scripts and development dependencies
pnpm-workspace.yaml                  workspace discovery
tsconfig.base.json                   shared strict TypeScript configuration
vitest.config.ts                     offline test projects and exclusions
.prettierignore                      generated artifacts and recorded DSL
.gitignore                           dependencies, builds, .uig, local env

apps/cli/
├── package.json
└── src/
    ├── main.ts                      process entrypoint and exit behavior
    ├── create-program.ts            Commander command definitions
    ├── format-diagnostic.ts         concise terminal diagnostics
    ├── run-layout.ts                `.uig/runs` artifact paths
    ├── write-run-artifacts.ts       stable artifact writes
    ├── plan-from-snapshot.ts        cached-artifact orchestration
    └── plan-from-url.ts             complete Slice 1 orchestration

packages/contracts/src/
├── schema-utils.ts                  closed-object helper and validation
├── diagnostic.ts                    shared structured diagnostics
├── design-snapshot.ts               source metadata contract
├── design-ir.ts                     normalized visual facts
├── design-summary.ts                bounded overview contract
├── ui-manifest.ts                   semantic UI contract
├── design-system-pack.ts            pack/catalog/policy contracts
├── resolution-plan.ts               resolution output contract
├── generation-run.ts                run index contract
├── stable-json.ts                   canonical key-ordered serialization
└── index.ts                         public package exports

packages/design-context/src/
├── artifact-store.ts                content-addressed raw artifact storage
├── artifact-id.ts                   opaque deterministic IDs
├── query-design-context.ts          bounded typed queries
└── index.ts

packages/provider-pixso/src/
├── parse-pixso-url.ts               file_key and guid extraction
├── pixso-dsl-client.ts              injectable retrieval interface
├── remote-mcp-client.ts             real Streamable HTTP implementation
├── fetch-pixso-snapshot.ts          retrieval, storage, snapshot assembly
└── index.ts

packages/design-normalizer/src/
├── pixso-types.ts                   narrow raw DSL guards
├── normalize-color.ts               RGBA and hex conversion
├── normalize-paint.ts               fills and strokes
├── normalize-effect.ts              shadow conversion
├── normalize-layout.ts              Pixso auto-layout conversion
├── normalize-node.ts                recursive node conversion
├── normalize-design.ts              document-level entrypoint
└── index.ts

packages/semantic-planner/src/
├── evidence.ts                      scores and thresholds
├── exact-component-recognizer.ts    pixso-map-backed roles
├── structural-recognizers.ts        deterministic role recognizers
├── build-ui-manifest.ts             semantic tree assembly
└── index.ts

packages/component-catalog/src/
├── load-pack.ts                     parse and validate pack files
├── validate-compositions.ts         reference and cycle validation
├── catalog-index.ts                 role/component lookup indexes
└── index.ts

packages/component-resolver/src/
├── resolve-node.ts                  one semantic node decision
├── resolve-ui-manifest.ts           recursive plan assembly
├── compare-appearance.ts            token mismatch diagnostics
└── index.ts

design-system-packs/sber-space-ui/    minimal verified Sber Slice 1 pack
design-system-packs/material-ui/      minimal verified MUI Slice 1 pack
fixtures/pixso/                       sanitized DSL and expected artifacts
```

Package public APIs are exported from each package's `src/index.ts`. Internal
files are not imported across package boundaries.

---

### Task 1: Establish the executable monorepo and verification gate

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.prettierignore`
- Create: `apps/cli/package.json`
- Create: `apps/cli/src/main.ts`
- Create: `packages/contracts/package.json`
- Create: `packages/design-context/package.json`
- Create: `packages/provider-pixso/package.json`
- Create: `packages/design-normalizer/package.json`
- Create: `packages/semantic-planner/package.json`
- Create: `packages/component-catalog/package.json`
- Create: `packages/component-resolver/package.json`
- Test: `apps/cli/src/main.test.ts`

**Interfaces:**

- Produces: root commands `pnpm test`, `pnpm typecheck`, `pnpm format:check`, and `pnpm verify`.
- Produces: CLI development entrypoint `pnpm uig -- <args>`.
- Produces: workspace package names `@uig/contracts`, `@uig/design-context`, `@uig/provider-pixso`, `@uig/design-normalizer`, `@uig/semantic-planner`, `@uig/component-catalog`, `@uig/component-resolver`, and `@uig/cli`.

- [ ] **Step 1: Write the failing CLI smoke test**

```ts
// apps/cli/src/main.test.ts
import { describe, expect, it } from "vitest";
import { cliVersion } from "./main.js";

describe("CLI workspace", () => {
  it("exports the root package version", () => {
    expect(cliVersion).toBe("0.1.0");
  });
});
```

- [ ] **Step 2: Create root workspace configuration**

Use this root package shape:

```json
{
  "name": "universal-ui-generator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "uig": "tsx apps/cli/src/main.ts",
    "test": "vitest run",
    "typecheck": "tsc --project tsconfig.base.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "verify": "pnpm format:check && pnpm typecheck && pnpm test"
  }
}
```

`pnpm-workspace.yaml` includes `apps/*` and `packages/*`. Configure TypeScript
with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`,
`module: "ESNext"`, `moduleResolution: "Bundler"`, `target: "ES2022"`,
`resolveJsonModule: true`, and Node/Vitest types. Configure Vitest to include
`apps/**/*.test.ts` and `packages/**/*.test.ts`, and exclude `**/*.live.test.ts`.

- [ ] **Step 3: Create workspace package manifests**

Every library package uses:

```json
{
  "name": "@uig/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Replace the name for each package. `apps/cli/package.json` declares
`"bin": {"uig": "./src/main.ts"}` and workspace dependencies on all packages it
will compose.

- [ ] **Step 4: Install the minimal toolchain**

Run:

```bash
pnpm add -Dw typescript@^5.9 vitest@^3 prettier@^3 tsx@^4 @types/node@^24
pnpm add @sinclair/typebox@^0.34.40 --filter @uig/contracts
pnpm add commander@^14 --filter @uig/cli
pnpm add @modelcontextprotocol/client --filter @uig/provider-pixso
```

Expected: `pnpm-lock.yaml` is created and every command exits successfully.

- [ ] **Step 5: Add the minimal implementation**

```ts
// apps/cli/src/main.ts
export const cliVersion = "0.1.0";
```

- [ ] **Step 6: Run the verification gate**

Run:

```bash
pnpm format
pnpm verify
```

Expected: formatting, type checking, and the smoke test pass.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore .prettierignore apps packages
git commit -m "chore: establish TypeScript workspace"
```

---

### Task 2: Define versioned contracts and stable JSON

**Files:**

- Create: `packages/contracts/src/schema-utils.ts`
- Create: `packages/contracts/src/diagnostic.ts`
- Create: `packages/contracts/src/design-snapshot.ts`
- Create: `packages/contracts/src/design-ir.ts`
- Create: `packages/contracts/src/design-summary.ts`
- Create: `packages/contracts/src/ui-manifest.ts`
- Create: `packages/contracts/src/design-system-pack.ts`
- Create: `packages/contracts/src/resolution-plan.ts`
- Create: `packages/contracts/src/generation-run.ts`
- Create: `packages/contracts/src/stable-json.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/contracts.test.ts`
- Test: `packages/contracts/src/stable-json.test.ts`

**Interfaces:**

- Produces: TypeBox schemas and matching `Static<>` types for every public artifact.
- Produces: `validateWithSchema<T>(schema, value): T`.
- Produces: `stableStringify(value: unknown): string`.
- Produces: `Diagnostic` with stable `severity`, `blocking`, `stage`, and `code`.
- Produces: `PixsoSemanticMapping`, shared by the semantic planner and pack loader
  without creating a package dependency cycle.

- [ ] **Step 1: Write failing schema-closure and canonicalization tests**

```ts
import { describe, expect, it } from "vitest";
import {
  DesignSnapshotSchema,
  stableStringify,
  validateWithSchema,
} from "./index.js";

describe("public contracts", () => {
  it("rejects unknown DesignSnapshot fields", () => {
    expect(() =>
      validateWithSchema(DesignSnapshotSchema, {
        schema: "design-snapshot/v1",
        artifactId: "pixso_file_4-314_a81f9c",
        provider: "pixso",
        source: {
          documentId: "file",
          nodeId: "4:314",
          url: "https://pixso.net/app/design/file?item-id=4:314",
        },
        retrievedAt: "2026-07-26T10:30:00.000Z",
        content: {
          format: "pixso-node-dsl",
          version: "2.1.15",
          sha256: "a".repeat(64),
          byteLength: 10,
        },
        cachePath: "/private/path",
      }),
    ).toThrow(/cachePath/);
  });

  it("serializes object keys canonically", () => {
    expect(stableStringify({ z: 1, a: { d: 2, b: 1 } })).toBe(
      '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "z": 1\n}\n',
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm vitest run packages/contracts/src/contracts.test.ts packages/contracts/src/stable-json.test.ts
```

Expected: FAIL because the schemas and serializer do not exist.

- [ ] **Step 3: Implement closed schema helpers and validation**

Use `Type.Object(properties, { additionalProperties: false })` for every object.
`validateWithSchema` must compile the schema with TypeBox's value compiler and
throw a `ContractValidationError` whose message includes JSON pointer paths for
every validation error.

```ts
export function closedObject<T extends TProperties>(properties: T) {
  return Type.Object(properties, { additionalProperties: false });
}

export function validateWithSchema<S extends TSchema>(
  schema: S,
  value: unknown,
): Static<S> {
  const validator = TypeCompiler.Compile(schema);
  if (validator.Check(value)) return value as Static<S>;
  const details = [...validator.Errors(value)]
    .map((error) => `${error.path || "/"}: ${error.message}`)
    .join("; ");
  throw new ContractValidationError(details);
}
```

- [ ] **Step 4: Implement the exact public contract families**

Use discriminated literal versions:

```ts
export const ArtifactSchemaName = {
  snapshot: "design-snapshot/v1",
  ir: "design-ir/v1",
  summary: "design-summary/v1",
  manifest: "ui-manifest/v1",
  pack: "design-system-pack/v1",
  plan: "resolution-plan/v1",
  run: "generation-run/v1",
} as const;
```

`DesignIR` uses a `nodes: Record<string, DesignNode>` map and a
`rootNodeId`. `DesignNode` contains `id`, `type`, `name`, `visible`, `children`,
`geometry`, optional `layout`, `appearance`, optional `text`, optional
`component`, and `source`. Appearance must include arrays for fills, borders,
and shadows plus per-corner radii.

`UiNode` contains `id`, `kind`, `role`, `sourceNodeIds`, `confidence`,
`evidence`, optional `content`, optional `state`, and `children`.

`PixsoSemanticMapping` contains `componentKey`, optional `variant`, `kind`, and
`role`; it belongs to contracts because both pack loading and semantic planning
consume it.

`ResolutionNode` uses a discriminated `decision` union so `reuse`, `compose`,
`fallback`, and `blocked` cannot carry invalid binding shapes.

- [ ] **Step 5: Implement recursive canonical JSON serialization**

Sort object keys lexicographically at every depth, preserve array order, reject
`undefined`, functions, symbols, non-finite numbers, and circular values, then
write two-space JSON plus one trailing newline.

- [ ] **Step 6: Add positive and negative fixtures for every schema**

Each schema test must prove:

- a minimal valid artifact is accepted;
- its version literal is required;
- one unknown property is rejected;
- one missing required property is rejected;
- diagnostics preserve `blocking: true`;
- a `blocked` resolution cannot contain an import binding.

- [ ] **Step 7: Run and commit**

Run:

```bash
pnpm vitest run packages/contracts/src
pnpm verify
git add packages/contracts
git commit -m "feat: define generator artifact contracts"
```

Expected: all contract and repository checks pass.

---

### Task 3: Add content-addressed design storage and bounded queries

**Files:**

- Create: `packages/design-context/src/artifact-id.ts`
- Create: `packages/design-context/src/artifact-store.ts`
- Create: `packages/design-context/src/query-design-context.ts`
- Create: `packages/design-context/src/index.ts`
- Test: `packages/design-context/src/artifact-store.test.ts`
- Test: `packages/design-context/src/query-design-context.test.ts`

**Interfaces:**

- Consumes: `DesignIR`, `DesignSummary`, and `stableStringify` from `@uig/contracts`.
- Produces:

```ts
export interface StoredArtifact {
  artifactId: string;
  sha256: string;
  byteLength: number;
}

export interface ArtifactStore {
  put(input: {
    provider: "pixso";
    documentId: string;
    nodeId: string;
    bytes: Uint8Array;
  }): Promise<StoredArtifact>;
  read(artifactId: string): Promise<Uint8Array>;
}

export function createArtifactStore(rootDir: string): ArtifactStore;

export type DesignQuery =
  | { selector: "node"; nodeId: string }
  | { selector: "texts"; rootNodeId?: string; limit: number; cursor?: string }
  | { selector: "components"; rootNodeId?: string; limit: number; cursor?: string }
  | { selector: "styles"; nodeIds: string[] }
  | { selector: "visible-tree"; rootNodeId: string; depth: number; limit: number; cursor?: string };

export function queryDesignContext(
  ir: DesignIR,
  query: DesignQuery,
): DesignQueryResult;
```

- [ ] **Step 1: Write failing deduplication and path-safety tests**

Use `fs.mkdtemp(join(tmpdir(), "uig-store-"))`. Put identical bytes twice and
assert the same `artifactId`; assert only one hash file exists. Assert the
returned object and persisted metadata contain no temporary absolute path.

Also call `read("../../etc/passwd")` and assert a typed
`ARTIFACT_ID_INVALID` diagnostic is thrown before filesystem access.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm vitest run packages/design-context/src/artifact-store.test.ts
```

Expected: FAIL because `createArtifactStore` does not exist.

- [ ] **Step 3: Implement IDs and atomic storage**

Compute SHA-256 from exact input bytes. Build IDs as:

```ts
`pixso_${sanitize(documentId)}_${sanitize(nodeId)}_${sha256.slice(0, 12)}`
```

Write bytes to `<rootDir>/cache/sha256/<full-hash>` using a temporary sibling
file and atomic rename. Write metadata to
`<rootDir>/artifacts/<artifactId>.json`. Validate IDs with:

```ts
/^pixso_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+_[a-f0-9]{12}$/
```

Do not derive a read path from unvalidated user input.

- [ ] **Step 4: Write failing bounded query tests**

Create a five-node `DesignIR` and assert:

- `node` returns exactly one node;
- `texts` returns stable document order;
- `limit: 2` returns two items and a cursor;
- the cursor resumes at the third item;
- `limit: 0` and `limit: 501` fail;
- `styles` returns only requested IDs;
- `visible-tree` excludes hidden descendants.

- [ ] **Step 5: Implement one typed query dispatcher**

Use one `queryDesignContext` function with a discriminated selector. Cursor
payload is base64url-encoded canonical JSON:

```ts
interface QueryCursor {
  selector: DesignQuery["selector"];
  offset: number;
  fingerprint: string;
}
```

The fingerprint is the SHA-256 of `schema`, `rootNodeId`, selector, and query
filters. Reject a cursor used with different filters.

- [ ] **Step 6: Run and commit**

Run:

```bash
pnpm vitest run packages/design-context/src
pnpm verify
git add packages/design-context
git commit -m "feat: add deterministic design artifact storage"
```

---

### Task 4: Implement Pixso URL parsing and Remote MCP retrieval

**Files:**

- Create: `packages/provider-pixso/src/parse-pixso-url.ts`
- Create: `packages/provider-pixso/src/pixso-dsl-client.ts`
- Create: `packages/provider-pixso/src/remote-mcp-client.ts`
- Create: `packages/provider-pixso/src/fetch-pixso-snapshot.ts`
- Create: `packages/provider-pixso/src/index.ts`
- Test: `packages/provider-pixso/src/parse-pixso-url.test.ts`
- Test: `packages/provider-pixso/src/fetch-pixso-snapshot.test.ts`
- Test: `packages/provider-pixso/src/remote-mcp-client.live.test.ts`

**Interfaces:**

```ts
export interface PixsoNodeRef {
  fileKey: string;
  guid: string;
  canonicalUrl: string;
}

export function parsePixsoUrl(input: string): PixsoNodeRef;

export interface PixsoDslClient {
  getNodeDsl(input: { fileKey: string; guid: string }): Promise<Uint8Array>;
}

export function createRemotePixsoDslClient(input: {
  endpoint: URL;
  token: string;
}): PixsoDslClient;

export async function fetchPixsoSnapshot(input: {
  url: string;
  client: PixsoDslClient;
  store: ArtifactStore;
  now: () => Date;
}): Promise<DesignSnapshot>;
```

- [ ] **Step 1: Write URL parser tests**

Cover:

```ts
expect(
  parsePixsoUrl(
    "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314&page-id=1:2",
  ),
).toEqual({
  fileKey: "WSLukjrKancvZG0zbaMnyA",
  guid: "4:314",
  canonicalUrl:
    "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4%3A314",
});
```

Reject non-HTTPS URLs, other hosts, missing `/app/design/<file_key>`, missing
`item-id`, an `item-id` containing path separators, and URLs containing only
`page-id`. Error code: `PIXSO_URL_INVALID`.

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
pnpm vitest run packages/provider-pixso/src/parse-pixso-url.test.ts
```

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement the parser**

Use the built-in `URL` class. Construct the canonical URL from the validated
host, file key, and `item-id`; discard unrelated query parameters.

- [ ] **Step 4: Write retrieval tests with a fake client**

The fake client records its argument and returns:

```ts
new TextEncoder().encode(
  JSON.stringify({
    dsl: {
      converterVersion: "2.2.13",
      dslVersion: "2.1.15",
      pixTreeDslNodes: [],
      pixComponentTreeDslNodes: [],
      localStyleMap: {},
      variableMap: {},
      variableSetMap: {},
      sourceMapByUrl: {},
      specialNode: [],
      isContainFixed: false,
    },
  }),
);
```

Assert the tool argument is exactly:

```json
{
  "file_key": "WSLukjrKancvZG0zbaMnyA",
  "guid": "4:314"
}
```

Assert the snapshot timestamp comes from the injected clock, its byte length
and SHA-256 match the stored bytes, and no token or path appears in it.

- [ ] **Step 5: Implement the official MCP client adapter**

Use `Client` and `StreamableHTTPClientTransport`. Supply a custom fetch wrapper
that copies request headers and sets `Token` from the constructor argument.
Call the tool:

```ts
await client.callTool({
  name: "get_node_dsl",
  arguments: {
    file_key: input.fileKey,
    guid: input.guid,
  },
});
```

Accept a direct structured object or concatenate MCP text content blocks. The
result must parse as one JSON object with a `dsl` property. Return its canonical
UTF-8 JSON bytes. Map missing token, 401/403, missing node, transport failure,
and invalid content to the diagnostic codes defined in the spec. Always close
the client in `finally`.

- [ ] **Step 6: Add the opt-in live smoke test**

The test exits early unless `PIXSO_LIVE_TEST=1`. When enabled, require
`PIXSO_ACCESS_TOKEN`, request file `WSLukjrKancvZG0zbaMnyA`, node `4:314`, and
assert the returned bytes parse to an object whose `dsl.dslVersion` is a
non-empty string. Never print response content or environment values.

- [ ] **Step 7: Run offline tests and commit**

Run:

```bash
pnpm vitest run packages/provider-pixso/src --exclude '**/*.live.test.ts'
pnpm verify
git add packages/provider-pixso
git commit -m "feat: retrieve Pixso node DSL"
```

---

### Task 5: Normalize Pixso DSL into deterministic visual facts

**Files:**

- Create: `packages/design-normalizer/src/pixso-types.ts`
- Create: `packages/design-normalizer/src/normalize-color.ts`
- Create: `packages/design-normalizer/src/normalize-paint.ts`
- Create: `packages/design-normalizer/src/normalize-effect.ts`
- Create: `packages/design-normalizer/src/normalize-layout.ts`
- Create: `packages/design-normalizer/src/normalize-node.ts`
- Create: `packages/design-normalizer/src/normalize-design.ts`
- Create: `packages/design-normalizer/src/index.ts`
- Test: `packages/design-normalizer/src/normalize-color.test.ts`
- Test: `packages/design-normalizer/src/normalize-design.test.ts`
- Fixture: `packages/design-normalizer/src/__fixtures__/minimal-pixso-dsl.json`
- Fixture: `packages/design-normalizer/src/__fixtures__/minimal-design-ir.json`

**Interfaces:**

```ts
export function normalizePixsoDesign(input: {
  artifactId: string;
  rawDsl: unknown;
}): DesignIR;
```

- [ ] **Step 1: Create a minimal raw fixture and failing golden test**

The raw fixture contains:

- one `FRAME` root with `guid`, geometry, vertical `autoLayout`, fill, stroke,
  radius, and drop shadow;
- one `TEXT` child with `componentId`, `pathString`, and `nodeText`;
- one `INSTANCE` child with `componentKey`, `componentNormName`, and `props`;
- one hidden child.

The test calls `normalizePixsoDesign`, serializes with `stableStringify`, and
compares to `minimal-design-ir.json`.

- [ ] **Step 2: Run and verify the golden test fails**

Run:

```bash
pnpm vitest run packages/design-normalizer/src/normalize-design.test.ts
```

Expected: FAIL because the normalizer does not exist.

- [ ] **Step 3: Implement strict document guards**

Accept one object with:

```ts
interface PixsoDslEnvelope {
  dsl: {
    dslVersion: string;
    converterVersion: string;
    pixTreeDslNodes: unknown[];
    pixComponentTreeDslNodes: unknown[];
    localStyleMap: Record<string, unknown>;
    variableMap: Record<string, unknown>;
    variableSetMap: Record<string, unknown>;
  };
}
```

Require exactly one root in `pixTreeDslNodes` for this slice. Reject invalid
envelopes with `DESIGN_DSL_UNSUPPORTED` and missing referenced children with
`DESIGN_NODE_REFERENCE_MISSING`.

- [ ] **Step 4: Implement exact primitive mappings**

Map:

```text
guid or componentId/pathString → node id
type                           → lowercase normalized type
left/top/width/height          → geometry
childNode                      → ordered children
nodeText                       → text.value
componentKey                   → component.key
componentNormName              → component.variant
```

Map `autoLayout.stackMode` to `vertical` or `horizontal`; map the four
`autoLayoutPadding*` fields and `autoLayoutCounterItemSpacing`.

Convert `{r,g,b,a}` where RGB is 0–255 and alpha is 0–1 into uppercase
`#RRGGBB` plus a separate opacity. Convert `strokeWeight`, `strokeAlign`, and
visible `strokePaints` into borders. Convert `cornerRadius` into four equal
corners. Convert visible `DROP_SHADOW` effects into `x`, `y`, `blur`, `spread`,
color, and opacity.

- [ ] **Step 5: Enforce deterministic traversal**

Traverse `childNode` order exactly as provided. Store nodes in traversal order
before canonical object serialization. Do not include timestamps, random IDs,
absolute paths, or derived semantic roles.

- [ ] **Step 6: Add negative tests**

Assert:

- non-object input is rejected;
- missing `dslVersion` is rejected;
- duplicate normalized node IDs are rejected;
- non-finite geometry is rejected;
- an unsupported paint is preserved as a non-blocking diagnostic rather than
  fabricated as solid;
- the hidden child remains present with `visible: false`.

- [ ] **Step 7: Run and commit**

Run:

```bash
pnpm vitest run packages/design-normalizer/src
pnpm verify
git add packages/design-normalizer
git commit -m "feat: normalize Pixso visual facts"
```

---

### Task 6: Build a bounded summary and inspectable design queries

**Files:**

- Create: `packages/design-context/src/build-design-summary.ts`
- Modify: `packages/design-context/src/index.ts`
- Test: `packages/design-context/src/build-design-summary.test.ts`

**Interfaces:**

```ts
export function buildDesignSummary(input: {
  ir: DesignIR;
  maxBytes?: number;
  maxDepth?: number;
}): DesignSummary;
```

Defaults: `maxBytes = 20_000`, `maxDepth = 4`.

- [ ] **Step 1: Write failing size-bound and determinism tests**

Generate a `DesignIR` with 1,000 text nodes. Assert:

```ts
const first = buildDesignSummary({ ir });
const second = buildDesignSummary({ ir });
expect(Buffer.byteLength(stableStringify(first))).toBeLessThanOrEqual(20_000);
expect(stableStringify(first)).toBe(stableStringify(second));
expect(first.truncated).toBe(true);
expect(first.queryCursor).toMatch(/^[A-Za-z0-9_-]+$/);
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
pnpm vitest run packages/design-context/src/build-design-summary.test.ts
```

- [ ] **Step 3: Implement deterministic bounded construction**

Always include root metadata and statistics. Add outline entries in document
order until the next entry would exceed `maxBytes`. When truncated, include a
cursor accepted by `queryDesignContext` for the remaining `visible-tree`.

Notable nodes include component instances and text nodes with non-empty text,
subject to the same byte budget. Never shorten strings by invalid byte slicing;
omit the next whole entry instead.

- [ ] **Step 4: Add boundary tests**

Test exact-limit output, a one-node design, a hidden-only subtree, `maxDepth: 0`,
and `maxBytes` smaller than the mandatory header. The last case throws
`DESIGN_SUMMARY_LIMIT_TOO_SMALL`.

- [ ] **Step 5: Run and commit**

```bash
pnpm vitest run packages/design-context/src
pnpm verify
git add packages/design-context
git commit -m "feat: add bounded design summaries"
```

---

### Task 7: Produce a semantic UiManifest without a model

**Files:**

- Create: `packages/semantic-planner/src/evidence.ts`
- Create: `packages/semantic-planner/src/exact-component-recognizer.ts`
- Create: `packages/semantic-planner/src/structural-recognizers.ts`
- Create: `packages/semantic-planner/src/build-ui-manifest.ts`
- Create: `packages/semantic-planner/src/index.ts`
- Test: `packages/semantic-planner/src/exact-component-recognizer.test.ts`
- Test: `packages/semantic-planner/src/structural-recognizers.test.ts`
- Test: `packages/semantic-planner/src/build-ui-manifest.test.ts`

**Interfaces:**

```ts
export function buildUiManifest(input: {
  ir: DesignIR;
  exactMappings: PixsoSemanticMapping[];
}): UiManifest;
```

- [ ] **Step 1: Write exact mapping tests**

Given an instance with component key `button-key` and variant `Primary`, assert
an exact mapping creates `kind: "action"`, `role: "primaryAction"`,
`confidence: 1`, and evidence containing the component key and source node ID.

Assert a mapping with the right key but wrong explicit variant does not match.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/semantic-planner/src/exact-component-recognizer.test.ts
```

- [ ] **Step 3: Implement exact recognition**

Index mappings by component key. Prefer an exact key+variant entry over a
key-only entry. Reject duplicate entries with the same key and variant as
`SEMANTIC_MAPPING_CONFLICT`.

- [ ] **Step 4: Write structural recognizer tests**

Create small normalized fixtures for:

- dialog: top-level framed container, heading near start, body, actions near end;
- heading: non-empty text with heading typography or name evidence;
- text input: field-shaped frame plus label/value text;
- combobox: field-shaped frame plus dropdown indicator or matching layer name;
- warning: highlighted container plus warning text/icon evidence;
- action group: horizontal group containing two action-shaped children;
- vertical and horizontal groups.

Assert scores and evidence. Add one ambiguous decorative frame scoring below
`0.60` and assert a blocking `SEMANTIC_CONFIDENCE_TOO_LOW` diagnostic.

- [ ] **Step 5: Implement weighted deterministic recognizers**

Use only `DesignIR` facts. Calculate scores as the sum of matched declared
weights, round to four decimals, and apply:

```ts
export const confidencePolicy = {
  automatic: 0.85,
  warning: 0.6,
} as const;
```

Scores below `0.6` do not become guessed semantic controls. Preserve them as
unresolved nodes with a blocking diagnostic and source evidence.

- [ ] **Step 6: Assemble a deterministic semantic tree**

Generate manifest IDs from role and source node ID, for example
`ui_primaryAction_4-341`; resolve collisions by stable traversal index. Carry
all contributing `sourceNodeIds`. Do not include imports, npm packages, React
props, or design-system component IDs.

- [ ] **Step 7: Run and commit**

```bash
pnpm vitest run packages/semantic-planner/src
pnpm verify
git add packages/semantic-planner
git commit -m "feat: build deterministic UI manifests"
```

---

### Task 8: Validate and load minimal Sber Space UI and Material UI packs

**Files:**

- Create: `packages/component-catalog/src/load-pack.ts`
- Create: `packages/component-catalog/src/validate-compositions.ts`
- Create: `packages/component-catalog/src/catalog-index.ts`
- Create: `packages/component-catalog/src/index.ts`
- Test: `packages/component-catalog/src/load-pack.test.ts`
- Test: `packages/component-catalog/src/validate-compositions.test.ts`
- Create: `design-system-packs/sber-space-ui/pack.json`
- Create: `design-system-packs/sber-space-ui/catalog.json`
- Create: `design-system-packs/sber-space-ui/semantic-policy.json`
- Create: `design-system-packs/sber-space-ui/pixso-map.json`
- Create: `design-system-packs/sber-space-ui/composition-rules.json`
- Create: `design-system-packs/sber-space-ui/tokens.json`
- Create: `design-system-packs/sber-space-ui/verification.json`
- Create: `design-system-packs/material-ui/pack.json`
- Create: `design-system-packs/material-ui/catalog.json`
- Create: `design-system-packs/material-ui/semantic-policy.json`
- Create: `design-system-packs/material-ui/pixso-map.json`
- Create: `design-system-packs/material-ui/composition-rules.json`
- Create: `design-system-packs/material-ui/tokens.json`
- Create: `design-system-packs/material-ui/verification.json`

**Interfaces:**

```ts
export interface LoadedDesignSystemPack {
  manifest: DesignSystemPack;
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  candidatesByRole: ReadonlyMap<string, readonly ComponentCatalogEntry[]>;
  semanticPolicy: SemanticPolicy;
  exactPixsoMappings: readonly PixsoSemanticMapping[];
}

export async function loadDesignSystemPack(
  packDirectory: string,
): Promise<LoadedDesignSystemPack>;
```

- [ ] **Step 1: Write failing pack validation tests**

Tests must reject:

- a path escaping the pack directory;
- duplicate component IDs;
- an unknown component referenced by semantic policy;
- a missing required companion;
- a composition cycle;
- an unverified import used as a `reuse` candidate;
- two equal-priority candidates for the same role.

Assert error codes from the design spec.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/component-catalog/src
```

- [ ] **Step 3: Implement safe pack loading**

Resolve every manifest path against the real pack directory and reject any
result outside it. Parse every file with the contracts package. Build immutable
indexes only after all cross-references and cycles pass.

- [ ] **Step 4: Create the minimal Sber pack from verified existing entries**

The Slice 1 catalog includes:

```text
base.Button       @sber-space-ui/button       Button
base.Field        @sber-space-ui/field        Field
base.FormControl  @sber-space-ui/form-control FormControl
base.FormLabel    @sber-space-ui/form-control FormLabel
base.Modal        @sber-space-ui/modal        Modal
base.ModalHeader  @sber-space-ui/modal        ModalHeader
base.ModalBody    @sber-space-ui/modal        ModalBody
base.ModalFooter  @sber-space-ui/modal        ModalFooter
base.Stack        @sber-space-ui/atom         Stack
base.Typography   @sber-space-ui/atom         Typography
```

Use provenance from
`/Users/danilel/dev/gigacode-mcp/resources/sber-space-ui/catalog.json`, but copy
only the entries required by Slice 1. Do not claim target-project installation
proof. Sber `primaryAction` and `secondaryAction` allow `reuse`, `compose`, or
`blocked`, never native fallback.

- [ ] **Step 5: Create the minimal Material UI pack**

Use verified public Material UI exports:

```text
mui.Button         @mui/material Button
mui.TextField      @mui/material TextField
mui.Dialog         @mui/material Dialog
mui.DialogTitle    @mui/material DialogTitle
mui.DialogContent  @mui/material DialogContent
mui.DialogActions  @mui/material DialogActions
mui.Alert          @mui/material Alert
mui.Stack          @mui/material Stack
mui.Typography     @mui/material Typography
```

The dialog role resolves through the declared Dialog composition. Decorative
containers may use explicit local fallback; actions may not.

- [ ] **Step 6: Add successful load and lookup tests**

Load each real pack and assert:

- pack IDs differ;
- `primaryAction` resolves to different catalog IDs;
- both candidates are verified;
- Sber dialog and MUI dialog have different composition closures;
- exact Pixso mappings contain no guessed entries with only a layer name.

- [ ] **Step 7: Run and commit**

```bash
pnpm vitest run packages/component-catalog/src
pnpm verify
git add packages/component-catalog design-system-packs
git commit -m "feat: add validated design system packs"
```

---

### Task 9: Resolve one UiManifest through either design system

**Files:**

- Create: `packages/component-resolver/src/resolve-node.ts`
- Create: `packages/component-resolver/src/resolve-ui-manifest.ts`
- Create: `packages/component-resolver/src/compare-appearance.ts`
- Create: `packages/component-resolver/src/index.ts`
- Test: `packages/component-resolver/src/resolve-node.test.ts`
- Test: `packages/component-resolver/src/resolve-ui-manifest.test.ts`
- Test: `packages/component-resolver/src/compare-appearance.test.ts`
- Fixture: `packages/component-resolver/src/__fixtures__/dialog.ui-manifest.json`

**Interfaces:**

```ts
export function resolveUiManifest(input: {
  manifest: UiManifest;
  designIr: DesignIR;
  pack: LoadedDesignSystemPack;
}): ResolutionPlan;
```

- [ ] **Step 1: Write decision-table tests**

Cover all four decisions:

```text
verified exact candidate                    → reuse
verified multi-component composition        → compose
no candidate + pack explicitly permits it   → fallback
no candidate + fallback forbidden           → blocked
```

Assert a blocked result has no import binding and includes one blocking
diagnostic. Assert an unverified catalog entry can never produce `reuse`.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run packages/component-resolver/src/resolve-node.test.ts
```

- [ ] **Step 3: Implement deterministic candidate selection**

Filter candidates by semantic role, required capabilities, and permitted form
adapter. Sort by descending declared priority then component ID. Equal highest
priority is a pack validation error, not a runtime guess.

Expand required composition recursively and rely on the already validated
acyclic pack graph.

- [ ] **Step 4: Write dual-pack integration tests**

Resolve one dialog manifest containing heading, text input, and primary and
secondary actions through both packs. Assert:

- the semantic manifest input is byte-identical before and after both calls;
- Sber uses `@sber-space-ui/*` imports;
- Material UI uses only `@mui/material`;
- dialog composition differs;
- both plans cover the same manifest node IDs;
- summary counts equal the actual decision counts.

- [ ] **Step 5: Add visual mismatch comparison**

Compare source appearance values referenced by manifest node IDs with optional
pack tokens. Produce non-blocking `VISUAL_TOKEN_MISMATCH` entries containing
property, design value, token name, and token value. Do not mutate the design
facts and do not synthesize CSS.

- [ ] **Step 6: Run and commit**

```bash
pnpm vitest run packages/component-resolver/src
pnpm verify
git add packages/component-resolver
git commit -m "feat: resolve UI manifests through design systems"
```

---

### Task 10: Compose the pipeline and CLI run artifacts

**Files:**

- Create: `apps/cli/src/run-layout.ts`
- Create: `apps/cli/src/write-run-artifacts.ts`
- Create: `apps/cli/src/plan-from-snapshot.ts`
- Create: `apps/cli/src/plan-from-url.ts`
- Test: `apps/cli/src/plan-from-url.test.ts`
- Create: `apps/cli/src/create-program.ts`
- Create: `apps/cli/src/format-diagnostic.ts`
- Modify: `apps/cli/src/main.ts`
- Test: `apps/cli/src/create-program.test.ts`

**Interfaces:**

```ts
export async function planFromUrl(input: {
  url: string;
  designSystemPackPath: string;
  workspaceDir: string;
  pixsoClient: PixsoDslClient;
  now: () => Date;
}): Promise<GenerationRun>;

export async function planFromSnapshot(input: {
  artifactId: string;
  designSystemPackPath: string;
  workspaceDir: string;
  now: () => Date;
}): Promise<GenerationRun>;

export function createProgram(dependencies: {
  cwd: () => string;
  now: () => Date;
  createPixsoClient: () => PixsoDslClient;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}): Command;
```

- [ ] **Step 1: Write a failing orchestration test**

Use an in-memory fake Pixso client and a temporary workspace. Run `planFromUrl`
and assert these files exist:

```text
.uig/runs/<run-id>/run.json
.uig/runs/<run-id>/snapshot.json
.uig/runs/<run-id>/design-ir.json
.uig/runs/<run-id>/design-summary.json
.uig/runs/<run-id>/ui-manifest.json
.uig/runs/<run-id>/resolution-plan.sber-space-ui.json
.uig/runs/<run-id>/diagnostics.json
```

Parse every file with its schema. Search their serialized content and assert it
does not contain the temporary absolute path or token sentinel.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run apps/cli/src/plan-from-url.test.ts
```

- [ ] **Step 3: Implement run layout and stable writes**

Run IDs use the injected UTC clock and sanitized node ID:

```ts
run_20260726T103000000Z_4-314
```

Write every JSON through `stableStringify` and atomic rename. `run.json` uses
relative file names. If a blocking diagnostic occurs, write all completed
earlier artifacts plus diagnostics and mark the stage and run `blocked`.

- [ ] **Step 4: Implement `planFromUrl`**

The exact sequence is:

```text
parse URL
→ fetch and store DSL
→ read raw artifact
→ parse and normalize
→ build bounded summary
→ load selected pack
→ build UiManifest using its exact Pixso mappings
→ resolve manifest
→ write run artifacts
```

`planFromUrl` performs retrieval, then delegates all post-fetch work to
`planFromSnapshot`. `planFromSnapshot` reads the stored bytes and metadata,
normalizes, summarizes, loads the pack, builds the manifest, resolves it, and
writes the run. There must be only one implementation of the post-fetch stages.

No stage reaches into another package's internal files.

- [ ] **Step 5: Write CLI behavior tests**

Invoke Commander with injected dependencies and assert:

- `uig fetch <url>` stores the source and prints its `artifactId`;
- `uig normalize <artifact-id>` writes a schema-valid `design-ir.json` without
  contacting Pixso;
- `uig plan --url ... --design-system sber-space-ui` returns exit code 0 and
  prints the relative run directory;
- `uig plan --snapshot <artifact-id> --design-system material-ui` produces a
  plan without contacting Pixso;
- providing both `--url` and `--snapshot`, or neither, is a usage error;
- missing `PIXSO_ACCESS_TOKEN` reports `PIXSO_TOKEN_MISSING`;
- `uig inspect --artifact ... --node ... --include geometry,appearance` prints
  bounded JSON;
- `uig pack validate <path>` exits 0 for both packs;
- a blocked plan exits 2 rather than claiming success;
- secrets and absolute cache paths never appear in output.

- [ ] **Step 6: Implement the CLI**

`main.ts` reads `PIXSO_ACCESS_TOKEN` only when a command needs live Pixso. It
constructs the Remote MCP endpoint
`https://pixso.net/api/mcp/mcp`. Catch structured diagnostics, format a concise
message, and set `process.exitCode` without calling `process.exit`.

- [ ] **Step 7: Run and commit**

```bash
pnpm vitest run apps/cli/src
pnpm verify
git add apps/cli
git commit -m "feat: add Pixso planning CLI"
```

---

### Task 11: Add real Pixso fixtures and the offline acceptance suite

**Files:**

- Create: `fixtures/pixso/README.md`
- Create: `fixtures/pixso/modal-4-314/source.json`
- Create: `fixtures/pixso/modal-4-314/expected.design-ir.json`
- Create: `fixtures/pixso/modal-4-314/expected.design-summary.json`
- Create: `fixtures/pixso/modal-4-314/expected.ui-manifest.json`
- Create: `fixtures/pixso/modal-4-314/expected.sber-space-ui.resolution-plan.json`
- Create: `fixtures/pixso/modal-4-314/expected.material-ui.resolution-plan.json`
- Create: `fixtures/pixso/modal-table-6-12547/source.json`
- Create: `fixtures/pixso/sectional-form-70-118892/source.json`
- Create: `apps/cli/src/offline-acceptance.test.ts`
- Create: `scripts/verify-fixture-provenance.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: all Slice 1 public package APIs.
- Produces: immutable, sanitized offline fixtures with source document/node
  metadata and SHA-256 checksums.
- Produces: `pnpm test:acceptance` included in `pnpm verify`.

- [ ] **Step 1: Verify and sanitize the existing `4:314` source**

The existing file is:

```text
/Users/danilel/Documents/Codex/2026-07-25/sites-plugin-sites-openai-bundled-create-4/outputs/pixso-node-4-314.dsl.json
```

It currently begins with the extra byte `1` before the JSON object. Preserve
that fact in fixture provenance. Create `source.json` from bytes beginning at
the first `{`, then parse it and assert:

```text
dsl.dslVersion = 2.1.15
dsl.converterVersion = 2.2.13
dsl.pixTreeDslNodes[0].guid = 4:314
```

The fixture import script must reject any other non-whitespace prefix instead
of silently scanning arbitrary malformed content.

- [ ] **Step 2: Write the failing `4:314` acceptance test**

Run the sanitized source through normalize, summarize, plan, and both resolvers.
Compare all six expected files with stable serialized output. Assert the summary
is at most 20,000 bytes and no output contains `@sber-space-ui` when resolving
Material UI or `@mui/material` when resolving Sber.

- [ ] **Step 3: Run and verify the acceptance test fails**

```bash
pnpm vitest run apps/cli/src/offline-acceptance.test.ts
```

Expected: FAIL because expected golden artifacts have not been accepted.

- [ ] **Step 4: Review and accept the `4:314` golden artifacts**

Generate candidates into a temporary directory, inspect node count, root
geometry, texts, semantic roles, decisions, diagnostics, and both import sets.
Copy the reviewed stable artifacts into the fixture directory. Do not update
goldens automatically during normal test runs.

- [ ] **Step 5: Retrieve and add the two remaining sources**

Using the opt-in live fixture command and `PIXSO_ACCESS_TOKEN`, retrieve:

```text
WSLukjrKancvZG0zbaMnyA / 6:12547
PqSywlhYgqSRDoWr78IrdA / 70:118892
```

Save only sanitized DSL JSON and provenance hashes. Never save the token or MCP
session headers. Add structural assertions:

- `6:12547` contains a dialog/form/table-shaped hierarchy;
- `70:118892` contains multiple visible sections and action choices.

These two fixtures expand normalization coverage but do not expand the Slice 1
semantic vocabulary.

- [ ] **Step 6: Add fixture provenance verification**

`verify-fixture-provenance.mjs` reads `fixtures/pixso/README.md` metadata and
asserts each file's current SHA-256. Add:

```json
{
  "scripts": {
    "test:acceptance": "vitest run apps/cli/src/offline-acceptance.test.ts",
    "verify:fixtures": "node scripts/verify-fixture-provenance.mjs",
    "verify": "pnpm format:check && pnpm typecheck && pnpm verify:fixtures && pnpm test"
  }
}
```

- [ ] **Step 7: Run complete verification twice**

Run:

```bash
pnpm verify
pnpm verify
git status --short
```

Expected: both runs pass, produce no tracked changes, and do not access the
network.

- [ ] **Step 8: Commit**

```bash
git add fixtures apps/cli/src/offline-acceptance.test.ts scripts package.json pnpm-lock.yaml
git commit -m "test: add offline Pixso acceptance fixtures"
```

---

### Task 12: Document the operator workflow and prove Slice 1 completion

**Files:**

- Create: `README.md`
- Create: `docs/contracts.md`
- Create: `docs/design-system-packs.md`
- Create: `docs/diagnostics.md`
- Create: `docs/fixture-policy.md`
- Modify: `package.json`

**Interfaces:**

- Produces: copyable commands for offline planning, live Pixso planning, artifact
  inspection, pack validation, and verification.
- Produces: a requirements-to-evidence checklist matching all 12 Slice 1
  acceptance criteria.

- [ ] **Step 1: Write a failing documentation command test**

Add a Vitest test that extracts fenced `bash` commands marked `<!-- tested -->`
from `README.md`, runs only their `--help` or offline fixture forms in a
temporary directory, and asserts exit code 0.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm vitest run apps/cli/src/readme-commands.test.ts
```

Expected: FAIL because the README and test do not yet exist.

- [ ] **Step 3: Write focused documentation**

`README.md` starts with the outcome and includes:

```bash
pnpm install
pnpm verify
pnpm uig -- pack validate ./design-system-packs/sber-space-ui
PIXSO_ACCESS_TOKEN="<local environment value>" pnpm uig -- plan \
  --url "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314" \
  --design-system sber-space-ui
```

Do not instruct users to commit tokens or place them in project files.

`docs/contracts.md` explains the five artifact boundaries.
`docs/design-system-packs.md` explains verified imports, composition, and
pack-owned fallback.
`docs/diagnostics.md` lists every stable code and blocking behavior.
`docs/fixture-policy.md` explains source provenance, sanitization, secrets, and
golden review.

- [ ] **Step 4: Add the acceptance evidence table**

For each criterion in design section 14, list the exact test or command that
proves it. Examples:

```text
Deterministic DesignIR     → normalize-design.test.ts golden repeat test
Summary <= 20 KB           → build-design-summary.test.ts boundary test
No invented imports       → resolve-node.test.ts unverified candidate test
Offline normal verification → second consecutive pnpm verify
```

- [ ] **Step 5: Run final verification and CLI smoke**

Run:

```bash
pnpm verify
pnpm uig -- --help
pnpm uig -- pack validate ./design-system-packs/sber-space-ui
pnpm uig -- pack validate ./design-system-packs/material-ui
git status --short
```

Expected: all commands pass; the worktree contains only the intended
documentation changes before commit.

- [ ] **Step 6: Commit**

```bash
git add README.md docs package.json apps/cli/src/readme-commands.test.ts
git commit -m "docs: document Slice 1 workflow"
```

- [ ] **Step 7: Record completion evidence**

Run:

```bash
git log --oneline --decorate -15
pnpm verify
git status --short --branch
```

Expected: the Slice 1 commits are present, `pnpm verify` passes, and the
worktree is clean. Do not claim completion if any expected command differs.

---

## Execution checkpoints

Pause for review after:

1. Task 2: public artifact contracts are fixed.
2. Task 5: the deterministic `DesignIR` mapping is visible.
3. Task 8: both pack formats and concrete verified imports are visible.
4. Task 10: the first end-to-end CLI run works with a fake Pixso client.
5. Task 12: all acceptance evidence passes.

Any requested contract change after Task 2 must update the design spec or
introduce an explicit schema-version decision before implementation continues.

## Primary implementation references

- Approved design:
  `docs/superpowers/specs/2026-07-26-universal-ui-generator-design.md`
- Existing Sber component catalog:
  `/Users/danilel/dev/gigacode-mcp/resources/sber-space-ui/catalog.json`
- Existing Sber semantic policy:
  `/Users/danilel/dev/gigacode-mcp/resources/sber-space-ui/semantic-policy.json`
- Existing Sber resolution rules:
  `/Users/danilel/dev/gigacode-mcp/resources/sber-space-ui/resolution/`
- Existing semantic UI patterns:
  `/Users/danilel/dev/gigacode-extension/agents/ui/patterns/`
- Recorded Pixso `4:314` source:
  `/Users/danilel/Documents/Codex/2026-07-25/sites-plugin-sites-openai-bundled-create-4/outputs/pixso-node-4-314.dsl.json`
- Official MCP TypeScript client guide:
  `https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md`
- TypeBox:
  `https://github.com/sinclairzx81/typebox`
