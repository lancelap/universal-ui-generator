# Qwen Project Component Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, deterministic `/uig:scan` workflow to the existing Qwen extension that publishes a verified, addressable project component catalog and supports reviewed project mappings without changing current Pixso planning or React generation.

**Architecture:** Add strict project-context contracts, a TypeScript Compiler API scanner for proven public component/icon facades, and a project-context service that owns discovery, safe `.ui-context` storage, catalog fingerprinting, queries, and mapping mutations. Expose that service through compact tools on the existing bundled `uig` MCP server and thin Qwen commands; keep `uig_plan`, `uig_generate`, the Pixso proxy, component resolver, and generator behavior unchanged in this slice.

**Tech Stack:** TypeScript 5.9, Node.js `>=22`, pnpm 10.33, TypeBox, TypeScript Compiler API, MCP SDK `@modelcontextprotocol/server@2.0.0-beta.5`, Zod 4, esbuild `0.28.1`, Vitest 3.2, Qwen Code extension bundle.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-08-02-qwen-project-component-context-design.md`.
- The user-facing surface is Qwen-only: `/uig:scan`, `/uig:components`, `/uig:map`, and `/uig:status`; do not add a public `uig scan` CLI subcommand.
- The existing ordinary CLI, `uig_plan`, `uig_generate`, Pixso provider, resolution plan, component resolver, and React generator remain behaviorally unchanged.
- `/uig:scan` is offline, deterministic, LLM-free, and must not call Pixso, npm, GitHub, Storybook, package scripts, project JavaScript, or any network client.
- The MCP process working directory is the only writable workspace authority. Tool inputs never accept an arbitrary workspace path.
- The scanner may write only `.ui-context`; it never creates public facades, changes `tsconfig`, installs dependencies, or edits application source.
- Only configured application public entries and workspace/package public exports are cataloged. Presence under `src` is not evidence of public availability.
- Every generated import source is proven through a TypeScript alias or package export. Deep imports and guessed aliases are rejected.
- Technical availability and semantic authority remain separate: `verified` proves the export/contract; only `mapped` and `pack-owned` may become future automatic resolution sources. `suggested` is never automatic in v1.
- `choicePanel` is a semantic role. `single-selection-collection` is a render-recipe kind and must not be registered as a semantic role.
- V1 requires `allowSuggested: false`, `allowDeepImports: false`, and `preferPublicFacades: true`.
- Human-owned context JSON and `.ui-context/.gitignore` are committed; `.ui-context/generated/` is ignored and reproducible.
- Generated artifacts contain workspace-relative paths only and no environment values, tokens, credentials, absolute home paths, or raw project source.
- MCP search and diagnostic results are bounded to at most 50 returned items and point to durable artifacts for complete data.
- Catalog publication is fail-closed: supporting artifacts are validated first and `effective-component-catalog.json` is renamed into place last.
- Stale fingerprints block mapping mutation and, in the future resolver slice, will block project-aware planning.
- Do not add embeddings, vector databases, a second LLM, Storybook indexing, token/CSS indexing, hook/store/service indexing, Bun support, or automatic project composition discovery.
- Follow TDD for every task: focused failing test, minimal implementation, focused green test, relevant regression test, then commit.

---

## File Map

### Contracts

- `packages/contracts/src/project-context-config.ts` — human-owned config, mapping, annotation, and policy schemas plus safe relative path and semantic binding types.
- `packages/contracts/src/project-component-contract.ts` — normalized prop types, verified public component/icon entries, evidence, and scan artifacts.
- `packages/contracts/src/effective-component-catalog.ts` — effective catalog, fingerprint, source, summary, integrity checks, and stale input categories.
- `packages/contracts/src/index.ts` — exports the new contracts.
- `packages/contracts/src/project-context-contracts.test.ts` — closed-schema, invalid path/policy/role, duplicate ID, reference, and summary integrity tests.

### Static scanner

- `packages/project-scanner/package.json` — private workspace package depending on contracts and the bundled TypeScript compiler.
- `packages/project-scanner/src/index.ts` — public scanner exports.
- `packages/project-scanner/src/types.ts` — dependency-injection and scan result interfaces.
- `packages/project-scanner/src/discover-project.ts` — package manager, workspace, tsconfig, alias, installed package, and proposed-root discovery.
- `packages/project-scanner/src/resolve-public-entry.ts` — containment, public facade, package export, and import-source proof.
- `packages/project-scanner/src/scan-public-symbols.ts` — TypeScript program, export alias resolution, React component proof, and icon facade scan.
- `packages/project-scanner/src/normalize-prop-type.ts` — bounded recursive TypeScript type normalization.
- `packages/project-scanner/src/suggest-semantics.ts` — deterministic non-authoritative role/capability suggestions.
- `packages/project-scanner/src/*.test.ts` — focused unit and security tests.
- `packages/project-scanner/src/__fixtures__/` — small source fixtures used only by scanner unit tests.

### Project-context service and storage

- `packages/project-context/package.json` — private workspace package depending on contracts, scanner, component-catalog, and design-context.
- `packages/project-context/src/index.ts` — public service exports.
- `packages/project-context/src/errors.ts` — stable domain and infrastructure error codes.
- `packages/project-context/src/build-effective-catalog.ts` — deterministic merge of scan facts, human files, installed proofs, and selected packs.
- `packages/project-context/src/fingerprint-context.ts` — canonical per-category and overall SHA-256 calculation.
- `packages/project-context/src/project-context-store.ts` — safe reads, scan reservation, managed ignore file, staging, atomic authority publication, and artifact validation.
- `packages/project-context/src/create-project-context-service.ts` — discovery/scan orchestration and public service interface.
- `packages/project-context/src/query-project-context.ts` — bounded search, exact contract/icon lookup, and readiness status.
- `packages/project-context/src/mutate-mappings.ts` — reviewed fingerprint-bound mapping add/remove operations.
- `packages/project-context/src/*.test.ts` — catalog, storage, query, mutation, stale, and security tests.

### Qwen extension

- `extensions/qwen-cli/package.json` — adds the project-context service dependency.
- `extensions/qwen-cli/src/project-context-results.ts` — Zod MCP inputs/results and compact result projection.
- `extensions/qwen-cli/src/project-context-tools.ts` — adapter-level input parsing and stable UIG error conversion.
- `extensions/qwen-cli/src/server.ts` — registers the seven project-context tools while preserving `uig_plan` and `uig_generate`.
- `extensions/qwen-cli/src/tools.ts` — keeps only existing planning/generation behavior; no project scan logic is added here.
- `extensions/qwen-cli/tests/project-context-results.test.ts` — bounded result and leakage tests.
- `extensions/qwen-cli/tests/project-context-tools.test.ts` — workspace anchoring, delegation, stale, and mutation tests.
- `extensions/qwen-cli/tests/server.test.ts`, `stdio.test.ts`, `manifest.test.ts`, `install-smoke.test.ts` — MCP list/call, command, bundled runtime, and installation coverage.
- `commands/uig/scan.md` — first-run discovery and confirmed scan workflow.
- `commands/uig/components.md` — addressable search/contract workflow.
- `commands/uig/map.md` — explicit review before mapping mutation.
- `commands/uig/status.md` — readiness-only workflow.
- `QWEN.md` — adds project-context authority and direct-edit prohibitions without weakening Pixso/generation rules.

### Acceptance and packaging

- `fixtures/projects/project-context-basic/` — isolated React/TypeScript acceptance project with public and internal components/icons.
- `packages/project-context/src/project-context-acceptance.test.ts` — end-to-end discovery, scan, stable fingerprint, mapping, stale, rescan, and broken mapping acceptance.
- `dist/qwen-adapter.mjs` and `dist/qwen-adapter.provenance.json` — regenerated committed bundle and provenance.
- `README.md` — Qwen project-context setup, generated/human files, commands, diagnostics, and deferred resolver boundary.

---

### Task 1: Add strict project-context contracts

**Files:**

- Create: `packages/contracts/src/project-context-config.ts`
- Create: `packages/contracts/src/project-component-contract.ts`
- Create: `packages/contracts/src/effective-component-catalog.ts`
- Create: `packages/contracts/src/project-context-contracts.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Consumes: `closedObject`, `validateWithSchema`, `stableStringify`, existing `DiagnosticSchema`, and current semantic role strings used by `UiManifestV2`/design-system packs.
- Produces:

```ts
export type UiContextConfigV1 = Static<typeof UiContextConfigV1Schema>;
export type ProjectComponentMappingsV1 = Static<
  typeof ProjectComponentMappingsV1Schema
>;
export type ProjectComponentAnnotationsV1 = Static<
  typeof ProjectComponentAnnotationsV1Schema
>;
export type ProjectComponentPoliciesV1 = Static<
  typeof ProjectComponentPoliciesV1Schema
>;
export type ProjectScanDiagnostic = Static<
  typeof ProjectScanDiagnosticSchema
>;
export type InstalledPackagesV1 = Static<typeof InstalledPackagesV1Schema>;
export type PublicComponentsV1 = Static<typeof PublicComponentsV1Schema>;
export type EffectiveComponentCatalogV1 = Static<
  typeof EffectiveComponentCatalogV1Schema
>;

export function assertPublicComponentsV1Integrity(
  value: PublicComponentsV1,
): void;

export function assertEffectiveComponentCatalogV1Integrity(
  value: EffectiveComponentCatalogV1,
): void;
```

- Later tasks import these types; do not duplicate equivalent local interfaces.

- [ ] **Step 1: Write failing closed-schema and integrity tests**

Create `packages/contracts/src/project-context-contracts.test.ts` with a canonical fixture builder and focused tests:

```ts
import { describe, expect, it } from "vitest";

import {
  assertEffectiveComponentCatalogV1Integrity,
  EffectiveComponentCatalogV1Schema,
  ProjectComponentPoliciesV1Schema,
  UiContextConfigV1Schema,
  validateWithSchema,
} from "./index.js";

it("accepts one public facade config for one selected pack", () => {
  const value = validateWithSchema(UiContextConfigV1Schema, {
    schema: "ui-context-config/v1",
    framework: "react",
    language: "typescript",
    designSystemPacks: ["sber-space-ui"],
    componentRoots: [
      {
        path: "src/shared/ui",
        entry: "src/shared/ui/index.ts",
        importSource: "@/shared/ui",
      },
    ],
    iconRoots: [],
    workspacePackages: { discovery: "public-exports" },
    ignore: ["**/*.test.*"],
  });

  expect(value.componentRoots[0]?.importSource).toBe("@/shared/ui");
});

