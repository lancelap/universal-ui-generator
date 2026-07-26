# Reviewed React generation fixtures

These files are manually reviewed, byte-exact acceptance evidence. Candidate
generation always happens outside `fixtures/`; `pnpm verify:fixtures` checks
every accepted byte length and SHA-256 below.

The neutral modal uses one unchanged v2 manifest for both packs. The real
`4:314` Sber output is regenerated only from the lossless Pixso source recorded
in `fixtures/pixso/README.md`.

The Sber Field recipe's optional semantic children are grounded in:

```text
/Users/danilel/dev/gigacode-mcp/resources/sber-space-ui/library-docs/@sber-space-ui/Field/Field.md
```

That canonical document shows standalone self-closing `Field` usage; children
are optional `FieldBefore`/`FieldAfter` adornments. The current imported
catalog separately expands `FormControl` and `FormLabel` companions. Their
empty neutral slots are retained as a visible, reviewed limitation and are not
treated as completed form integration.

<!-- react-generation-provenance:start -->

```json
{
  "schema": "react-generation-fixture-provenance/v1",
  "files": [
    {
      "path": "modal/material-ui/generated/GeneratedModal.module.css",
      "byteLength": 233,
      "sha256": "f873fab384d81779f5cb5161ea07420442731b6745b520fdcb3b381e01b479aa"
    },
    {
      "path": "modal/material-ui/generated/GeneratedModal.tsx",
      "byteLength": 1250,
      "sha256": "edb346b3b940da0c62ea4139a63a2240bc27c8ad8fdab7a4d4c34a04eff18fe8"
    },
    {
      "path": "modal/material-ui/generated/generation-report.json",
      "byteLength": 1526,
      "sha256": "e77a469d23fcf7b775ba0720515b7afba9f263642085054757822c5af5a0b583"
    },
    {
      "path": "modal/material-ui/resolution-plan.json",
      "byteLength": 6178,
      "sha256": "696b97523e4e2c591c39e6bc66c957cd7affa8de200e545dd49664267e54c7ff"
    },
    {
      "path": "modal/sber-space-ui/generated/GeneratedModal.module.css",
      "byteLength": 233,
      "sha256": "f873fab384d81779f5cb5161ea07420442731b6745b520fdcb3b381e01b479aa"
    },
    {
      "path": "modal/sber-space-ui/generated/GeneratedModal.tsx",
      "byteLength": 1432,
      "sha256": "3d879b95340cd707815c31126e084f2329d3fa922f68903f4926f547f3ef082c"
    },
    {
      "path": "modal/sber-space-ui/generated/generation-report.json",
      "byteLength": 1046,
      "sha256": "a3b38805ddd6c93c134b82e9e3994c3c6dd349669c469c08922e3244347136a1"
    },
    {
      "path": "modal/sber-space-ui/resolution-plan.json",
      "byteLength": 6158,
      "sha256": "94e6fe0669c90c81cbd8ab30e03619b7791140fee5e9898f848b46b9fa9dd7f9"
    },
    {
      "path": "modal/source.design-ir.json",
      "byteLength": 4923,
      "sha256": "b6061d16d984fe285292bf1374d068f5675789e6dbd52f6472d2448d1b9fd709"
    },
    {
      "path": "modal/source.ui-manifest.json",
      "byteLength": 3532,
      "sha256": "76b44a601b387af5c0496c557268368cfb390107b71ee1919394b57947c5abe1"
    },
    {
      "path": "pixso-4-314/sber-space-ui/generated/GeneratedModal.module.css",
      "byteLength": 202,
      "sha256": "bc23a69219643487f01e612e94e8f69629de1b02ca97117d0da9e037d08ed4e2"
    },
    {
      "path": "pixso-4-314/sber-space-ui/generated/GeneratedModal.tsx",
      "byteLength": 859,
      "sha256": "4bfda90a859c940f38917797b6edbbc2823fd79ee800516e4a7ae119236e4c51"
    },
    {
      "path": "pixso-4-314/sber-space-ui/generated/generation-report.json",
      "byteLength": 3559,
      "sha256": "3afc1242e52caa23615906bb7fc40631544a41ef44a6a9769cdfa44a02ed1969"
    }
  ]
}
```

<!-- react-generation-provenance:end -->
