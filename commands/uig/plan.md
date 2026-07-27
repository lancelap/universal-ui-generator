# Plan Pixso UI generation

Usage:

```text
/uig:plan <pixso-url> [design-system]
```

Read the Pixso URL and optional design-system ID from `{{args}}`. If the
design-system ID is omitted, use `sber-space-ui`.

Call `uig_plan` exactly once with:

- `url`: the supplied Pixso URL;
- `designSystem`: the supplied ID or `sber-space-ui`.

Report:

- `ready` or `blocked`;
- run ID and run path;
- design-system ID, version, and pack SHA-256;
- reuse, compose, fallback, and blocked counts;
- compact blocking diagnostics and their durable artifact path.

Stop after planning. Do not generate source, request design internals, edit
files, retry a blocker, or weaken validation.