it.each(["/tmp/ui", "../ui", "src/../secret", "C:\\\\ui"])(
  "rejects unsafe context path %j",
  (path) => {
    expect(() =>
      validateWithSchema(UiContextConfigV1Schema, {
        ...validConfig(),
        componentRoots: [
          { path, entry: "src/ui/index.ts", importSource: "@/ui" },
        ],
      }),
    ).toThrow();
  },
);

it("rejects policies that enable suggested or deep imports", () => {
  expect(() =>
    validateWithSchema(ProjectComponentPoliciesV1Schema, {
      ...validPolicies(),
      resolution: {
        ...validPolicies().resolution,
        allowSuggested: true,
      },
    }),
  ).toThrow();
});

it("rejects an effective catalog with an incorrect summary", () => {
  const catalog = validEffectiveCatalog();
  catalog.summary.verifiedComponents = 99;
  expect(() => assertEffectiveComponentCatalogV1Integrity(catalog)).toThrow(
    /verifiedComponents/,
  );
});
```

Add separate tests for unknown fields, 63-character hashes, duplicate component
IDs, missing `contractRef`, annotation refs to absent components, duplicate pack
IDs, all four project-scan diagnostic severities, and incorrect summary counts.

- [ ] **Step 2: Run the focused contract test and verify it fails**

Run:

```bash
pnpm vitest run packages/contracts/src/project-context-contracts.test.ts
```

Expected: FAIL because the three new schema modules and integrity functions do not exist.

- [ ] **Step 3: Implement the human-owned schemas**

In `project-context-config.ts`, define a reusable relative path schema and closed objects. The policy literals must make unsafe values schema-invalid:

```ts
const WorkspaceRelativePathSchema = Type.String({
  minLength: 1,
  pattern:
    "^(?![\\\\/])(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+$",
});

const PublicImportSourceSchema = Type.String({
  minLength: 1,
  pattern: "^(?![.]{1,2}(?:/|$))[^#]+$",
});

const ProjectComponentIdSchema = Type.String({
  pattern: "^project:[^#]+#[^#]+$",
});

export const UiContextConfigV1Schema = closedObject({
  schema: Type.Literal("ui-context-config/v1"),
  framework: Type.Literal("react"),
  language: Type.Literal("typescript"),
  designSystemPacks: Type.Array(PackIdSchema, { uniqueItems: true }),
  componentRoots: Type.Array(PublicRootSchema),
  iconRoots: Type.Array(PublicRootSchema),
  workspacePackages: closedObject({
    discovery: Type.Literal("public-exports"),
  }),
  ignore: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
});

export const ProjectComponentPoliciesV1Schema = closedObject({
  schema: Type.Literal("project-component-policies/v1"),
  resolution: closedObject({
    allowSuggested: Type.Literal(false),
    allowNativeFallback: Type.Boolean(),
    preferProjectComponents: Type.Literal(true),
  }),
  components: closedObject({
    excluded: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    deprecatedAllowed: Type.Boolean(),
  }),
  imports: closedObject({
    preferPublicFacades: Type.Literal(true),
    allowDeepImports: Type.Literal(false),
  }),
});
```

Use `PublicImportSourceSchema` for every configured facade import and
`ProjectComponentIdSchema` for every project component reference. A default
export uses `project:<importSource>#default`; a relative import source is
schema-invalid.

Define mapping entries with `componentId`, `semanticRoles`, `capabilities`,
`formAdapters`, and literal `status: "mapped"`; exact Pixso mappings additionally
require provider, design system, component key, and component ID. Keep vocabulary
terms structurally typed in the JSON contract, then validate them in the
effective-catalog builder from Task 5, where selected pack vocabularies are
available.

Define `ProjectScanDiagnosticSchema` separately from the existing generation
`DiagnosticSchema` so scan diagnostics support exactly
`info | warning | error | fatal` without widening existing generation result
schemas in this slice.

- [ ] **Step 4: Implement normalized component and effective catalog schemas**

In `project-component-contract.ts`, use `Type.Recursive` for normalized prop types and closed discriminated objects for evidence/imports:

```ts
export const NormalizedPropTypeSchema = Type.Recursive((Self) =>
  Type.Union([
    closedObject({ kind: Type.Literal("string") }),
    closedObject({ kind: Type.Literal("number") }),
    closedObject({ kind: Type.Literal("boolean") }),
    closedObject({ kind: Type.Literal("void") }),
    closedObject({
      kind: Type.Literal("enum"),
      values: Type.Array(Type.Union([Type.String(), Type.Number(), Type.Boolean()])),
    }),
    closedObject({ kind: Type.Literal("array"), element: Self }),
    closedObject({ kind: Type.Literal("tuple"), elements: Type.Array(Self) }),
    closedObject({
      kind: Type.Literal("function"),
      parameters: Type.Array(
        closedObject({ name: Type.String({ minLength: 1 }), type: Self }),
      ),
      returns: Self,
    }),
    closedObject({
      kind: Type.Literal("opaque"),
      displayName: Type.String({ minLength: 1 }),
      reason: Type.String({ minLength: 1 }),
    }),
  ]),
);
```

Add the object/reference/ReactNode/ReactElement variants required by the spec,
then define `InstalledPackagesV1Schema`, `PublicComponentsV1Schema`, and
`EffectiveComponentCatalogV1Schema` with full 64-character lowercase SHA-256
strings. Implement contract-level integrity checks for unique IDs, valid refs,
summary counts, and stable source references. Semantic role, capability, and
form-adapter vocabulary validation belongs to the effective-catalog builder in
Task 5, where every selected pack is available.

- [ ] **Step 5: Export contracts and run focused tests**

Add exports to `packages/contracts/src/index.ts`, then run:

```bash
pnpm vitest run packages/contracts/src/project-context-contracts.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the contract slice**

```bash
git add packages/contracts/src/project-context-config.ts \
  packages/contracts/src/project-component-contract.ts \
  packages/contracts/src/effective-component-catalog.ts \
  packages/contracts/src/project-context-contracts.test.ts \
  packages/contracts/src/index.ts
git commit -m "feat: add project component context contracts"
```

---

### Task 2: Discover the project and propose proven public roots

**Files:**

- Create: `packages/project-scanner/package.json`
- Create: `packages/project-scanner/src/index.ts`
- Create: `packages/project-scanner/src/types.ts`
- Create: `packages/project-scanner/src/discover-project.ts`
- Create: `packages/project-scanner/src/resolve-public-entry.ts`
- Create: `packages/project-scanner/src/discover-project.test.ts`
- Create: `packages/project-scanner/src/resolve-public-entry.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `UiContextConfigV1`, bundled design-system pack directories, workspace `package.json`/lockfile/tsconfig files, and Node filesystem APIs.
- Produces:

