# Agentic Pixso-to-React pipeline

Usage:

```text
/uig:pixso-to-react <pixso-url> [design-system]
/uig:pixso-to-react <local-dsl-path> [design-system]
/uig:pixso-to-react screenshot <png-or-jpeg-path> <page-name> [design-system]
/uig:pixso-to-react run <run-id>
```

Read the source and optional design-system ID from `{{args}}`. The default
design system is `sber-space-ui`. Do not ask the user to confirm a plan
before generating; the agentic pipeline starts as soon as the source is
valid.

The pipeline runs in this order. Each step is a foreground subagent or
MCP tool call. Up to three local fix loops are allowed between the
`code-reviewer` and `browser-reviewer`; the run is saved with honest
residual errors if the budget is exhausted.

1. `uig_prepare_build` — validate the source, persist design evidence
   under `.uig/runs/<run-id>`, refresh the verified project component
   catalog, and return the run path, fingerprint, and reusable
   components. If it returns `blocked`, report the compact diagnostics
   and stop.
2. `ui-builder` — read the durable run, reuse verified and human-confirmed
   project components, write the page, the preview entry, the local
   mock data, and the implementation report. Stay inside the recorded
   write scope. Record the result through `uig_record_implementation`.
3. `code-reviewer` — verify type safety, project conformance, scope, and
   lint. Fix small engineering issues directly. Record the verdict
   through `uig_record_code_review`.
4. `browser-reviewer` — start the dev server exactly as the
   implementation report specifies, open the recorded preview URL on a
   desktop and one narrow viewport, and capture screenshots. Fix
   runtime and blocking layout problems directly. Record the verdict
   through `uig_record_browser_review`.

After all four steps, report:

- the rolled-up run status from the last successful `uig_record_*`
  call (`complete`, `partial-success`, `generated-with-errors`,
  `blocked`, or `cancelled`);
- the durable run path, the report path, and the report SHA-256;
- the created and modified files, the chosen preview path, the preview
  URL path, and the preview command;
- the verified project components that were reused;
- the literal assumptions and any residual errors the agents could not
  fix inside the write scope;
- the captured screenshots and the verdict of the browser review.

A `complete` run must include at least one screenshot and zero
unresolved console or network errors. `partial-success` and
`generated-with-errors` are honest outcomes — they are not failures
when the residual errors are reported faithfully.

## Legacy deterministic commands

`/uig:plan` and `/uig:generate` are still available as low-level
deterministic commands for regression tests, debugging, and the
reproducible benchmark. They are not the default path of
`/uig:pixso-to-react`. Do not chain `uig_plan` then `uig_generate`
inside the combined command; the agentic pipeline replaces them.
