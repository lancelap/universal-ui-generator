# Qwen Project Component Context Design

**Date:** 2026-08-02  
**Status:** approved design, awaiting written-spec review  
**Repository:** `https://github.com/lancelap/universal-ui-generator`  
**Extends:**

- `2026-07-26-universal-ui-generator-design.md`
- `2026-07-27-qwen-cli-extension-design.md`
- `2026-07-29-structural-choice-panel-sber-recipe-design.md`

## 1. Outcome

Add a deterministic project-context preparation layer to the existing Qwen Code
extension. The user prepares a React/TypeScript project with:

```text
/uig:scan
```

The extension discovers verified public React components and icons, extracts
their TypeScript contracts, applies human-owned semantic mappings and policies,
and publishes an addressable effective component catalog under `.ui-context`.

The target architecture is:

```text
Pixso semantic manifest
            +
effective project component catalog
            +
verified design-system pack
            ↓
resolved implementation plan
            ↓
Qwen generates project-aware code
```

This specification implements only the project-context preparation slice. It
does not yet change the current resolution plan or React generator.

## 2. Approved product boundary

The first slice provides these Qwen commands:

```text
/uig:scan
/uig:components
/uig:map
/uig:status
```

They call tools exposed by the bundled `uig` MCP server. No new user-facing
`uig scan` CLI command is added. The existing repository CLI remains untouched
for its current planning, generation, fixtures, and tests.

The slice provides these MCP tools:

```text
scan_project_components
project_component_search
get_component_contract
get_icon_paths
confirm_project_component_mappings
remove_project_component_mappings
get_project_ui_context_status
```

The existing tools remain behaviorally unchanged:

```text
uig_plan
uig_generate
```

## 3. Non-goals

This slice does not:

- call Pixso while scanning a project;
- retrieve or normalize Pixso DSL;
- change `uig_plan` resolution precedence yet;
- change generated TSX or CSS;
- implement business logic or API binding;
- scan all of `src` implicitly;
- index hooks, stores, services, or arbitrary constants;
- index design tokens or CSS variables;
- use embeddings or a second LLM;
- execute Storybook or project JavaScript;
- install dependencies or run package scripts;
- create missing public facade files;
- enable semantic suggestions for automatic resolution.

## 4. Qwen and Pixso boundary

The Pixso Remote MCP may be configured separately in Qwen for manual design
inspection. Production `/uig:plan` continues to call the bundled `uig_plan`
tool, whose existing compact Pixso proxy retrieves and stores the raw response
without routing a very large DSL through model reasoning.

```text
manual design question:
Qwen -> configured Pixso Remote MCP

deterministic generation workflow:
Qwen -> bundled UIG MCP -> Pixso Remote MCP endpoint
```

The token remains a sensitive extension setting exposed to the bundled MCP as
`PIXSO_ACCESS_TOKEN`. It must never be written to `.ui-context`, `.uig`, command
output, diagnostics, or repository files.

For this scan slice, Pixso and `PIXSO_ACCESS_TOKEN` are not used at all.

## 5. Trust model

Technical availability and semantic meaning are separate dimensions.

Technical availability:

```text
verified | unavailable
```

Semantic status:

```text
suggested | mapped | pack-owned
```

Definitions:

- `verified` means the public export, import source, and TypeScript contract are
  proven from the current project or installed package;
- `suggested` is a deterministic semantic proposal derived from names, types,
  props, JSDoc, or known composition, but is not authority for generation;
- `mapped` is a human-confirmed project semantic or exact design mapping;
- `pack-owned` is a verified mapping or recipe owned by a design-system pack.

Future automatic resolution may use only:

```text
availability = verified
AND
semantics.status IN (mapped, pack-owned)
```

`suggested` remains non-authoritative regardless of its numeric confidence.
The v1 schema does not expose a supported aggressive mode.

## 6. Context layers and ownership

Project context is split into human-owned and generated layers.

```text
.ui-context/
├── .gitignore
├── config.json
├── mappings.json
├── annotations.json
├── policies.json
└── generated/
    ├── project-scan.json
    ├── installed-packages.json
    ├── public-components.json
    ├── effective-component-catalog.json
    └── diagnostics.json
```

Commit by default:

```text
.ui-context/.gitignore
.ui-context/config.json
.ui-context/mappings.json
.ui-context/annotations.json
.ui-context/policies.json
```