```ts
export interface ProjectDiscovery {
  schema: "project-discovery/v1";
  discoveryId: string;
  packageManager: "pnpm" | "npm" | "yarn";
  packageName: string;
  lockfilePath: string;
  tsconfigPath: string;
  proposedConfig: UiContextConfigV1;
  evidencePaths: string[];
  diagnostics: ProjectScanDiagnostic[];
}

export async function discoverProject(input: {
  workspaceDir: string;
  availablePackIds: readonly string[];
  defaultPackId: "sber-space-ui";
}): Promise<ProjectDiscovery>;

export async function resolveConfiguredPublicRoots(input: {
  workspaceDir: string;
  config: UiContextConfigV1;
}): Promise<ResolvedPublicRoot[]>;

export type ProjectScannerErrorCode =
  | "UI_CONTEXT_CONFIG_INVALID"
  | "CONFIG_PATH_OUTSIDE_WORKSPACE"
  | "CONFIG_SYMLINK_ESCAPES_WORKSPACE"
  | "MULTIPLE_LOCKFILES_FOUND"
  | "PACKAGE_MANAGER_UNSUPPORTED"
  | "PUBLIC_FACADE_NOT_FOUND"
  | "PUBLIC_IMPORT_SOURCE_UNRESOLVED"
  | "PUBLIC_IMPORT_SOURCE_MISMATCH"
  | "PUBLIC_TYPES_ENTRY_NOT_FOUND"
  | "INSTALLED_PACKAGE_NOT_FOUND";

export class ProjectScannerError extends Error {
  readonly name = "ProjectScannerError";

  constructor(
    readonly code: ProjectScannerErrorCode,
    message: string,
  ) {
    super(message);
  }
}
```

- `discoveryId` is the SHA-256 of canonical proposed config plus discovery evidence hashes; it contains no time or absolute path.

- [ ] **Step 1: Write failing project discovery tests**

Build temporary workspaces in `discover-project.test.ts` and assert exact outcomes:

```ts
it("proposes one aliased component facade and installed Sber pack", async () => {
  const workspace = await reactWorkspace({
    packageJson: { name: "customer-portal", dependencies: {
      "@sber-space-ui/button": "2.0.0",
    } },
    tsconfig: { compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } },
    files: {
      "src/shared/ui/index.ts": 'export { Button } from "./Button";',
      "src/shared/ui/Button.tsx": "export const Button = () => null;",
    },
  });

  const result = await discoverProject({
    workspaceDir: workspace,
    availablePackIds: ["sber-space-ui", "mui"],
    defaultPackId: "sber-space-ui",
  });

  expect(result.proposedConfig).toMatchObject({
    designSystemPacks: ["sber-space-ui"],
    componentRoots: [
      {
        path: "src/shared/ui",
        entry: "src/shared/ui/index.ts",
        importSource: "@/shared/ui",
      },
    ],
  });
  expect(result.discoveryId).toMatch(/^[a-f0-9]{64}$/);
});
```

Add focused cases for no writes during discovery, multiple lockfiles,
unsupported Bun-only project, absent tsconfig, no facade suggestions,
deterministic root ordering, multiple detected packs, and no installed pack
match falling back to the visible `sber-space-ui` proposal.

- [ ] **Step 2: Write failing public-root security and import-proof tests**

In `resolve-public-entry.test.ts`, cover safe alias resolution plus traversal, absolute paths, missing entry, alias mismatch, a root symlink outside workspace, and an external linked package. Assert stable codes:

```ts
await expect(
  resolveConfiguredPublicRoots({ workspaceDir, config: escapedConfig }),
).rejects.toMatchObject({ code: "CONFIG_SYMLINK_ESCAPES_WORKSPACE" });
```

- [ ] **Step 3: Run the tests and verify the package is absent**

```bash
pnpm vitest run packages/project-scanner/src/discover-project.test.ts \
  packages/project-scanner/src/resolve-public-entry.test.ts
```

Expected: FAIL because `@uig/project-scanner` and its functions do not exist.

- [ ] **Step 4: Create the scanner package and discovery implementation**

Create `package.json`:

```json
{
  "name": "@uig/project-scanner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@uig/contracts": "workspace:*",
    "typescript": "^5.9.3"
  }
}
```

Implement JSON-only project discovery. Do not import Vite/Webpack configs. Find
conventional facade candidates only when `index.ts` or `index.tsx` exists, prove
aliases from parsed `tsconfig.compilerOptions.paths`, and map installed Sber/MUI
package prefixes to available bundled pack IDs through a static provider-neutral
table in `discover-project.ts`. If the table finds no installed pack, propose
the supplied visible `defaultPackId`; the user may replace it in
`acceptedConfig` before confirmation.

Use canonical relative paths and hash file bytes:

```ts
const discoveryId = createHash("sha256")
  .update(stableStringify({ proposedConfig, evidenceHashes }))
  .digest("hex");
```

- [ ] **Step 5: Implement contained root and import-source proof**

In `resolve-public-entry.ts`, canonicalize the workspace once, reject unsafe lexical paths before filesystem access, `lstat` every configured path, reject symlinks, require ordinary files/directories, and verify each `importSource` with TypeScript module resolution from a virtual file under the workspace:

```ts
const resolved = ts.resolveModuleName(
  root.importSource,
  join(workspaceDir, "__uig_import_probe__.tsx"),
  compilerOptions,
  ts.sys,
).resolvedModule;

if (!resolved || !sameCanonicalModule(resolved.resolvedFileName, entryPath)) {
  throw new ProjectScannerError(
    "PUBLIC_IMPORT_SOURCE_MISMATCH",
    `Import ${root.importSource} does not resolve to ${root.entry}`,
  );
}
```

For workspace packages, resolve only declared package exports/types. Reject arbitrary linked packages outside the workspace in v1.

- [ ] **Step 6: Run discovery/security tests and typecheck**

```bash
pnpm vitest run packages/project-scanner/src/discover-project.test.ts \
  packages/project-scanner/src/resolve-public-entry.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit project discovery**

```bash
git add packages/project-scanner pnpm-lock.yaml
git commit -m "feat: discover public project component roots"
```

---

### Task 3: Scan verified public React components and icons

**Files:**

- Create: `packages/project-scanner/src/scan-public-symbols.ts`
- Create: `packages/project-scanner/src/normalize-prop-type.ts`
- Create: `packages/project-scanner/src/scan-public-symbols.test.ts`
- Create: `packages/project-scanner/src/normalize-prop-type.test.ts`
- Create: `packages/project-scanner/src/__fixtures__/react-public-api/`
- Modify: `packages/project-scanner/src/index.ts`
- Modify: `packages/project-scanner/src/types.ts`

**Interfaces:**

- Consumes: `ResolvedPublicRoot[]`, TypeScript compiler options, project/package identity, and the normalized contract schemas from Task 1.
- Produces:

```ts
export async function scanPublicProject(input: {
  workspaceDir: string;
  config: UiContextConfigV1;
  resolvedRoots: readonly ResolvedPublicRoot[];
}): Promise<{
  schema: "public-components/v1";
  components: VerifiedProjectComponent[];
  icons: VerifiedProjectIcon[];
  diagnostics: ProjectScanDiagnostic[];
}>;

export function normalizeType(input: {
  checker: ts.TypeChecker;
  type: ts.Type;
  location: ts.Node;
  depth?: number;
  seen?: ReadonlySet<number>;
}): NormalizedPropType;
```

- [ ] **Step 1: Add fixture exports and failing symbol tests**

The fixture must include named/default function components, arrow components,
`React.FC`, `forwardRef`, `memo(forwardRef(...))`, nested barrel aliases, one
non-exported component, and one PascalCase non-React function. Test exact public
identity and facade import:

```ts
expect(result.components.map(({ id }) => id)).toEqual([
  "project:@/shared/ui#ArrowButton",
  "project:@/shared/ui#ForwardedInput",
  "project:@/shared/ui#MemoButton",
  "project:@/shared/ui#default",
]);
expect(result.components).not.toContainEqual(
  expect.objectContaining({ id: expect.stringContaining("InternalOption") }),
);
expect(result.components).not.toContainEqual(
  expect.objectContaining({ id: expect.stringContaining("CreatePayload") }),
);
```

Add an icon facade fixture and prove exact named exports are emitted under
`icons`, while the same symbol exported only from a component facade remains a
component.

- [ ] **Step 2: Add failing prop normalization tests**

Cover required/optional props, primitive types, literal union enum, arrays,
tuples, callbacks, object properties, ReactNode/ReactElement, inherited
interfaces, intersections, recursive references, generics, and deprecated
JSDoc. Assert an unsupported generic becomes:

```ts
expect(findProp(result, "data").type).toEqual({
  kind: "opaque",
  displayName: "T",
  reason: "generic-contract-not-fully-materialized",
});
expect(result.diagnostics).toContainEqual(
  expect.objectContaining({
    code: "COMPONENT_PROP_TYPE_OPAQUE",
    severity: "warning",
  }),
);
```

- [ ] **Step 3: Run focused scanner tests and verify failure**

```bash
pnpm vitest run packages/project-scanner/src/scan-public-symbols.test.ts \
  packages/project-scanner/src/normalize-prop-type.test.ts
```

Expected: FAIL because the public symbol/type scanner is absent.

- [ ] **Step 4: Build one TypeScript program and resolve facade exports**

Create one `ts.Program` from the project's parsed tsconfig plus every confirmed
public entry. For each entry module:

```ts
const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
const exports = moduleSymbol
  ? checker.getExportsOfModule(moduleSymbol)
  : [];

