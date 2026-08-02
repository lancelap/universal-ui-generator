# Search verified project components

Usage:

```text
/uig:components <name or role:semantic-role>
```

Read the search expression from `{{args}}` and use one exact payload shape:

- For `role:<semantic-role>`, call `project_component_search` with
  `{ "semanticRole": "<semantic-role>", "limit": 20 }`.

  Omit `query` and `status`.

- Otherwise call it with `{ "query": "<exact {{args}}>", "limit": 20 }`.

  Omit `semanticRole` and `status`.

Never add, infer, or default another filter. Never request more than 50 results.

Before any other action, call `project_component_search`. This MCP result is
the only authority for search results. Do not use filesystem or shell tools to
prepare, verify, repair, or supplement the result.

If that MCP call is unavailable, stop and report the tool error. Do not inspect
`.ui-context` files as a fallback.

Report the catalog fingerprint, total and returned counts, truncation status,
and each returned component ID, export, verified import, score, and semantic
status. Clearly distinguish `suggested`, `mapped`, and `pack-owned` facts.

Call `get_component_contract` only when the user supplied one exact component
ID or the search produced one unambiguous exact result. Report its verified
import, normalized props, semantic bindings, capabilities, form adapters,
annotations, restrictions, evidence, and catalog fingerprint. Never substitute
a nearest component for a missing exact component.

Do not read the complete generated catalog, search or read project files, edit
`.ui-context`, or treat a `suggested` role as generation authority. For missing
or stale context, report the tool error and recommend `/uig:scan`.
