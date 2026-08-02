# Check project UI context status

Usage:

```text
/uig:status
```

Call only `get_project_ui_context_status` with no arguments.

Do not run a scan automatically.

Report the exact status and changed fingerprint categories:

- `missing`: recommend `/uig:scan`;
- `ready`: report the active catalog path and fingerprint, then recommend
  `/uig:components` when the user wants to inspect components;
- `stale`: report every changed category and recommend an explicit `/uig:scan`;
- `blocked`: report the available blocker information and stop.

This command is read-only. Do not search the repository, read the complete
catalog, edit `.ui-context`, call Pixso, generate source, or retry another tool.