for (const exported of exports.sort(compareSymbolName)) {
  const target = exported.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(exported)
    : exported;
  // classify and normalize only after resolving the public alias
}
```

Prove React components by callable return type compatibility with JSX/React
nodes, explicit React component types, or verified `memo`/`forwardRef` wrapper
signatures. Do not use PascalCase as proof. Build IDs from package/project name
plus the facade export name, and preserve `named` versus `default` import style.

- [ ] **Step 5: Implement bounded recursive type normalization**

Use a maximum recursion depth of 12 and a seen-type set. Normalize supported
types exactly; use `checker.typeToString` only for the display name of an opaque
contract, never as a replacement for structured supported types. Sort object
properties by name and union enum values by canonical JSON representation.

Record JSDoc summary and `@deprecated` without including implementation source.

- [ ] **Step 6: Run scanner tests and the existing contract suite**

```bash
pnpm vitest run packages/project-scanner/src/scan-public-symbols.test.ts \
  packages/project-scanner/src/normalize-prop-type.test.ts \
  packages/contracts/src/project-context-contracts.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit verified symbol scanning**

```bash
git add packages/project-scanner/src
git commit -m "feat: scan verified public React contracts"
```

---

### Task 4: Add deterministic semantic suggestions and installed package proof

**Files:**

- Create: `packages/project-scanner/src/suggest-semantics.ts`
- Create: `packages/project-scanner/src/suggest-semantics.test.ts`
- Create: `packages/project-scanner/src/scan-installed-packages.ts`
- Create: `packages/project-scanner/src/scan-installed-packages.test.ts`
- Modify: `packages/project-scanner/src/scan-public-symbols.ts`
- Modify: `packages/project-scanner/src/index.ts`
- Modify: `packages/project-scanner/src/types.ts`

**Interfaces:**

- Consumes: verified public components/icons, selected loaded pack vocabularies, project package metadata, and resolved installed package type entries.
- Produces:

```ts
export interface SemanticVocabulary {
  roles: ReadonlySet<string>;
  capabilities: ReadonlySet<string>;
  formAdapters: ReadonlySet<string>;
}

export function suggestProjectSemantics(input: {
  component: VerifiedProjectComponent;
  vocabulary: SemanticVocabulary;
}): {
  semanticRoles: SemanticSuggestion[];
  capabilities: CapabilitySuggestion[];
  formAdapters: FormAdapterSuggestion[];
  diagnostics: ProjectScanDiagnostic[];
};

export async function scanInstalledPackages(input: {
  workspaceDir: string;
  packageJsonPath: string;
  lockfilePath: string;
}): Promise<InstalledPackagesV1>;
```

- [ ] **Step 1: Write failing deterministic suggestion tests**

Test exact evidence and the role/recipe-kind boundary:

```ts
it("suggests choicePanel for a verified controlled radio group", () => {
  const result = suggestProjectSemantics({
    component: appRadioGroupContract(),
    vocabulary: vocabulary({
      roles: ["choicePanel"],
      capabilities: ["single-selection", "value", "change"],
      formAdapters: ["controlled"],
    }),
  });

  expect(result.semanticRoles).toContainEqual({
    role: "choicePanel",
    status: "suggested",
    confidence: 0.86,
    evidence: [
      { kind: "component-name", value: "AppRadioGroup" },
      { kind: "prop-shape", value: "options,value,onChange" },
    ],
  });
  expect(result.semanticRoles).not.toContainEqual(
    expect.objectContaining({ role: "single-selection-collection" }),
  );
});
```

Add tests proving unknown terms are omitted, scores/evidence are stable, key
ordering does not change output, and `Upload` becomes only an exact verified
icon name rather than an invented action semantic.

- [ ] **Step 2: Write failing installed-package proof tests**

Create temporary npm/pnpm/yarn fixtures with public `exports.types`, package
`types`, an absent installed dependency, and an external package symlink. Assert
that only installed public type entries inside the workspace dependency graph
are included and that absent packages produce `INSTALLED_PACKAGE_NOT_FOUND`.
Add a malicious fixture `postinstall` script that would create a sentinel file,
stub global `fetch` to throw on invocation, run package proof, and assert the
sentinel is absent and `fetch` has zero calls. This proves the scanner neither
executes package scripts nor performs network discovery.

- [ ] **Step 3: Run tests and verify failure**

```bash
pnpm vitest run packages/project-scanner/src/suggest-semantics.test.ts \
  packages/project-scanner/src/scan-installed-packages.test.ts
```

Expected: FAIL because suggestion and installed-proof functions do not exist.

- [ ] **Step 4: Implement a small explicit suggestion rule table**

Keep rules provider-neutral and deterministic:

```ts
const RULES: readonly SuggestionRule[] = [
  {
    role: "choicePanel",
    namePattern: /(?:RadioGroup|ChoicePanel)$/,
    requiredProps: ["options", "value", "onChange"],
    confidence: 0.86,
    capabilities: ["single-selection", "value", "change"],
    formAdapters: ["controlled"],
  },
  {
    role: "filtersForm",
    namePattern: /Filter(?:s)?(?:Form|Panel)$/,
    requiredProps: ["filters", "onChange"],
    confidence: 0.81,
    capabilities: ["filtering"],
    formAdapters: ["controlled"],
  },
];
```

Before emitting anything, require every term to exist in the supplied
vocabulary. Emit evidence in fixed kind/value order and sort final suggestions
by role/capability name. Do not add fuzzy matching or a confidence threshold
that promotes suggestions.

- [ ] **Step 5: Implement installed package proof without network access**

Read declared dependencies from package metadata, resolve their `package.json`
from the workspace, parse `exports`/`types`/`typings`, and hash the actual public
type entry bytes. Do not use registry metadata or execute module code. Reject
uncontained symlink targets in v1.

Return canonical entries sorted by package name:

```ts
{
  name,
  version,
  packageJsonPath: relative(workspaceDir, packageJsonPath),
  publicTypeEntries: [{ subpath, path, sha256 }],
}
```

- [ ] **Step 6: Attach suggestions to the public scan and run tests**

Invoke `suggestProjectSemantics` only after a component is technically verified.
Run:

```bash
pnpm vitest run packages/project-scanner/src/suggest-semantics.test.ts \
  packages/project-scanner/src/scan-installed-packages.test.ts \
  packages/project-scanner/src/scan-public-symbols.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit deterministic suggestions and package proof**

```bash
git add packages/project-scanner/src
git commit -m "feat: suggest project component semantics"
```

---

### Task 5: Build the effective component catalog and stable fingerprint

**Files:**

- Create: `packages/project-context/package.json`
- Create: `packages/project-context/src/index.ts`
- Create: `packages/project-context/src/errors.ts`
- Create: `packages/project-context/src/fingerprint-context.ts`
- Create: `packages/project-context/src/build-effective-catalog.ts`
- Create: `packages/project-context/src/fingerprint-context.test.ts`
- Create: `packages/project-context/src/build-effective-catalog.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `PublicComponentsV1`, `InstalledPackagesV1`, validated human-owned context, and `LoadedDesignSystemPackV2[]` from `@uig/component-catalog`.
- Produces:

```ts
export interface ContextFingerprintInputs {
  config: UiContextConfigV1;
  mappings: ProjectComponentMappingsV1;
  annotations: ProjectComponentAnnotationsV1;
  policies: ProjectComponentPoliciesV1;
  publicComponents: PublicComponentsV1;
  installedPackages: InstalledPackagesV1;
  designSystemPacks: readonly {
    id: string;
    version: string;
    sha256: string;
  }[];
}

export function fingerprintProjectContext(
  input: ContextFingerprintInputs,
): EffectiveCatalogFingerprint;

export function buildEffectiveComponentCatalog(input: {
  fingerprint: EffectiveCatalogFingerprint;
  publicComponents: PublicComponentsV1;
  mappings: ProjectComponentMappingsV1;
  annotations: ProjectComponentAnnotationsV1;
  policies: ProjectComponentPoliciesV1;
  installedPackages: InstalledPackagesV1;
  packs: readonly LoadedDesignSystemPackV2[];
}): EffectiveComponentCatalogV1;

export type ProjectContextErrorCode =
  | ProjectScannerErrorCode
  | "DUPLICATE_COMPONENT_ID"
  | "MAPPING_TARGET_NOT_FOUND"
  | "SEMANTIC_ROLE_UNKNOWN"
  | "COMPONENT_CAPABILITY_UNKNOWN"
  | "FORM_ADAPTER_UNKNOWN"
  | "SCAN_DISCOVERY_STALE"
  | "PROJECT_SCAN_ALREADY_RUNNING"
  | "PROJECT_SCAN_LOCK_UNCERTAIN"
  | "PROJECT_COMPONENT_CATALOG_MISSING"
  | "PROJECT_COMPONENT_CATALOG_STALE"
  | "PROJECT_COMPONENT_NOT_FOUND"
  | "CATALOG_ATOMIC_WRITE_FAILED"
  | "PROJECT_CONTEXT_FILESYSTEM_FAILED";
```