Ignore by default:

```text
.ui-context/generated/
```

The generated catalog is reproducible local evidence. Configuration, mappings,
annotations, and policies are reviewable project decisions.

The MCP creates `.ui-context/.gitignore` with exactly:

```gitignore
generated/
```

This managed file makes the approved ignore policy effective without modifying
the project's root `.gitignore`.

## 7. Configuration contract

`config.json` uses schema `ui-context-config/v1`:

```json
{
  "schema": "ui-context-config/v1",
  "framework": "react",
  "language": "typescript",
  "designSystemPacks": ["sber-space-ui"],
  "componentRoots": [
    {
      "path": "src/shared/ui",
      "entry": "src/shared/ui/index.ts",
      "importSource": "@/shared/ui"
    },
    {
      "path": "src/components",
      "entry": "src/components/index.ts",
      "importSource": "@/components"
    }
  ],
  "iconRoots": [
    {
      "path": "src/shared/icons",
      "entry": "src/shared/icons/index.ts",
      "importSource": "@/shared/icons"
    }
  ],
  "workspacePackages": {
    "discovery": "public-exports"
  },
  "ignore": [
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.stories.*",
    "**/__fixtures__/**",
    "**/__mocks__/**"
  ]
}
```

Every root is a public-facade contract, not merely a search directory:

- `path` bounds source discovery;
- `entry` identifies the only application-level public export graph;
- `importSource` is the exact source future generated code must import;
- `importSource` must resolve to `entry` through TypeScript path mapping or a
  workspace package export;
- separate `iconRoots` prevent a component name heuristic from silently
  declaring semantic icons.

`designSystemPacks` lists every bundled pack whose verified catalog, semantic
vocabulary, recipes, icons, and hash may contribute to the effective project
catalog. First-run discovery proposes pack IDs from installed dependencies; it
does not download packs. Multiple configured packs are allowed and remain
separate evidence sources.

All paths are workspace-relative. Absolute paths, `..`, and symlink escapes are
invalid.

## 8. Human-owned mappings

`mappings.json` uses schema `project-component-mappings/v1`:

```json
{
  "schema": "project-component-mappings/v1",
  "components": [
    {
      "componentId": "project:@app/shared-ui#AppRadioGroup",
      "semanticRoles": ["choicePanel"],
      "capabilities": ["single-selection", "value", "change"],
      "formAdapters": ["controlled"],
      "status": "mapped"
    }
  ],
  "designComponents": [
    {
      "provider": "pixso",
      "designSystem": "sber-space-ui",
      "componentKey": "radio-group-key",
      "componentId": "project:@app/shared-ui#AppRadioGroup",
      "status": "mapped"
    }
  ]
}
```

Semantic mappings connect a provider-neutral role to a verified project
component. Exact design mappings connect a stable provider component key to a
verified project component. `/uig:scan` validates both forms without calling
the provider.

Unknown semantic roles, capabilities, and form adapters are rejected. V1
accepts semantic roles already defined by the provider-neutral UI manifest and
capabilities/form adapters already defined by the selected design-system pack
contracts. `single-selection-collection` remains a render-recipe kind; it is
not incorrectly registered as a UI semantic role. For the currently recognized
compound, the semantic role is `choicePanel`.

## 9. Annotations and policies

`annotations.json` uses schema `project-component-annotations/v1`. It attaches
summary, usage instructions, restrictions, and reviewed examples to an existing
component ID. An annotation does not itself create a semantic mapping.

```json
{
  "schema": "project-component-annotations/v1",
  "components": [
    {
      "componentId": "project:@app/shared-ui#AppRadioGroup",
      "summary": "Single-selection option group",
      "usage": ["Pass stable option IDs"],
      "restrictions": ["Do not use for multiple selection"],
      "examples": [
        {
          "name": "controlled",
          "code": "<AppRadioGroup options={options} value={value} onChange={setValue} />"
        }
      ]
    }
  ]
}
```

`policies.json` uses schema `project-component-policies/v1`:

```json
{
  "schema": "project-component-policies/v1",
  "resolution": {
    "allowSuggested": false,
    "allowNativeFallback": false,
    "preferProjectComponents": true
  },
  "components": {
    "excluded": [],
    "deprecatedAllowed": false
  },
  "imports": {
    "preferPublicFacades": true,
    "allowDeepImports": false
  }
}
```

