# Plan and generate React from Pixso

Usage:

```text
/uig:pixso-to-react <pixso-url> [design-system]
```

Read the Pixso URL and optional design-system ID from `{{args}}`. If the
design-system ID is omitted, use `sber-space-ui`.

1. Call `uig_plan` exactly once with the URL and design-system ID.
2. If planning returns `blocked`, report its run path, pack proof,
   resolution counts, compact diagnostics, and stop.
3. Only when planning returns `ready`, call `uig_generate` exactly once
   with the returned run ID.
4. Report generation status, output path, file hashes, verified imports,
   render-only props, and compact diagnostics.

Never write or repair TSX/CSS with Qwen file tools. Never request design
internals, invent an import, bypass a blocker, or retry with weaker
validation.