- [ ] **Step 1: Write failing fingerprint determinism tests**

```ts
it("ignores JSON key order and operational time", () => {
  const first = fingerprintProjectContext(contextInputs());
  const reordered = fingerprintProjectContext(reorderedContextInputs());
  expect(first).toEqual(reordered);
});

it.each([
  "config",
  "mappings",
  "annotations",
  "policies",
  "publicComponents",
  "installedPackages",
  "designSystemPacks",
] as const)("changes when %s changes", (category) => {
  const before = fingerprintProjectContext(contextInputs());
  const after = fingerprintProjectContext(changedInputs(category));
  expect(after.value).not.toBe(before.value);
  expect(after.inputs[category]).not.toEqual(before.inputs[category]);
});
```

- [ ] **Step 2: Write failing catalog merge tests**

Cover `verified + suggested`, `verified + mapped`, annotations, exclusions,
deprecated policy, exact design mapping, missing target, duplicate IDs across
project/public sources, multiple packs, unknown capability, and stable ordering.
Add a selected-pack case where `@sber-space-ui/radio` is not present in
installed package proof: pack semantic vocabulary remains available, but
`base.RadioGroup` is not emitted as an available import binding. Add the green
counterpart with a verified public package/export type entry.
Assert that suggestions stay suggestions and a confirmed mapping becomes:

```ts
expect(findComponent(catalog, appRadioGroupId).semantics).toContainEqual({
  role: "choicePanel",
  status: "mapped",
  confidence: 1,
  source: ".ui-context/mappings.json",
});
```

- [ ] **Step 3: Run tests and verify failure**

```bash
pnpm vitest run packages/project-context/src/fingerprint-context.test.ts \
  packages/project-context/src/build-effective-catalog.test.ts
```

Expected: FAIL because `@uig/project-context` does not exist.

- [ ] **Step 4: Create the package and stable fingerprint implementation**

Create `package.json` with workspace dependencies on contracts,
project-scanner, component-catalog, and design-context. Hash each category from
`stableStringify`, then hash the canonical object of category hashes:

```ts
function hash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

const inputs = {
  config: hash(input.config),
  mappings: hash(input.mappings),
  annotations: hash(input.annotations),
  policies: hash(input.policies),
  project: hash(input.publicComponents),
  lockfile: hash(input.installedPackages.lockfile),
  installedPackages: hash(input.installedPackages.packages),
  designSystemPacks: Object.fromEntries(sortedPackHashes),
};

return { algorithm: "sha256", value: hash(inputs), inputs };
```

Do not include timestamps, absolute workspace paths, or scan IDs.

- [ ] **Step 5: Implement the fail-closed catalog merge**

Index project entries and pack entries separately. Validate every human mapping
against a verified public component, selected pack semantic role, capability,
and form adapter vocabulary. Apply exclusions and deprecation policy before
emitting candidates. Require each pack binding's package and export to be
present in installed public type proof before marking it technically available;
pack verification alone is insufficient. Preserve project and pack provenance
rather than flattening them into an unexplained binding.

Sort sources by kind/ID, components/icons by ID, semantic entries by role, and
diagnostics by `(severity, code, path, componentId)`. Call
`assertEffectiveComponentCatalogV1Integrity` before returning.

- [ ] **Step 6: Run catalog, pack, and contract regressions**

```bash
pnpm vitest run packages/project-context/src/fingerprint-context.test.ts \
  packages/project-context/src/build-effective-catalog.test.ts \
  packages/component-catalog/src/load-pack.test.ts \
  packages/contracts/src/project-context-contracts.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the effective catalog builder**

```bash
git add packages/project-context pnpm-lock.yaml
git commit -m "feat: build effective project component catalog"
```

---

### Task 6: Add safe `.ui-context` storage and atomic authority publication

**Files:**

- Create: `packages/project-context/src/project-context-store.ts`
- Create: `packages/project-context/src/project-context-store.test.ts`
- Modify: `packages/project-context/src/index.ts`
- Modify: `packages/design-context/src/safe-directory-tree.ts`
- Create: `packages/design-context/src/safe-directory-tree.test.ts`

**Interfaces:**

- Consumes: validated human/generated schemas, stable JSON, existing contained-directory utilities, and workspace-local paths.
- Produces:

```ts
export interface ProjectContextStore {
  readHumanContext(): Promise<HumanProjectContext | null>;
  initializeHumanContext(config: UiContextConfigV1): Promise<HumanProjectContext>;
  replaceMappings(input: {
    expectedSha256: string;
    mappings: ProjectComponentMappingsV1;
  }): Promise<{
    previous: ProjectComponentMappingsV1;
    previousSha256: string;
    writtenSha256: string;
  }>;
  acquireScanReservation(scanId: string): Promise<ScanReservation>;
  publishGenerated(input: GeneratedProjectContextArtifacts): Promise<{
    catalogPath: ".ui-context/generated/effective-component-catalog.json";
    catalogSha256: string;
  }>;
  readActiveCatalog(): Promise<EffectiveComponentCatalogV1 | null>;
  readGeneratedArtifact<T>(reference: GeneratedArtifactReference<T>): Promise<T>;
}

export function createProjectContextStore(workspaceDir: string): ProjectContextStore;
```

- [ ] **Step 1: Write failing initialization/publication tests**

Assert first initialization creates exactly:

```text
.ui-context/.gitignore          -> generated/\n
.ui-context/config.json
.ui-context/mappings.json
.ui-context/annotations.json
.ui-context/policies.json
```

Assert it does not overwrite existing human JSON. Assert supporting generated
artifacts are written first and the effective catalog is the final authority
rename. Inject a failure before catalog rename and prove the prior catalog bytes
remain identical.

- [ ] **Step 2: Write failing containment, symlink, concurrency, and leakage tests**

Cover `.ui-context` symlink escape, generated directory symlink escape,
temporary destination replacement, concurrent reservation, proven dead-lock
recovery, uncertain-lock blocking, absence of absolute workspace paths, and
secret-bearing artifact keys. Use sentinel values and assert they do not occur
in any written bytes.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
pnpm vitest run packages/project-context/src/project-context-store.test.ts
```

Expected: FAIL because the store does not exist.

- [ ] **Step 4: Generalize safe contained directory validation without weakening `.uig`**

If the existing `ensureContainedDirectoryTree` lacks a needed safe file-parent
primitive, add one focused export in `safe-directory-tree.ts`:

```ts
export async function assertContainedOrdinaryPath(input: {
  baseDirectory: string;
  relativePath: string;
  expected: "file" | "directory";
  allowMissingLeaf?: boolean;
}): Promise<string>;
```

It must preserve existing `.uig` behavior and receive dedicated traversal and
symlink tests. Do not weaken current POSIX protection or silently follow links.

- [ ] **Step 5: Implement human initialization and scan reservation**

Use exclusive temporary writes (`flag: "wx"`) and rename within a validated
ordinary parent. Create human JSON only when absent. Treat an existing human
file as user-owned: validate and return it, never replace it during initialize.

Implement `replaceMappings` as a compare-and-swap operation: read and validate
the current canonical bytes, require `expectedSha256`, write validated next
bytes through a temporary ordinary file, rename, and return the prior document
and both hashes. The same method restores the prior document by requiring the
just-written hash; mutation code never writes the file directly.

Acquire `.ui-context/.scan-lock` exclusively. Store schema, scan ID, PID, and
started time. On conflict, verify process liveness and staging evidence before
recovering; otherwise return `PROJECT_SCAN_ALREADY_RUNNING` or
`PROJECT_SCAN_LOCK_UNCERTAIN`.

- [ ] **Step 6: Implement supporting-artifact and catalog-last publication**

Write canonical bytes for `project-scan.json`, `installed-packages.json`,
`public-components.json`, and `diagnostics.json`; hash and validate them; then
write and rename `effective-component-catalog.json` last. Catalog references
must include the supporting hashes. Readers validate schema, integrity, and
referenced hash before returning data.

- [ ] **Step 7: Run storage and existing `.uig` security regressions**

```bash
pnpm vitest run packages/project-context/src/project-context-store.test.ts \
  packages/design-context/src/artifact-store.test.ts \
  extensions/qwen-cli/tests/tools.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit safe project-context storage**

```bash
git add packages/project-context/src/project-context-store.ts \
  packages/project-context/src/project-context-store.test.ts \
  packages/project-context/src/index.ts \
  packages/design-context/src/safe-directory-tree.ts \
  packages/design-context/src/safe-directory-tree.test.ts