V1 schemas require `allowSuggested: false`, `allowDeepImports: false`, and
`preferPublicFacades: true`. Unsupported unsafe values are rejected rather than
accepted and ignored.

## 10. Public component identity and contract

A stable project component ID is derived from the public import identity, not
the internal source path:

```text
project:<package-or-project-name>#<public-export>
```

Examples:

```text
project:@app/shared-ui#AppRadioGroup
project:@company/ui#Button
project:customer-portal#FilterPanel
```

An internal file move therefore does not invalidate mappings while the public
export remains stable.

An entry in `public-components.json` has this conceptual shape:

```json
{
  "id": "project:@app/shared-ui#AppRadioGroup",
  "kind": "react-component",
  "framework": "react",
  "availability": "verified",
  "import": {
    "source": "@/shared/ui",
    "export": "AppRadioGroup",
    "style": "named"
  },
  "contract": {
    "propsType": "AppRadioGroupProps",
    "acceptsChildren": false,
    "props": [
      {
        "name": "options",
        "required": true,
        "type": {
          "kind": "array",
          "element": {
            "kind": "reference",
            "name": "RadioOption"
          }
        }
      },
      {
        "name": "value",
        "required": true,
        "type": { "kind": "string" }
      },
      {
        "name": "onChange",
        "required": true,
        "type": {
          "kind": "function",
          "parameters": [
            {
              "name": "value",
              "type": { "kind": "string" }
            }
          ],
          "returns": { "kind": "void" }
        }
      }
    ]
  },
  "semantics": [
    {
      "role": "choicePanel",
      "status": "suggested",
      "confidence": 0.86,
      "evidence": [
        { "kind": "component-name", "value": "AppRadioGroup" },
        { "kind": "prop-shape", "value": "options,value,onChange" }
      ]
    }
  ],
  "evidence": [
    {
      "kind": "public-export",
      "path": "src/shared/ui/index.ts",
      "export": "AppRadioGroup"
    },
    {
      "kind": "typescript-contract",
      "path": "src/shared/ui/AppRadioGroup.tsx",
      "symbol": "AppRadioGroupProps"
    }
  ]
}
```

The exact import facade is authoritative. A verified component may not be
rewritten to an internal deep import.

## 11. Scanner algorithm

The scanner is deterministic and uses the TypeScript Compiler API.

```text
workspace/package metadata
        ↓
tsconfig and module resolution
        ↓
configured public entries and package exports
        ↓
exported symbol and alias resolution
        ↓
TypeScript type checker
        ↓
normalized component and icon contracts
        ↓
deterministic semantic suggestions
```

### 11.1 Project discovery

The scanner detects `package.json`, pnpm/npm/yarn lockfiles, workspace layout,
React and TypeScript versions, `tsconfig`, `baseUrl`, `paths`, package exports,
and installed UI packages.

Multiple competing lockfiles are blocking (`MULTIPLE_LOCKFILES_FOUND`). Bun is
not claimed in v1 (`PACKAGE_MANAGER_UNSUPPORTED`). The scanner never installs
missing packages.

### 11.2 Workspace packages

Workspace packages are scanned automatically through public `exports`,
`types`, or `typings`. Internal source files that are not reachable from public
package entries are not catalog entries.

The scanner checks, in order:

1. `exports.types`;
2. package `types` or `typings`;
3. an explicit TypeScript source export;
4. an unambiguous workspace source entry corresponding to a public export;
5. otherwise `PUBLIC_TYPES_ENTRY_NOT_FOUND`.

It does not run a package build.

### 11.3 Application components

Only symbols re-exported by a configured application `entry` are public.
Files merely present below `path` are not automatically cataloged.

Missing facade and import mismatch are blocking:

```text
PUBLIC_FACADE_NOT_FOUND
PUBLIC_IMPORT_SOURCE_UNRESOLVED
PUBLIC_IMPORT_SOURCE_MISMATCH
```

### 11.4 React component proof

The scanner recognizes function components, arrow components, `React.FC`,
`forwardRef`, `memo`, and their verified compositions. PascalCase alone is not
proof. A normal exported function must not become a UI component merely because
of its name.

### 11.5 Prop normalization

V1 normalizes strings, numbers, booleans, literals, literal unions, arrays,
tuples, objects, callbacks, React nodes/elements, and component references.

