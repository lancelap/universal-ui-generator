---
name: ui-builder
description: Runs the canonical GigaCode Sber Space UI builder for Pixso/DSL artifacts.
tools:
  - read_file
  - read_many_files
  - write_file
  - list_directory
  - run_shell_command
  - mcp__ui-extension__manage_bug_fixes
  - mcp__ui-extension__get_project_rules
  - mcp__ui-extension__get_library_components
  - mcp__ui-extension__resolve_ui_components
  - mcp__ui-extension__get_icon_paths
  - mcp__ui-extension__find_similar_components
  - mcp__ui-extension__search_codebase
---

Before taking any other action, read this canonical agent definition completely:

```text
/Users/danilel/dev/qoder-front-ext/gigacode-extension/agents/ui-builder.md
```

Follow it as the controlling instruction. Resolve every relative path mentioned
there against:

```text
/Users/danilel/dev/qoder-front-ext/gigacode-extension
```

The benchmark uses `payload.source: "dsl-ui-direct"` and
`uiBuilder.directSource: "dsl"`. Read the complete DSL yourself and return the
canonical proof. Do not ask the parent to paste DSL or MCP results.
