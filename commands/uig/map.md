# Review project component mappings

Usage:

```text
/uig:map <add|remove> <component name or exact component ID> <semantic role>
```

Parse the action, component selector, and semantic role from `{{args}}`. Use
`project_component_search`, followed by `get_component_contract`, to resolve
one exact verified component. Stop on zero or ambiguous results; never guess a
component or import.

Before any mutation, show:

- the exact component ID and verified import;
- the current catalog fingerprint;
- the semantic role, capability, and form-adapter changes;
- the supporting contract evidence and current semantic status;
- whether the operation will add or remove each binding.

Ask for explicit confirmation and stop until the user confirms this exact
change. Confirmation of a prior or different mapping is not sufficient.

After confirmation, pass the exact current `catalogFingerprint` and reviewed
mapping array to `confirm_project_component_mappings` for `add`, or to
`remove_project_component_mappings` for `remove`. Report the new fingerprint,
catalog hash, paths, and summary. If the fingerprint is stale, report
`PROJECT_COMPONENT_CATALOG_STALE`, run no mutation, and recommend reviewing the
current component again.

Do not edit `.ui-context` directly, invent semantic terms, use suggested
bindings automatically, weaken validation, or retry a rejected mutation.