Types that cannot be represented safely become explicit opaque contracts:

```json
{
  "kind": "opaque",
  "displayName": "Props<T>",
  "reason": "generic-contract-not-fully-materialized"
}
```

An opaque type produces `COMPONENT_PROP_TYPE_OPAQUE` warning. It does not make
the public export unavailable, but a future resolver may block when it cannot
safely populate a required opaque prop.

### 11.6 Icons

An icon is technically available only through a configured public icon facade,
a verified icon package export, or a pack-owned icon catalog. Exact names and
confirmed aliases may resolve. Fuzzy matches are suggestions only and cannot be
returned as resolved import paths.

### 11.7 Semantic suggestions

Suggestions use deterministic evidence only: export names, props type names,
prop shapes, literal variants, JSDoc, verified component composition, shared
semantic aliases, and exact pack rules. No LLM or embedding index participates.

## 12. Effective catalog

`effective-component-catalog.json` uses schema
`effective-component-catalog/v1` and combines:

```text
verified installed library facts
+ verified public project components
+ human mappings
+ annotations
+ project policies
+ design-system packs
```

Its conceptual top-level shape is:

```json
{
  "schema": "effective-component-catalog/v1",
  "framework": "react",
  "language": "typescript",
  "fingerprint": {
    "algorithm": "sha256",
    "value": "<64 lowercase hex characters>",
    "inputs": {
      "config": "<sha256>",
      "project": "<sha256>",
      "mappings": "<sha256>",
      "annotations": "<sha256>",
      "policies": "<sha256>",
      "lockfile": "<sha256>",
      "designSystemPacks": {
        "sber-space-ui@2.0.0": "<sha256>"
      }
    }
  },
  "sources": [],
  "components": [],
  "icons": [],
  "diagnostics": [],
  "summary": {
    "verifiedComponents": 0,
    "mappedRoles": 0,
    "suggestedRoles": 0,
    "verifiedIcons": 0,
    "warnings": 0
  }
}
```

The fingerprint includes configuration, lockfile, installed versions, public
export graphs, normalized contracts, human files, and selected pack versions
and hashes. Operational time such as `generatedAt` does not affect it. Stable
JSON canonicalization makes key ordering irrelevant.

## 13. Atomic publication and stale detection

Generated supporting artifacts are written and validated first. The effective
catalog is written through a safe temporary file and renamed last. It is the
authoritative publication point and contains hashes of the supporting
artifacts.

On failure:

- the incomplete catalog is not published;
- the previous valid catalog remains on disk;
- diagnostics identify the failed stage and durable path;
- `/uig:status` still marks the previous catalog stale when its fingerprint no
  longer matches the current project.

Concurrent scans are serialized with a safe workspace-local scan reservation.
An active concurrent scan returns `PROJECT_SCAN_ALREADY_RUNNING`. A lock is not
removed solely because of age; recovery must prove that its process and staging
operation are absent.

## 14. MCP tool contracts

### 14.1 `scan_project_components`

With no configuration, the tool performs read-only discovery and returns:

```json
{
  "status": "needs-configuration",
  "discoveryId": "discovery_<hash>",
  "proposedConfig": {},
  "diagnostics": []
}
```

It writes nothing. After user review, Qwen calls:

```json
{
  "acceptDiscoveredConfig": true,
  "discoveryId": "discovery_<hash>"
}
```

The tool rejects a changed discovery with `SCAN_DISCOVERY_STALE`. On success it
creates the managed `.ui-context/.gitignore` and missing human-owned JSON files,
scans the project, publishes generated artifacts, and returns only compact
summary, paths, hashes, and diagnostic counts.

Subsequent calls use the existing config without another confirmation.

### 14.2 `project_component_search`

Search supports text, exact semantic role, and a bounded result limit. Search
is deterministic and uses roles, export names, aliases, annotations, and prop
names. The maximum returned result count is 50. Results include total count and
`truncated`.

### 14.3 `get_component_contract`

Returns one exact component's verified import, normalized props, semantic
statuses, annotations, restrictions, evidence, and current catalog fingerprint.

### 14.4 `get_icon_paths`

Returns only exact verified exports, exact confirmed aliases, or pack-owned
mappings. Multiple candidates are `ambiguous`; absent candidates are
`unresolved`. Similar names may be listed as suggestions but never promoted to
resolved.

### 14.5 Mapping mutation tools

