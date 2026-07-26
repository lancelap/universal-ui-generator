# Qwen Pixso → Sber Space UI benchmark

This workspace runs an approved benchmark of the canonical GigaCode UI workflow.

Before planning or editing, read these files completely:

1. `/Users/danilel/dev/qoder-front-ext/gigacode-extension/GIGACODE.md`
2. `/Users/danilel/dev/qoder-front-ext/gigacode-extension/commands/dsl-ui-direct.md`

Resolve every relative workflow path against:

```text
/Users/danilel/dev/qoder-front-ext/gigacode-extension
```

Use the project-level `dsl-ui-direct` command plus `ui-builder` and
`code-reviewer` agents. Do not replace them with direct parent-agent TSX edits.

Required MCP split:

- `Pixso Remote MCP.get_node_dsl` retrieves the original Pixso JSON;
- `ui-extension.pixso_json_to_dsl` converts the saved JSON to a DSL artifact;
- `ui-extension.resolve_ui_components` resolves semantic component needs;
- `ui-extension.get_icon_paths` resolves icons separately;
- `ui-extension.check_browser_errors` performs workflow browser checks.

The user has approved this benchmark scope:

- nodes `4:2469`, `4:11919`, `4:10047`, and `6:9447` from
  `WSLukjrKancvZG0zbaMnyA`;
- node `70:118892` from `PqSywlhYgqSRDoWr78IrdA`;
- preserve one raw Pixso JSON artifact per node;
- render every screen with verified Sber Space UI components;
- expose all five screens in one local review gallery;
- keep each screen isolated so the next review iteration can change it
  independently.

Workflow constraints:

- create and present the implementation plan before editing;
- after the plan is approved in the Qwen session, execute it without asking
  again for already approved benchmark scope;
- never log or write the Pixso token;
- never invent a Sber import;
- keep unresolved component needs explicit;
- do not commit or push from Qwen.
