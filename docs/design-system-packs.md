# Design-system packs

A design-system pack owns all concrete library knowledge needed to turn a
semantic `UiManifest` into a verified `ResolutionPlan`. The core planner stays
independent of Sber Space UI and Material UI.

## Required files

`pack.json` declares the core resolution files and, in v2 packs, React
generation files:

| File                        | Responsibility                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `catalog.json`              | Component IDs, packages, exports, export kinds, semantic roles, capabilities, adapters, companions, defaults, and provenance |
| `semantic-policy.json`      | Allowed decisions, candidate IDs, native-fallback policy, and unresolved code per role                                       |
| `pixso-map.json`            | Exact Pixso component key/variant to semantic kind/role mappings                                                             |
| `composition-rules.json`    | Root and slot bindings for multi-component patterns                                                                          |
| `tokens.json`               | Pack-owned color, dimension, number, and string tokens                                                                       |
| `verification.json`         | Explicit verified/unverified status and evidence source for every usable component                                           |
| `react-render-recipes.json` | Closed component props, content/state/event mappings, composition slots, and render-only values                              |
| `react-style-policy.json`   | Component-specific layout/appearance transfer and wrapper policy                                                             |

All paths must remain inside the pack directory. The loader rejects absolute
paths, path traversal, invalid schemas, missing references, duplicate
ownership, unverified reusable exports, and required-component cycles.

## Verified imports

An import is legal only when the selected catalog entry is both:

1. marked `verified: true` in `catalog.json`; and
2. listed with status `verified` in `verification.json`.

The resolver copies `package`, `export`, and `exportKind` from that binding. It
does not derive an import from a semantic role, component display name, Pixso
fixture, or model guess.

This is why Sber packages remain leaf imports such as
`@sber-space-ui/modal` or `@sber-space-ui/atom` when the pack says so; a
universal `@sber-space-ui/react` barrel is never assumed.

## Composition

A catalog entry may declare required and optional companions.
`composition-rules.json` adds named slots for a semantic role. Before returning
`compose`, the loader and resolver prove that:

- every referenced component exists;
- required dependencies are acyclic;
- the role policy permits `compose`;
- every component in the expanded composition is verified.

If any proof fails, the node is blocked. Partial composition is never silently
returned.

## Fallback ownership

Fallback is a pack decision, not a global escape hatch. It is available only
when the role has `nativeFallback: true` and includes `fallback` in
`allowedDecisions`. The current contract names the local component and uses a
CSS-module style strategy.

If fallback is forbidden, missing candidates produce
`NATIVE_FALLBACK_FORBIDDEN`. If fallback is allowed but another pack-owned
condition prevents resolution, the policy's `unresolvedCode` is used.

## Adding another design system

Copy the file structure, choose a unique pack ID, and fill it from verified
library sources. Then run:

```bash
pnpm uig -- pack validate ./design-system-packs/<new-pack>
pnpm verify
```

Do not copy Sber component IDs, imports, props, tokens, or fallback policy into
another pack merely to satisfy validation. The same neutral manifest must be
resolved independently by each pack.

## Render-only recipes

Recipe v2 `staticProps` may contain only `literal`, `empty-array`, and `noop`.
`noop` is accepted only for a declared event target. Every such prop is exposed
by the v2 generation report. The Sber `base.Autocomplete` recipe, for example,
owns the verified `mode`, `value`, `options`, and `onChange` render shape; the
generic generator contains no Sber or combobox branch.

`render-only-optional` permits an already proven structural group to stay empty
and produces `GENERATION_RENDER_ONLY_CHILDREN_MISSING`. It never authorizes
synthetic buttons or callbacks.

The neutral Sber acceptance currently follows the verified Field composition
and therefore renders empty `FormControl` and `FormLabel` slots when no
separate semantic children exist. This is reviewed presentation evidence, not
a claim of complete form integration.
