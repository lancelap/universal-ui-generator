# Search verified project components

Usage:

```text
/uig:components <name or role:semantic-role>
```

Read the search expression from `{{args}}`. For `role:<semantic-role>`, call
`project_component_search` with `semanticRole`; otherwise call it with `query`.
Use a result limit of 20 and never request more than 50 results.

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
