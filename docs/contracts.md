# Artifact contracts

The pipeline has versioned public transformation boundaries. Each boundary is
closed to unknown properties, validated before handoff, and serialized with
stable key ordering. This keeps raw design facts separate from semantic intent
and concrete library choices.

## 1. `design-snapshot/v1`

`DesignSnapshot` identifies an immutable raw Pixso retrieval. It records the
provider, document and requested node, canonical source URL, retrieval time,
DSL version, byte length, SHA-256, and content-addressed `artifactId`.

The public snapshot does not expose an absolute cache path. Raw bytes live
internally under `.uig/cache/sha256/<hash>`; metadata lives under
`.uig/artifacts/<artifact-id>.json`.

## 2. `design-ir/v1`

`DesignIR` is the lossless-enough, provider-normalized visual model used by the
rest of Slice 1. It contains:

- the selected root and a node index;
- geometry and layout;
- fills, borders, corner radii, shadows, and opacity;
- text facts;
- component key, variant, name, and properties when Pixso supplied them;
- source-node provenance and normalization diagnostics.

It contains no semantic role, React component, package import, or design-system
decision. When Pixso exports dependency roots before the requested screen, the
normalizer selects the root using snapshot `nodeId`, never array position.

## 3. `design-summary/v1`

`DesignSummary` is a bounded view over `DesignIR`, not a replacement for it. It
contains root dimensions, counts, a depth-bounded visible outline, notable text
and component nodes, and an optional query cursor when truncated. Its default
serialized limit is 20,000 bytes.

Detailed investigation uses addressable `queryDesignContext` calls or the CLI
`inspect` command. Large DSL is retained in the artifact store instead of being
dumped into a model context or terminal.

## 4. `ui-manifest/v1`

`UiManifest` describes design-system-neutral semantic needs. Every UI node has:

- `kind` and semantic `role`;
- source node IDs;
- confidence and weighted evidence;
- optional content, state, required capabilities, and form adapter;
- semantic children.

Exact Pixso component mappings have confidence `1` and form semantic
boundaries: their internal visual override layers are not emitted as unrelated
UI requirements. Structural recognition below the warning threshold becomes
`unresolved` with a blocking diagnostic.

The manifest must never contain package names, imports, concrete component
exports, or pack-specific props.

## 5. `resolution-plan/v1`

`ResolutionPlan` binds one unchanged `UiManifest` to one design-system pack.
Each semantic node receives exactly one decision:

- `reuse`: one verified component binding;
- `compose`: a verified root plus required/slot bindings;
- `fallback`: a pack-permitted local component using the declared style
  strategy;
- `blocked`: no safe decision exists.

Concrete package/export/import facts first appear here. The plan also records
the target (`react`, `typescript`, pack ID), decision counts, evidence,
diagnostic codes, and full diagnostics.

## Run index

`generation-run/v1` is the operator-facing index over the five boundaries. It
records each stage status and relative artifact filenames. It contains no
generated TSX itself. A run may be `completed`, `completed-with-warnings`, or
`blocked`; blocked runs remain inspectable.

## V2 planning contracts

`design-ir/v2` adds explicit flow/absolute positioning evidence.
`ui-manifest/v2` adds a required `layoutSourceNodeId` and optional typed
interactions. `resolution-plan/v2` records immutable SHA-256 references to the
exact DesignIR and manifest plus the loaded pack version and SHA-256. The v1
contracts remain readable historical formats; new generation consumes v2.

For exactly recognized content or action boundaries, semantic planning may
project the first visible direct text child in source order into `content`.
It does not recurse through an exact component boundary and does not invent
content when no direct text evidence exists.

## React recipe, report, and bundle versions

`react-render-recipes/v1`, `react-generation-report/v1`, and historical v1
bundles remain readable closed contracts. New packs and generation use v2.
Recipe v2 adds required `staticProps` with only three closed value opcodes:

- `literal` emits an escaped literal;
- `empty-array` emits `{[]}`;
- `noop` emits the generator-owned fixed `{() => undefined}`.

Every static value has reason `render-only`; packs cannot inject expressions or
function bodies. `semanticChildrenPolicy: "render-only-optional"` permits a
proven structural group with no semantic children but never invents them.

`react-generation-report/v2` discloses sorted render-only prop names and keeps
`targetTypecheck: "not-run"`. `react-generation-bundle/v2` contains the report
and exact TSX/CSS bytes. Slice 2 emits v2 only.