git commit -m "feat: publish project context safely"
```

---

### Task 7: Orchestrate discovery, confirmed scan, and readiness status

**Files:**

- Create: `packages/project-context/src/create-project-context-service.ts`
- Create: `packages/project-context/src/create-project-context-service.test.ts`
- Modify: `packages/project-context/src/errors.ts`
- Modify: `packages/project-context/src/index.ts`

**Interfaces:**

- Consumes: project discovery/scanner APIs, effective catalog builder, loaded pack API, and `ProjectContextStore`.
- Produces:

```ts
export interface ProjectContextService {
  scan(input: {
    acceptDiscoveredConfig?: boolean;
    discoveryId?: string;
    acceptedConfig?: UiContextConfigV1;
  }): Promise<ProjectScanCommandResult>;
  status(): Promise<ProjectUiContextStatus>;
}

export function createProjectContextService(input: {
  workspaceDir: string;
  extensionRoot: string;
  now?: () => Date;
  processIsAlive?: (pid: number) => boolean;
}): ProjectContextService;
```

`ProjectScanCommandResult` is a closed union of
`needs-configuration | completed | blocked`. It never exposes raw component
arrays through the MCP-facing service result.

- [ ] **Step 1: Write a failing first-run state-machine test**

```ts
it("discovers without writes, then scans only with the current discovery ID", async () => {
  const service = fixtureService(workspaceDir);

  const first = await service.scan({});
  expect(first.status).toBe("needs-configuration");
  expect(await pathExists(join(workspaceDir, ".ui-context"))).toBe(false);

  const completed = await service.scan({
    acceptDiscoveredConfig: true,
    discoveryId: first.discoveryId,
    acceptedConfig: first.proposedConfig,
  });
  expect(completed.status).toBe("completed");
  expect(completed.catalog.path).toBe(
    ".ui-context/generated/effective-component-catalog.json",
  );
});
```

Add cases for missing/mismatched discovery ID, changed facade between discovery
and confirmation (`SCAN_DISCOVERY_STALE`), existing config bypassing discovery,
selected pack absence, scanner warning publication, and blocking scan preserving
the prior authority catalog.

- [ ] **Step 2: Write failing status/fingerprint category tests**

Cover `missing`, `ready`, `stale`, and `blocked`. After a prop file change, assert
status reports:

```ts
expect(await service.status()).toMatchObject({
  status: "stale",
  changed: ["project"],
});
```

After a lockfile change, expect `changed: ["lockfile"]`; after mapping change,
expect `changed: ["mappings"]`. Status must not write or start a scan.

- [ ] **Step 3: Run focused service tests and verify failure**

```bash
pnpm vitest run packages/project-context/src/create-project-context-service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 4: Implement discovery/confirmation orchestration**

If human config is absent, call `discoverProject` with visible default pack
`sber-space-ui` and return the proposed config plus discovery ID. When
confirmation is supplied, require `acceptedConfig`, rediscover and compare the
ID before any write, then validate the accepted config against the current
workspace and available bundled pack IDs. Initialize human files, acquire the
scan reservation, load only accepted selected packs through
`loadDesignSystemPackV2`, resolve roots, scan installed/public facts,
fingerprint, build, and publish.

Always release the reservation in `finally`. Convert expected scanner/catalog
failures into a structured `blocked` result with bounded diagnostics and a
durable diagnostic path. Infrastructure failures remain typed
`ProjectContextError` values for the adapter to serialize as MCP errors.

- [ ] **Step 5: Implement read-only current-state calculation**

`status()` reads human context and the active catalog. To detect staleness it
recomputes only category inputs needed for fingerprints; it does not publish
artifacts or mutate locks. Return sorted changed categories from the stored
per-category hashes versus current hashes.

- [ ] **Step 6: Run service, catalog, scanner, and storage tests**

```bash
pnpm vitest run packages/project-context/src/create-project-context-service.test.ts \
  packages/project-context/src/project-context-store.test.ts \
  packages/project-context/src/build-effective-catalog.test.ts \
  packages/project-scanner/src
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit scan orchestration**

```bash
git add packages/project-context/src/create-project-context-service.ts \
  packages/project-context/src/create-project-context-service.test.ts \
  packages/project-context/src/errors.ts \
  packages/project-context/src/index.ts
git commit -m "feat: orchestrate project component scans"
```

---

### Task 8: Add addressable catalog queries and fingerprint-bound mappings

**Files:**

- Create: `packages/project-context/src/query-project-context.ts`
- Create: `packages/project-context/src/query-project-context.test.ts`
- Create: `packages/project-context/src/mutate-mappings.ts`
- Create: `packages/project-context/src/mutate-mappings.test.ts`
- Modify: `packages/project-context/src/create-project-context-service.ts`
- Modify: `packages/project-context/src/index.ts`

**Interfaces:**

- Consumes: active validated effective catalog, human mapping store, selected pack vocabulary, and current fingerprint calculation.
- Produces additions to `ProjectContextService`:

```ts
search(input: {
  query?: string;
  semanticRole?: string;
  status?: "suggested" | "mapped" | "pack-owned";
  limit?: number;
}): Promise<ProjectComponentSearchResult>;

getComponentContract(input: {
  componentId: string;
}): Promise<ProjectComponentContractResult>;

getIconPaths(input: {
  names: readonly string[];
}): Promise<ProjectIconPathsResult>;

confirmMappings(input: {
  catalogFingerprint: string;
  mappings: readonly ProjectComponentMappingChange[];
}): Promise<ProjectMappingMutationResult>;

removeMappings(input: {
  catalogFingerprint: string;
  mappings: readonly ProjectComponentMappingChange[];
}): Promise<ProjectMappingMutationResult>;
```

- [ ] **Step 1: Write failing bounded search and contract tests**

Assert deterministic exact-role/name/alias/annotation/prop matching, score/order,
empty query validation, limit default 20 and maximum 50, total/returned/truncated
counts, and exact catalog fingerprint propagation. Prove a 168-result fixture
returns 50 and points to the active catalog rather than embedding full entries.

For exact contracts, assert verified import, normalized props, semantics,
annotations, restrictions, evidence, and fingerprint are returned. Missing IDs
must return `PROJECT_COMPONENT_NOT_FOUND`, not a nearest component.

- [ ] **Step 2: Write failing exact icon resolution tests**

Cover exact project export, exact confirmed alias, pack-owned exact icon,
ambiguous same-name exports from multiple selected sources, unresolved with
suggestions, duplicate request names, and maximum request size. Assert fuzzy
suggestions never populate the resolved import field.

- [ ] **Step 3: Write failing reviewed mutation tests**

```ts
await expect(
  service.confirmMappings({
    catalogFingerprint: oldFingerprint,
    mappings: [{
      componentId: appRadioGroupId,
      semanticRoles: ["choicePanel"],
      capabilities: ["single-selection", "value", "change"],
      formAdapters: ["controlled"],
    }],
  }),
).rejects.toMatchObject({ code: "PROJECT_COMPONENT_CATALOG_STALE" });
```

Also cover unknown role/capability/form adapter, unverified component, duplicate
change, idempotent confirmation, removal of one binding without deleting other
bindings, atomic human file preservation on failure, and new fingerprint after
successful rebuild.

- [ ] **Step 4: Run focused tests and verify failure**

```bash
pnpm vitest run packages/project-context/src/query-project-context.test.ts \
  packages/project-context/src/mutate-mappings.test.ts
```

Expected: FAIL because query and mutation services are absent.

- [ ] **Step 5: Implement deterministic queries**

Normalize search tokens with locale-independent lowercase, but score exact
semantic role and exact export above prefix/contained token matches. Use a fixed
score table:

```ts
const SCORE = {
  exactRole: 1000,
  exactExport: 900,
  exactAlias: 850,
  exportPrefix: 500,
  annotationToken: 300,
  propToken: 200,
} as const;
```

Sort by descending score then component ID. Clamp `limit` to 1..50 only after
schema validation. For icon resolution, index exact export/alias/pack names and
return explicit `resolved | ambiguous | unresolved` per request.

- [ ] **Step 6: Implement fingerprint-bound atomic mapping mutation**

Recompute current category hashes before changing the human file; compare the
overall fingerprint to input. Validate every term against selected packs and
the provider-neutral role vocabulary. Build the next mapping document in
memory, validate it, call the store's `replaceMappings` with the current
human-file hash, then run the same catalog rebuild/publication path used by
scan.

If rebuild fails, restore the prior mapping document with another
compare-and-swap call requiring the just-written hash before returning the
error; the active catalog must remain unchanged. Successful mutation returns
the mapping path, new catalog path/hash/fingerprint, and compact summary.

- [ ] **Step 7: Run query/mutation and orchestration regressions**

```bash
pnpm vitest run packages/project-context/src/query-project-context.test.ts \
  packages/project-context/src/mutate-mappings.test.ts \
  packages/project-context/src/create-project-context-service.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit addressable project context**

```bash
git add packages/project-context/src/query-project-context.ts \
  packages/project-context/src/query-project-context.test.ts \
  packages/project-context/src/mutate-mappings.ts \
  packages/project-context/src/mutate-mappings.test.ts \
  packages/project-context/src/create-project-context-service.ts \
  packages/project-context/src/index.ts
git commit -m "feat: query and map project components"
```

---

### Task 9: Expose project context through compact Qwen MCP tools

