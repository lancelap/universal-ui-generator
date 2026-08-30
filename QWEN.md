# Universal UI Generator

The Qwen extension ships an agentic Pixso-to-React workflow. `/uig:pixso-to-react`
runs four MCP tools (`uig_prepare_build`, `uig_record_implementation`,
`uig_record_code_review`, `uig_record_browser_review`) and three bundled
subagents (`ui-builder`, `code-reviewer`, `browser-reviewer`). The deterministic
`uig_plan` and `uig_generate` tools are still exposed for regression tests,
debugging, and the reproducible benchmark, but they are not the default path
for the combined command.

## Authoritative sources

- The `uig_prepare_build` result is the only authority for the design
  evidence, the project-context fingerprint, the reusable component list,
  and the durable run path of one agentic run. Read it before any
  filesystem inspection of `.uig/runs/<run-id>`.
- The implementation, code-review, and browser-review reports recorded
  through `uig_record_*` are the only authority for what the agentic
  pipeline actually produced. They are durably stored in
  `.uig/runs/<run-id>/agentic/`.
- The project-context tools (`scan_project_components`,
  `project_component_search`, `get_component_contract`, `get_icon_paths`,
  `confirm_project_component_mappings`, `remove_project_component_mappings`,
  `get_project_ui_context_status`) are the only authority for the
  verified project component catalog. `suggested` mappings are not generation authority; only user-confirmed `mapped` and
  design-system `pack-owned` facts may be treated as resolved.
- `/uig:status` is read-only and must not start a scan automatically.

## What the agentic workflow may and must not do

- The `ui-builder` is allowed to write into the user's project: the new
  page, the preview entry, the local mock data, and style files. It must
  stay inside the recorded write scope. Anything else is out of scope and
  must be reported back through `uig_record_implementation` as
  `residualErrors`, not silently edited.
- The `code-reviewer` may fix small engineering issues (import order,
  missing `key`, `displayName`, optional cleanup). It must not redesign
  the page, swap components, change copy, or rework the layout — those
  belong back to the `ui-builder` and require a new prepare-build.
- The `browser-reviewer` may fix runtime or blocking layout problems
  (broken import path, asset 404, missing `key`, CSS that prevents first
  paint). It must not install dependencies, swap components, or change
  the visual concept. A `COMPLETE` run must have a real Chromium run
  with at least one screenshot and zero unresolved console or network
  errors.
- The orchestrator may call `uig_plan` and `uig_generate` for the
  reproducible benchmark, but `/uig:pixso-to-react` does not require
  them and they are not authoritative for the agentic run.

## Hard guardrails

- Never call Pixso Remote MCP directly, request raw Pixso DSL, or pass
  the design-system pack through Qwen filesystem tools. The MCP
  `uig_prepare_build` tool is the only entry point that may contact
  Pixso.
- Never edit generated TSX or CSS that was emitted by `uig_generate` or
  by the `ui-builder`. If something must change, record the change
  through the next `uig_record_*` call.
- never edit `.ui-context/*.json` directly. Project-context files are
  owned by the scanner and by human-confirmed mapping reviews.
- Never replace `/uig:scan` with repository search. Use the bundled
  project-context tools. If those MCP tools are unavailable, stop and
  report the tool error.
- Never read `.ui-context/generated` files directly. If a
  project-context tool is unavailable, report the error and stop instead
  of using filesystem or shell tools as a fallback.
- Never call `confirm_project_component_mappings` or
  `remove_project_component_mappings` without explicit user
  confirmation and the exact current catalog fingerprint.
- Never reveal, print, store, or repeat `PIXSO_ACCESS_TOKEN`. Keep the
  token in the local environment, the extension setting, or the
  extension MCP process — never in command arguments, logs, or
  repository files.
- Never claim that business logic, API calls, form integration, or
  state are implemented. The agentic workflow writes presentation-only
  code; integration is a separate human task.
- Never install new UI libraries, Storybook, or a router without
  explicit user permission. The `ui-builder` reuses the project's
  existing primitives and may create a minimal project-compatible
  preview entry.

## Run status

`uig_prepare_build` returns one of `ready`, `ready-with-warnings`, or
`blocked`. The record tools roll up to one of `pending`,
`implementation-recorded`, `code-review-recorded`, `browser-review-recorded`,
`complete`, `partial-success`, `generated-with-errors`, `blocked`, or
`cancelled`. Report the rolled-up status from the last successful
`uig_record_*` call together with the compact diagnostics, the durable
run path, the report path, and the report SHA-256.

## Diagnostics

- A `blocked` result from `uig_prepare_build` is authoritative. The
  orchestrator must report the compact diagnostics and stop, not retry
  with weaker validation.
- `generated-with-errors` is an honest outcome. It means the
  `ui-builder` produced code, but the code-reviewer or browser-reviewer
  could not finish the local fix budget. Report the residual errors
  from the implementation report and let the user decide.
- `partial-success` is an honest outcome. The page renders, but the
  browser run recorded warnings. Report them.
- `complete` requires a real Chromium run, at least one screenshot, and
  zero unresolved console or network errors.

## Legacy deterministic tools

- `uig_plan` and `uig_generate` are still shipped. They are required
  for the reproducible benchmark and useful for debugging. They are not
  the default path of `/uig:pixso-to-react`. A blocked `uig_plan`
  result is still a hard stop; a `generated` result is still
  presentation-only.
- The same hard guardrails apply: never repair generated TSX or CSS by
  hand, never invent a design-system import, never bypass a blocker.
