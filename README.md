# Universal UI Generator

Universal UI Generator turns a selected Pixso node into a deterministic,
design-system-neutral `UiManifest`, then resolves that same manifest against a
validated design-system pack. Slice 1 stops at a reviewable `ResolutionPlan`:
it does not generate production TSX and does not use an LLM, Qwen workflow, or
an MCP server of its own.

The implemented path is:

```text
Pixso URL → cached raw DSL → DesignIR → DesignSummary → UiManifest
          → Sber Space UI or Material UI ResolutionPlan
```

## Requirements and setup

- Node.js 22 or newer
- pnpm 10
- `PIXSO_ACCESS_TOKEN` only for live Pixso commands

```bash
pnpm install
pnpm verify
```

Keep the Pixso token in the local process environment. Do not put it in this
repository, a design-system pack, a fixture, or a command committed to shell
history.

## Checked commands

The following commands are executed by
`apps/cli/src/readme-commands.test.ts`.

<!-- tested -->

```bash
pnpm uig -- --help
```

<!-- tested -->

```bash
pnpm uig -- pack validate ./design-system-packs/sber-space-ui
```

<!-- tested -->

```bash
pnpm uig -- pack validate ./design-system-packs/material-ui
```

<!-- tested -->

```bash
pnpm verify:fixtures
```

## Live Pixso planning

Export the token in your local shell and give `plan` one Pixso URL plus one
pack ID:

```bash
export PIXSO_ACCESS_TOKEN="<local environment value>"
pnpm uig -- plan \
  --url "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314" \
  --design-system sber-space-ui
```

The command prints a path such as `.uig/runs/<run-id>`. A blocked resolution is
still written in full and exits with code `2`; provider, input, or pack failures
exit with code `1`.

The live fetch can also be separated from offline planning:

```bash
ARTIFACT_ID="$(pnpm --silent uig -- fetch \
  'https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314')"
pnpm uig -- plan \
  --snapshot "$ARTIFACT_ID" \
  --design-system material-ui
```

After `fetch`, `--snapshot` reads the content-addressed DSL from `.uig`; it does
not contact Pixso and does not require the token.

## Inspecting design facts

Normalize a stored artifact into `.uig/design-ir.json`:

```bash
pnpm uig -- normalize "$ARTIFACT_ID"
```

Inspect one normalized node without dumping the complete Pixso DSL:

```bash
pnpm uig -- inspect \
  --artifact "$ARTIFACT_ID" \
  --node "4:314" \
  --include geometry,appearance
```

Every planning run contains:

```text
snapshot.json
design-ir.json
design-summary.json
ui-manifest.json
resolution-plan.json
diagnostics.json
run.json
```

Use `pnpm test:acceptance` for a fully offline replay of the three recorded
Pixso nodes and the reviewed Sber/MUI goldens. Fixture provenance and hashes are
documented in `fixtures/pixso/README.md`.

## Slice 1 acceptance evidence

| Criterion                                | Evidence                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Real Pixso URL with `item-id`            | `parse-pixso-url.test.ts`, `remote-mcp-client.live.test.ts`, recorded live fixtures |
| Raw DSL stored once by content hash      | `artifact-store.test.ts`                                                            |
| Byte-identical stable `DesignIR`         | `normalize-design.test.ts` golden and `stable-json.test.ts`                         |
| Default summary no larger than 20 KB     | `build-design-summary.test.ts`, `offline-acceptance.test.ts`                        |
| Initial semantic vocabulary has evidence | `structural-recognizers.test.ts`, `exact-component-recognizer.test.ts`              |
| One manifest resolves through both packs | `resolve-ui-manifest.test.ts`, 4:314 acceptance goldens                             |
| Resolver never invents imports           | `resolve-node.test.ts`, cross-pack assertions in `offline-acceptance.test.ts`       |
| Forbidden fallback blocks                | `resolve-node.test.ts` for `NATIVE_FALLBACK_FORBIDDEN`                              |
| Intermediate JSON is inspectable         | `create-program.test.ts`, `write-run-artifacts.ts`                                  |
| Normal verification is offline           | `pnpm verify` runs recorded fixtures; live test is opt-in                           |
| No LLM, MCP server, or TSX generator     | package/workspace inventory plus Slice 1 architecture tests                         |
| Repository release gate passes           | two consecutive `pnpm verify` runs in the completion checkpoint                     |

Further details:

- [Artifact contracts](docs/contracts.md)
- [Design-system packs](docs/design-system-packs.md)
- [Diagnostics](docs/diagnostics.md)
- [Fixture policy](docs/fixture-policy.md)

Slice 2 is the separate React/TypeScript generation slice. Slice 3 will migrate
the broader layout and library rules; neither responsibility is hidden inside
Slice 1.