`confirm_project_component_mappings` and
`remove_project_component_mappings` require:

- explicit prior user confirmation;
- current catalog fingerprint;
- verified component IDs;
- known provider-neutral semantic roles and known pack capabilities/form
  adapters.

They atomically update only `.ui-context/mappings.json`, rebuild the effective
catalog, and return the new fingerprint. Stale input is rejected with
`PROJECT_COMPONENT_CATALOG_STALE`.

### 14.6 `get_project_ui_context_status`

Returns `ready`, `missing`, `stale`, or `blocked`, config/catalog paths,
fingerprint, compact summary, and changed fingerprint categories. It does not
start a scan automatically.

Expected project states (`needs-configuration`, `completed`, `blocked`) are
structured domain results. Malformed tool input, containment failures,
unrecoverable filesystem failures, schema corruption, and unexpected adapter
failures use MCP `isError: true`.

## 15. Qwen command behavior

### 15.1 `/uig:scan`

The command must call the scanner tool and must not replace it with model-driven
repository search. On first use it shows the proposed public roots and asks for
confirmation. It does not generate source.

### 15.2 `/uig:components`

The command uses addressable search and contract tools. It never reads or dumps
the entire generated catalog into model context.

### 15.3 `/uig:map`

The command first displays the exact component, import, role, evidence, and
effect of the mapping. It calls a mutation tool only after explicit user
confirmation. Exact Pixso mapping creation is deferred to the resolver slice.

### 15.4 `/uig:status`

The command reports project-context readiness and the exact next action. It does
not silently rescan or repair the project.

Commands prohibit Qwen from directly editing human context JSON, creating
facades, changing `tsconfig`, installing packages, changing application source,
or weakening policies.

## 16. Future resolution precedence

The next resolver slice will use this precedence:

1. exact project design mapping;
2. explicit project semantic mapping;
3. verified project composition;
4. exact design-system pack mapping;
5. design-system semantic candidate;
6. allowed pack-owned composition;
7. explicitly allowed fallback;
8. ambiguous, unresolved, or blocked.

This precedence is documented now so the catalog captures the required
evidence, but it is not wired into `uig_plan` in this slice.

## 17. Security requirements

The scanner is read-only outside `.ui-context`. It must not execute project
code, scripts, configuration JavaScript, custom transformers, Storybook, or
React rendering. It performs no network calls.

Filesystem requirements:

- the workspace realpath is the only writable authority root;
- reads are limited to the contained workspace dependency graph and immutable
  extension-owned design-system pack roots;
- a dependency symlink that resolves to an arbitrary path outside the workspace
  is rejected in v1 rather than followed;
- every configured and discovered path is containment-checked;
- symlink escape is rejected;
- `.ui-context` and publication destinations are checked against replacement;
- artifacts contain workspace-relative paths only;
- absolute home paths and environment values are absent;
- suspicious secret-bearing fields cause fail-closed artifact validation.

The full catalog is never returned through MCP. Results remain compact and
point to durable local artifacts.

## 18. Diagnostics

Diagnostics use `info`, `warning`, `error`, and `fatal` severities.

Representative non-blocking diagnostics:

```text
COMPONENT_SEMANTIC_SUGGESTION_CREATED
COMPONENT_PROP_TYPE_OPAQUE
COMPONENT_JSDOC_MISSING
ICON_SEMANTICS_UNKNOWN
```

Representative blocking diagnostics:

```text
UI_CONTEXT_CONFIG_INVALID
CONFIG_PATH_OUTSIDE_WORKSPACE
CONFIG_SYMLINK_ESCAPES_WORKSPACE
MULTIPLE_LOCKFILES_FOUND
PUBLIC_FACADE_NOT_FOUND
PUBLIC_IMPORT_SOURCE_UNRESOLVED
PUBLIC_IMPORT_SOURCE_MISMATCH
PUBLIC_TYPES_ENTRY_NOT_FOUND
DUPLICATE_COMPONENT_ID
MAPPING_TARGET_NOT_FOUND
SEMANTIC_ROLE_UNKNOWN
PROJECT_SCAN_ALREADY_RUNNING
PROJECT_COMPONENT_CATALOG_STALE
CATALOG_ATOMIC_WRITE_FAILED
```

Diagnostics returned to Qwen are bounded and include total count, returned
count, truncation state, and durable artifact path.

## 19. Test strategy