**Files:**

- Create: `extensions/qwen-cli/src/project-context-results.ts`
- Create: `extensions/qwen-cli/src/project-context-tools.ts`
- Create: `extensions/qwen-cli/tests/project-context-results.test.ts`
- Create: `extensions/qwen-cli/tests/project-context-tools.test.ts`
- Modify: `extensions/qwen-cli/src/server.ts`
- Modify: `extensions/qwen-cli/package.json`
- Modify: `extensions/qwen-cli/tests/server.test.ts`
- Modify: `extensions/qwen-cli/tests/stdio.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `ProjectContextService` from Task 8 and current Qwen adapter error/result conventions.
- Produces seven MCP tools with strict Zod input/output schemas and identical JSON in `content[0].text` and `structuredContent`:

```text
scan_project_components
project_component_search
get_component_contract
get_icon_paths
confirm_project_component_mappings
remove_project_component_mappings
get_project_ui_context_status
```

Extend the existing error type without collapsing actionable project-context
codes:

```ts
export type UigToolErrorCode =
  | "UIG_INPUT_INVALID"
  | "UIG_PROVIDER_CONFIG_MISSING"
  | "UIG_PROVIDER_FAILED"
  | "UIG_PACK_INVALID"
  | "UIG_RUN_INVALID"
  | "UIG_GENERATION_FAILED"
  | "UIG_FILESYSTEM_FAILED"
  | ProjectContextErrorCode;
```

The adapter preserves codes such as `PROJECT_COMPONENT_CATALOG_STALE`,
`CONFIG_PATH_OUTSIDE_WORKSPACE`, and `PROJECT_SCAN_ALREADY_RUNNING`, while
replacing unsafe internal messages with stable public messages.

- [ ] **Step 1: Write failing compact result tests**

In `project-context-results.test.ts`, parse canonical success/blocked/stale
fixtures, reject unknown fields and unsafe paths, cap results/diagnostics at 50,
and assert serialized results contain none of:

```text
PIXSO_ACCESS_TOKEN
rawDsl
/Users/
C:\\Users\\
component implementation source
```

- [ ] **Step 2: Write failing adapter delegation tests**

Inject a fixture `ProjectContextService` and assert exact arguments/delegation.
Prove the adapter anchors the service to dependency `workspaceDir` and
`extensionRoot`; inputs cannot override either. Expected domain `blocked`
results remain successful structured calls, while `ProjectContextError` becomes
a `UigToolError` preserving its stable `ProjectContextErrorCode` with a safe
message and no stack/path leakage.

- [ ] **Step 3: Write failing server list/call tests**

Update `server.test.ts` and `stdio.test.ts` to expect nine total UIG tools (the
two existing tools plus seven new tools), exact names, input/output schemas, and
one successful `get_project_ui_context_status` bundle call. Keep existing plan
and generation expectations byte-for-byte unchanged.

- [ ] **Step 4: Run focused extension tests and verify failure**

```bash
pnpm vitest run extensions/qwen-cli/tests/project-context-results.test.ts \
  extensions/qwen-cli/tests/project-context-tools.test.ts \
  extensions/qwen-cli/tests/server.test.ts
```

Expected: FAIL because the schemas/tools are absent and the server lists only
the existing tools.

- [ ] **Step 5: Implement Zod inputs and compact result projection**

Define strict schemas with safe relative paths, 64-character hashes, bounded
arrays, and discriminated status unions. Example scan input:

```ts
export const ProjectScanInputSchema = z
  .object({
    acceptDiscoveredConfig: z.boolean().optional(),
    discoveryId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    acceptedConfig: UiContextConfigInputSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.acceptDiscoveredConfig === true &&
      (!value.discoveryId || !value.acceptedConfig)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "discoveryId and acceptedConfig are required when accepting configuration",
      });
    }
  });
```

Mutation schemas require 64-character `catalogFingerprint`, non-empty bounded
mapping arrays, and no workspace path.

- [ ] **Step 6: Implement adapter tools and register them**

Create a `createProjectContextTools` wrapper that parses inputs and delegates to
the service. Extend `UigMcpToolHandlers` in `server.ts` with explicit methods and
register every tool using a common response helper generalized to all result
unions.

In `runQwenAdapter`, instantiate the project context service with:

```ts
const projectContext = createProjectContextService({
  workspaceDir: process.cwd(),
  extensionRoot,
});
```

Do not pass the Pixso token or Pixso client to project-context code.

- [ ] **Step 7: Run extension and existing tool regressions**

```bash
pnpm vitest run extensions/qwen-cli/tests/project-context-results.test.ts \
  extensions/qwen-cli/tests/project-context-tools.test.ts \
  extensions/qwen-cli/tests/server.test.ts \
  extensions/qwen-cli/tests/tools.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the MCP surface**

```bash
git add extensions/qwen-cli packages/project-context/package.json pnpm-lock.yaml
git commit -m "feat: expose project context to Qwen"
```

---

### Task 10: Add thin Qwen project-context commands and authority rules

**Files:**

- Create: `commands/uig/scan.md`
- Create: `commands/uig/components.md`
- Create: `commands/uig/map.md`
- Create: `commands/uig/status.md`
- Modify: `QWEN.md`
- Modify: `extensions/qwen-cli/tests/manifest.test.ts`

**Interfaces:**

- Consumes: the seven MCP tools from Task 9.
- Produces: user-invoked Qwen commands that orchestrate only those tools and
  never perform their own repository scan or direct `.ui-context` edits.

- [ ] **Step 1: Write failing manifest/command authority tests**

Extend `manifest.test.ts` to assert all four Markdown files exist and contain
the exact tool names. Add negative checks:

```ts
expect(scanCommand).toContain("scan_project_components");
expect(scanCommand).toContain("Do not search the repository yourself");
expect(mapCommand).toContain("explicit confirmation");
expect(mapCommand).toContain("confirm_project_component_mappings");
expect(componentsCommand).not.toContain("read_file");
expect(statusCommand).toContain("Do not run a scan automatically");
```

Assert `QWEN.md` still contains the existing Pixso/generation prohibitions and
adds project-context rules without replacing them.

- [ ] **Step 2: Run the focused command test and verify failure**

```bash
pnpm vitest run extensions/qwen-cli/tests/manifest.test.ts
```

Expected: FAIL because the commands do not exist.

- [ ] **Step 3: Create `/uig:scan`**

Write `commands/uig/scan.md` with this workflow, using normal prose around the
exact requirements:

```markdown
# Prepare project UI context

Call `scan_project_components` with no arguments.

If status is `needs-configuration`, show every proposed component/icon facade,
import source, and selected design-system pack. Ask for explicit confirmation.
Only after confirmation call `scan_project_components` again with
`acceptDiscoveredConfig: true`, the exact returned `discoveryId`, and the exact
reviewed `acceptedConfig`. The user may correct roots or selected packs before
confirmation; do not edit context files directly.

If status is `completed`, report catalog path/fingerprint, verified component
and icon counts, mapped/suggested counts, warning count, and the exact next
command. If blocked, report compact diagnostics and durable path.

Do not search the repository yourself, edit `.ui-context`, call Pixso, generate
source, retry a blocker, or weaken validation.
```

- [ ] **Step 4: Create query, mapping, and status commands**

`components.md` parses `{{args}}`, uses `project_component_search`, and calls
`get_component_contract` only for one exact result. `map.md` first searches and
shows exact import, role/capability/form-adapter changes, evidence, and effect;
it asks for explicit confirmation before calling add/remove mutation tools with
the returned current fingerprint. `status.md` calls only
`get_project_ui_context_status` and reports the next action.

None of the commands may ask Qwen to read the complete catalog file.

- [ ] **Step 5: Extend `QWEN.md` without changing current generation authority**

Add a short block:

