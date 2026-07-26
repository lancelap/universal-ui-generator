---
description: Run the canonical GigaCode DSL → UI direct workflow for this benchmark.
---

Read and follow completely:

```text
/Users/danilel/dev/qoder-front-ext/gigacode-extension/GIGACODE.md
/Users/danilel/dev/qoder-front-ext/gigacode-extension/commands/dsl-ui-direct.md
```

Resolve relative workflow references against:

```text
/Users/danilel/dev/qoder-front-ext/gigacode-extension
```

The parent remains a dispatcher. Delegate UI writing to the project-level
`ui-builder`, then delegate verification to the project-level `code-reviewer`.
Pass only the path-based payload required by the canonical command.