### 19.1 Contract tests

Add closed TypeBox schemas and integrity tests for all human and generated
formats. Reject unknown fields, unsafe paths, invalid hashes, invalid roles,
unsafe policy values, duplicate IDs, missing references, and incorrect summary
counts.

### 19.2 Scanner tests

Cover function, arrow, `React.FC`, `forwardRef`, `memo`, nested re-exports,
default and named exports, false-positive PascalCase functions, required and
optional props, unions, arrays, tuples, callbacks, React nodes, intersections,
generics, opaque types, deprecated/JSDoc metadata, and cyclic references.

Cover public facade inclusion/exclusion, TypeScript aliases, workspace package
exports and subpaths, missing `.d.ts`, duplicate public identity, exact icons,
icon aliases, ambiguity, and internal icons.

### 19.3 Security tests

Cover Unix/Windows traversal and absolute paths, symlink escape for roots and
destinations, destination replacement, malformed JSON, concurrent scans, stale
locks, forbidden source writes, absence of absolute paths and secrets, and
proof that no package scripts or network clients are invoked.

### 19.4 Catalog tests

Cover deterministic merge, `verified + mapped`, non-authoritative suggestions,
missing mapping targets, annotations, exclusions, public-facade import policy,
deprecation policy, deterministic fingerprints, and fingerprint changes for
contracts, lockfiles, mappings, annotations, policies, and pack hashes.

### 19.5 MCP and extension tests

Validate every input/output schema, `structuredContent`, compact text content,
error serialization, truncation, artifact paths, fingerprint propagation,
manifest command discovery, command-to-tool routing, bundled build provenance,
stdio behavior, and install smoke without monorepo sources or `node_modules`.

Existing `uig_plan` and `uig_generate` parity and acceptance tests must remain
unchanged and green.

## 20. Acceptance fixture and scenario

Add a small React/TypeScript project fixture with public UI and icon facades,
`AppRadioGroup`, `Button`, `FilterPanel`, `Upload`, and a non-exported
`InternalOption`.

Acceptance sequence:

1. first scan returns `needs-configuration` and writes nothing;
2. confirmed discovery creates the four human-owned JSON files, the managed
   `.ui-context/.gitignore`, and generated artifacts;
3. public components and icon are verified, while `InternalOption` is absent;
4. an unchanged rescan produces the same content fingerprint;
5. `AppRadioGroup` is only `suggested` initially;
6. explicit mapping confirmation changes it to `mapped` and publishes a new
   fingerprint;
7. a props change makes status stale and rejects old-fingerprint mutation;
8. rescan publishes a new valid fingerprint;
9. removing the public export while retaining the mapping blocks publication
   with `MAPPING_TARGET_NOT_FOUND`;
10. all existing Pixso planning, modal, choice-panel, and React generation
    acceptance tests remain green.

## 21. Verification gates

The implementation is not complete until these pass:

```bash
pnpm test:qwen-extension
pnpm test:acceptance
pnpm verify
```

Then perform a real linked-extension smoke in the fixture project:

```text
/uig:scan
confirm proposed configuration
/uig:status
/uig:components AppRadioGroup
/uig:map AppRadioGroup choicePanel
/uig:status
```

The smoke requires no Pixso token, network access, source generation, or source
modification.

## 22. Definition of done

The slice is complete only when:

- the Qwen extension exposes the four project-context commands;
- scan is deterministic, offline, and LLM-free;
- project components and icons are derived only from proven public facades;
- exact import sources and TypeScript props are validated;
- semantic suggestions remain non-authoritative;
- mapping changes require user review and current fingerprint;
- human and generated context layers remain separate;
- catalog publication is fail-closed and atomic at its authority point;
- stale context is detected with actionable diagnostics;
- Qwen consumes bounded addressable results rather than a full catalog;
- no application source or project configuration is modified;
- existing planning and generation behavior remains unchanged;
- the bundled extension passes install and stdio smoke tests;
- the complete repository `pnpm verify` passes;
- the real `/uig:scan` Qwen smoke succeeds.

## 23. Deferred follow-up

After this spec is implemented and reviewed, a separate design/plan will wire
the effective project catalog into `uig_plan`, add project-aware resolution
sources to `resolution-plan/v2` or its successor, support exact Pixso mapping
confirmation from a planning run, and then allow Qwen generation to reuse
verified project components.
