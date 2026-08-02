# Prepare project UI context

Usage:

```text
/uig:scan
```

Call `scan_project_components` with no arguments.

If the result is `needs-configuration`, show every proposed component facade,
icon facade, public import source, and selected design-system pack. Ask the user
for explicit confirmation. Do not continue until the user confirms or corrects
the proposed roots and packs.

Only after confirmation, call `scan_project_components` again with:

- `acceptDiscoveredConfig: true`;
- the exact returned `discoveryId`;
- the exact reviewed `acceptedConfig`.

The user may correct roots or selected packs before confirmation. Pass those
reviewed corrections through `acceptedConfig`; do not edit context files
directly.

If the result is `completed`, report the catalog path and fingerprint, verified
component and icon counts, mapped and suggested role counts, warning count, and
recommend `/uig:components` as the next command. If the result is `blocked`,
report the compact diagnostics and their durable artifact path and stop.

Do not search the repository yourself. Do not edit `.ui-context`, call Pixso,
generate source, retry a blocker, or weaken validation.
