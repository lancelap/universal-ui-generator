# Generate React from a validated run

Usage:

```text
/uig:generate <run-id>
```

Read the run ID from `{{args}}` and call `uig_generate` exactly once.

Report:

- `generated` or `blocked`;
- output path and write status;
- emitted file paths and SHA-256 hashes;
- verified design-system imports;
- render-only props;
- compact diagnostics and their durable artifact path.

Do not modify generated TSX or CSS. For a blocked or tool-error result,
report it honestly and stop without retrying through another tool.
