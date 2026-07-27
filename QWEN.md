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