```markdown
For project-aware UI context, use the bundled project-context MCP tools.
Never replace `/uig:scan` with repository search and never edit
`.ui-context/*.json` directly. `suggested` mappings are not generation
authority; only user-confirmed `mapped` or pack-owned facts may be treated as
resolved. `/uig:status` is read-only.
```

Retain the existing rules that `/uig:plan` and `/uig:generate` remain the only
Pixso-to-React planning/generation tools and that Qwen must not repair generated
source.

- [ ] **Step 6: Run command and extension manifest tests**

```bash
pnpm vitest run extensions/qwen-cli/tests/manifest.test.ts
pnpm format:check
```

Expected: PASS.

- [ ] **Step 7: Commit Qwen commands**

```bash
git add commands/uig/scan.md commands/uig/components.md \
  commands/uig/map.md commands/uig/status.md QWEN.md \
  extensions/qwen-cli/tests/manifest.test.ts
git commit -m "feat: add Qwen project context commands"
```

---

### Task 11: Add the end-to-end project-context acceptance fixture

**Files:**

- Create: `fixtures/projects/project-context-basic/package.json`
- Create: `fixtures/projects/project-context-basic/pnpm-lock.yaml`
- Create: `fixtures/projects/project-context-basic/tsconfig.json`
- Create: `fixtures/projects/project-context-basic/src/react-shim.d.ts`
- Create: `fixtures/projects/project-context-basic/src/shared/ui/index.ts`
- Create: `fixtures/projects/project-context-basic/src/shared/ui/AppRadioGroup.tsx`
- Create: `fixtures/projects/project-context-basic/src/shared/ui/Button.tsx`
- Create: `fixtures/projects/project-context-basic/src/shared/ui/InternalOption.tsx`
- Create: `fixtures/projects/project-context-basic/src/shared/icons/index.ts`
- Create: `fixtures/projects/project-context-basic/src/shared/icons/Upload.tsx`
- Create: `fixtures/projects/project-context-basic/src/components/index.ts`
- Create: `fixtures/projects/project-context-basic/src/components/FilterPanel.tsx`
- Create: `packages/project-context/src/project-context-acceptance.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: the real scanner, store, pack loader, service, query, and mutation code.
- Produces: a network-free acceptance test proving the complete first-slice workflow from discovery through stale/broken mapping behavior.

- [ ] **Step 1: Create a failing acceptance skeleton around a copied fixture**

The test copies the committed fixture into a temporary directory so `.ui-context`
and source mutations never dirty the repository:

```ts
it("prepares and maintains one project component catalog", async () => {
  const workspace = await copyAcceptanceProject();
  const service = createProjectContextService({
    workspaceDir: workspace,
    extensionRoot: repositoryRoot,
    now: () => new Date("2026-08-02T00:00:00.000Z"),
  });

  const discovered = await service.scan({});
  expect(discovered.status).toBe("needs-configuration");
  expect(await pathExists(join(workspace, ".ui-context"))).toBe(false);

  const scanned = await service.scan({
    acceptDiscoveredConfig: true,
    discoveryId: discovered.discoveryId,
    acceptedConfig: discovered.proposedConfig,
  });
  expect(scanned.status).toBe("completed");
});
```

- [ ] **Step 2: Add the exact fixture public/private contracts**

`src/shared/ui/index.ts` exports `AppRadioGroup` and `Button` but not
`InternalOption`. `AppRadioGroupProps` includes `options`, `value`, and
`onChange`; `Upload` is exported only from the icon facade; `FilterPanel` is
exported from `@/components`. Configure `@/* -> src/*` in tsconfig and include
`src/react-shim.d.ts` with the exact minimal `react`/`JSX` declarations used by
these fixture components so the acceptance test never installs packages.

The lockfile must be deterministic fixture data with no credentials, remote
fetch requirement, or host path.

- [ ] **Step 3: Complete all ten approved acceptance assertions**

In one ordered test or focused ordered tests, prove:

1. discovery writes nothing;
2. confirmation creates four human JSON files, managed `.gitignore`, and five generated artifacts;
3. `AppRadioGroup`, `Button`, `FilterPanel`, and `Upload` are verified while `InternalOption` is absent;
4. unchanged rescan keeps the same content fingerprint;
5. `AppRadioGroup -> choicePanel` is initially only suggested;
6. confirmed mapping becomes `mapped`, confidence 1, with a new fingerprint;
7. changing `AppRadioGroupProps` makes status stale and rejects old-fingerprint mutation;
8. rescan publishes a new ready fingerprint;
9. removing `AppRadioGroup` from the facade while retaining mapping blocks with `MAPPING_TARGET_NOT_FOUND` and preserves the prior active catalog bytes;
10. generated artifacts contain no absolute fixture root or sentinel secret.

- [ ] **Step 4: Add a focused acceptance script and run it red**

Add to root `package.json` without removing existing tests:

```json
"test:project-context-acceptance": "vitest run packages/project-context/src/project-context-acceptance.test.ts"
```

Run:

```bash
pnpm test:project-context-acceptance
```

Expected before fixture/service completion: FAIL at the first missing or
incorrect workflow assertion.

- [ ] **Step 5: Finish the fixture/test helpers and run green**

Use `fs.cp` into `mkdtemp`, clean in `afterEach`, mutate only the temporary
facade/prop files, and read catalogs through `ProjectContextStore` rather than
unvalidated `JSON.parse` in assertions where integrity matters.

Run:

```bash
pnpm test:project-context-acceptance
pnpm test:acceptance
```

Expected: PASS, including existing modal and choice-panel generation acceptance.

- [ ] **Step 6: Commit the acceptance fixture**

```bash
git add fixtures/projects/project-context-basic \
  packages/project-context/src/project-context-acceptance.test.ts package.json
git commit -m "test: cover project component context workflow"
```

---

### Task 12: Rebuild the portable extension, document usage, and verify release gates

**Files:**

- Modify: `extensions/qwen-cli/tests/install-smoke.test.ts`
- Modify: `extensions/qwen-cli/tests/stdio.test.ts`
- Modify: `scripts/verify-qwen-extension-bundle.ts`
- Modify: `dist/qwen-adapter.mjs` (generated only)
- Modify: `dist/qwen-adapter.provenance.json` (generated only)
- Modify: `README.md`

**Interfaces:**

- Consumes: all completed project-context packages/tools/commands.
- Produces: a self-contained extension install whose bundled server exposes all nine tools and a documented, verified Qwen-only scan workflow.

- [ ] **Step 1: Add failing install-copy project-context smoke coverage**

Extend `install-smoke.test.ts` so the copied extension contains only installable
files, no workspace `node_modules` or TypeScript source dependency, starts the
bundle in a temporary fixture workspace, and successfully calls
`get_project_ui_context_status`. Assert it returns `missing` before scan and
that `tools/list` contains all nine tools.

- [ ] **Step 2: Extend bundle verification leakage markers**

Update `verify-qwen-extension-bundle.ts` to reject project fixture source,
`.ui-context` generated artifacts, absolute project paths, sentinel secrets,
source maps, and unbundled `typescript` runtime resolution. Keep existing Pixso
token and reproducibility checks.

- [ ] **Step 3: Run bundle/install tests and verify the committed bundle is stale**

```bash
pnpm test:qwen-extension
pnpm verify:qwen-extension-bundle
```

Expected: source tests may pass, but bundle verification fails because the
committed adapter does not yet contain the seven new tools.

- [ ] **Step 4: Rebuild the committed Qwen adapter**

```bash
pnpm build:qwen-extension
```

Do not hand-edit `dist/qwen-adapter.mjs` or provenance. Inspect the generated
provenance and confirm it contains no timestamp or machine path.

- [ ] **Step 5: Document the Qwen-only project-context workflow**

Add README sections for:

```text
/uig:scan
/uig:components [query|suggested|role=...]
/uig:map <component> <role>
/uig:status
```

Document first-run facade confirmation, `.ui-context` human/generated ownership,
the managed ignore file, exact public imports, mapping trust states, stale
diagnostics, no user-facing scan CLI, no Pixso requirement for scan, and the
deferred fact that `uig_plan` does not consume the project catalog in this slice.

- [ ] **Step 6: Run focused and full automated verification**

```bash
pnpm test:project-context-acceptance
pnpm test:qwen-extension
pnpm test:acceptance
pnpm verify
```

Expected: all commands PASS. Record the final Vitest file/test counts and bundle
SHA-256 in the execution handoff.

- [ ] **Step 7: Run the real linked-Qwen smoke**

Link the current checkout using the already supported extension workflow, open
a disposable copy of `fixtures/projects/project-context-basic`, and run:

```text
/uig:scan
confirm proposed configuration
/uig:status
/uig:components AppRadioGroup
/uig:map AppRadioGroup choicePanel
confirm mapping
/uig:status
```

Expected: Qwen calls bundled tools rather than searching/editing directly;
status moves `missing -> ready`, mapping becomes confirmed, the final catalog
has a new fingerprint, and no application source changes. This smoke requires
no Pixso token or network access.

- [ ] **Step 8: Review the final diff for scope and generated artifacts**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff --name-only
```

Confirm no resolver/generator/Pixso behavior changed, no fixture `.ui-context`
escaped temporary tests, no `.DS_Store` is staged, and only the expected bundle
artifacts are generated.

- [ ] **Step 9: Commit documentation and portable bundle**

```bash
git add README.md extensions/qwen-cli/tests/install-smoke.test.ts \
  extensions/qwen-cli/tests/stdio.test.ts \
  scripts/verify-qwen-extension-bundle.ts \
  dist/qwen-adapter.mjs dist/qwen-adapter.provenance.json
git commit -m "docs: ship Qwen project component scan"
```

- [ ] **Step 10: Request final code review before integration**

Use `superpowers:requesting-code-review` against the complete implementation
range. Require reviewers to check spec coverage, filesystem containment,
suggestion non-authority, mutation rollback, Qwen command/tool boundaries,
existing generation parity, and full verification evidence. Address accepted
findings through `superpowers:receiving-code-review`, rerun `pnpm verify`, and
only then use `superpowers:finishing-a-development-branch` for integration.
