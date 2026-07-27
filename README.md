# Universal UI Generator

Universal UI Generator turns a selected Pixso node into a deterministic,
design-system-neutral `UiManifest`, then resolves that same manifest against a
validated design-system pack. Slice 2 can compile a completed v2 run into an
isolated, deterministic React/TypeScript source bundle. It does not use an LLM
to select components and does not implement application behavior.

The implemented path is:

```text
Pixso URL → cached raw DSL → DesignIR → DesignSummary → UiManifest
          → Sber Space UI or Material UI ResolutionPlan → React bundle
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

Generate from the newly planned run without contacting Pixso:

```bash
pnpm uig -- generate --run "<run-id>"
```

The structured result reports `generated` or `blocked` and names
`.uig/runs/<run-id>/generated`. A generated directory contains the root TSX,
its CSS Module, any separately generated fallback TSX/CSS pairs, and
`generation-report.json`. Repeating generation with the same inputs is
byte-identical. A run whose recorded pack SHA-256 no longer matches the loaded
pack is stale and fails closed; re-run `plan` instead of bypassing the proof.

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
Pixso nodes, the neutral Sber/MUI generation goldens, and the reviewed real
`4:314` Sber generation. Fixture provenance and hashes are documented in
`fixtures/pixso/README.md` and `fixtures/react-generation/README.md`.

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

Generated code is presentation-only. `targetTypecheck` remains `"not-run"`;
the generator does not install dependencies, mutate a target project, create
state, load option data, call APIs, integrate a form library, or supply business
callbacks. Those are later integration concerns.

## Qwen Code extension

The repository is also a portable extension for **Qwen Code 0.21.0**. It
requires Node.js 22 or newer. Installation uses the committed
`dist/qwen-adapter.mjs`; the installed Git copy does not run `pnpm install`
and does not need its own `node_modules`.

Install from the stable `main` branch:

```bash
qwen extensions install lancelap/universal-ui-generator
qwen extensions settings set universal-ui-generator "Pixso access token"
```

The second command prompts for a sensitive value. Qwen supplies it to the
extension MCP process as `PIXSO_ACCESS_TOKEN`; it is not a tool argument or
part of a generated artifact. A workspace-specific setting can be configured
with:

```bash
qwen extensions settings set \
  --scope=workspace \
  universal-ui-generator \
  PIXSO_ACCESS_TOKEN
```

The default design system is `sber-space-ui`. The extension adds:

```text
/uig:plan <pixso-url> [design-system]
/uig:generate <run-id>
/uig:pixso-to-react <pixso-url> [design-system]
```

`/uig:plan` creates a durable checkpoint and stops. A ready result contains
the run path, pack proof, resolution counts, and compact diagnostics:

```json
{
  "status": "ready",
  "runId": "run_20260727T000000000Z_4-314",
  "runPath": ".uig/runs/run_20260727T000000000Z_4-314",
  "target": {
    "designSystem": "sber-space-ui",
    "designSystemVersion": "2.0.0",
    "packSha256": "32c631516cf99d85d6f342227e95041ffff41d1c32839a260bc0d8284bc5e53b"
  },
  "summary": {
    "reuse": 3,
    "compose": 1,
    "fallback": 0,
    "blocked": 0
  },
  "diagnostics": {
    "totalCount": 1,
    "returnedCount": 1,
    "truncated": false
  }
}
```

`/uig:generate` replays a validated run without another Pixso request. Its
result reports the output path, file hashes, verified imports, render-only
props, and diagnostics. The exact generated files remain under
`.uig/runs/<run-id>/generated`; the extension does not copy them into an
application:

```json
{
  "status": "generated",
  "outputPath": ".uig/runs/run_20260727T000000000Z_4-314/generated",
  "files": [
    {
      "path": "GeneratedModal.tsx",
      "sha256": "4bfda90a859c940f38917797b6edbbc2823fd79ee800516e4a7ae119236e4c51"
    }
  ],
  "imports": [
    {
      "package": "@sber-space-ui/modal",
      "exports": ["Modal", "ModalBody", "ModalFooter"]
    }
  ],
  "renderOnlyProps": [
    {
      "manifestNodeId": "ui_combobox_4-316",
      "targets": ["mode", "onChange", "options", "value"]
    }
  ]
}
```

`/uig:pixso-to-react` runs those two stages sequentially. If planning is
blocked, it reports the durable diagnostics path and stops. A blocked result
does not authorize TSX, and Qwen must not repair or bypass it.

The generated bundle is presentation-only. The extension does not implement
business logic, state, API calls, form integration, or application callbacks.

### Extension lifecycle and local development

```bash
qwen extensions update universal-ui-generator
qwen extensions enable universal-ui-generator
qwen extensions disable universal-ui-generator
qwen extensions uninstall universal-ui-generator
```

From a repository checkout, link the current files during development:

```bash
qwen extensions link "$(git rev-parse --show-toplevel)"
qwen extensions list
```

Rebuild and verify the committed runtime before testing a source change:

```bash
pnpm build:qwen-extension
pnpm verify:qwen-extension-bundle
pnpm test:qwen-extension
```

### Extension troubleshooting

- `UIG_PROVIDER_CONFIG_MISSING`: configure the sensitive Pixso setting; do
  not put the token in the manifest or command text.
- Node startup failure: verify `node --version` is 22 or newer and the
  extension is enabled.
- Blocked resolution: inspect the returned diagnostics artifact under
  `.uig/runs/<run-id>` and fix the design-system capability gap rather than
  bypassing it.
- MCP startup failure: run Qwen with `qwen --debug`, keeping the sensitive
  setting out of copied logs.
- No application source change: this slice intentionally writes only to
  `.uig`; application installation and business integration are separate.
