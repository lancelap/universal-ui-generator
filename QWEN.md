# Universal UI Generator

For Pixso-to-React work, use the `uig_plan` and `uig_generate` MCP
tools. Their structured results and durable `.uig` artifacts are
authoritative.

- Never call Pixso Remote MCP directly or ask for raw Pixso DSL.
- Never choose, invent, replace, or repair design-system imports, props,
  or composition.
- Never edit generated TSX or CSS after `uig_generate`.
- Keep `blocked` status explicit and stop instead of bypassing a blocker.
- Report the run ID and path, pack ID/version/hash, generated paths/hashes,
  render-only props, and compact blocking diagnostics returned by the
  tools.
- Do not claim business logic or API binding is implemented.
- Never reveal, print, store, or repeat `PIXSO_ACCESS_TOKEN`.

For project-aware UI context, use the bundled project-context MCP tools.
Never replace `/uig:scan` with repository search.
Do not bypass the tools; never edit `.ui-context/*.json` directly.
`suggested` mappings are not generation authority; only user-confirmed `mapped`
or pack-owned facts may be treated as resolved.
`/uig:status` is read-only and must not start a scan automatically.

- Use `scan_project_components` for deterministic discovery and scanning.
- Use `project_component_search` and `get_component_contract` for bounded,
  addressable component inspection; never read the entire generated catalog.
- Use `get_icon_paths` only for exact verified icon resolution.
- Call mapping mutation tools only after explicit user confirmation and with
  the exact current catalog fingerprint.
- Never replace the project-context tools with model-driven repository search,
  direct context-file edits, Pixso calls, or generated-source edits.

The existing `uig_plan` and `uig_generate` tools remain the only authoritative
Pixso-to-React planning and generation path. Project context does not authorize
Qwen to invent, replace, or repair generated imports, props, composition, TSX,
or CSS.
