# Reviewed React generation fixtures

These files are manually reviewed, byte-exact acceptance evidence. Candidate
generation always happens outside `fixtures/`; `pnpm verify:fixtures` checks
every accepted byte length and SHA-256 below.

The neutral modal uses one unchanged v2 manifest for both packs. The real
`4:314` modal and `70:118899` choice-panel Sber outputs are regenerated only
from the lossless Pixso sources recorded in `fixtures/pixso/README.md`.

The Sber Field recipe's optional semantic children are grounded in the
portable canonical resource identifier:

```text
gigacode-mcp/resources/sber-space-ui/library-docs/@sber-space-ui/Field/Field.md
```

That canonical document shows standalone self-closing `Field` usage; children
are optional `FieldBefore`/`FieldAfter` adornments. The canonical
`gigacode-mcp/resources/sber-space-ui/library-docs/@sber-space-ui/FormControl/FormControl.md`
instead shows `Field` and a content-bearing `FormLabel` nested inside a
`FormControl`. Therefore `FormControl` and `FormLabel` remain available
catalog components but are not unconditional `Field` companions. A future
conditional form composition must be rooted at `FormControl` and requires
real semantic label, description, or validation content; standalone text
inputs stay self-closing `Field` elements.

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
      "byteLength": 1071,
      "sha256": "8de7d9dde2e792c1936f2f1cb2ec9c7b127a1edc0faf0bf20428528295b29f23"
    },
    {
      "path": "modal/material-ui/generated/generation-report.json",
      "byteLength": 1665,
      "sha256": "17df8cc18f27e5842b9757e9c2a80f412daa7ed33c4099ade69d4ada8fbb1438"
    },
    {
      "path": "modal/material-ui/resolution-plan.json",
      "byteLength": 6178,
      "sha256": "a9ea8f8d9566513b09477a502f866ff4f7d3ba64c4f80cd2d2e06e4f15eacce9"
    },
    {
      "path": "modal/sber-space-ui/generated/GeneratedModal.module.css",
      "byteLength": 233,
      "sha256": "f873fab384d81779f5cb5161ea07420442731b6745b520fdcb3b381e01b479aa"
    },
    {
      "path": "modal/sber-space-ui/generated/GeneratedModal.tsx",
      "byteLength": 1139,
      "sha256": "ff9c4900fe9b8cdb767512799b4358629f1201fc853734e62b826707bc2b9616"
    },
    {
      "path": "modal/sber-space-ui/generated/generation-report.json",
      "byteLength": 1181,
      "sha256": "7215cbecdcf4314cd373d59abad96db55758f2a9f89ef33977187da44681f007"
    },
    {
      "path": "modal/sber-space-ui/resolution-plan.json",
      "byteLength": 5761,
      "sha256": "a50d862e7e29ca15af7ce3b20c8413e235a1d43da3346940fa1d4120241d9286"
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
      "byteLength": 306,
      "sha256": "3b518acb969420f41141b649e1e3c0b4c61af35e31b8da4b35eed377503d73db"
    },
    {
      "path": "pixso-4-314/sber-space-ui/generated/GeneratedModal.tsx",
      "byteLength": 1176,
      "sha256": "69bbf27890f992ac911e50df57f25e398a4270e14942e8a3f92ecaf4c05fece4"
    },
    {
      "path": "pixso-4-314/sber-space-ui/generated/generation-report.json",
      "byteLength": 6355,
      "sha256": "4e15474f1c1660e196b584c67e10bf2555834647194d47f330f35a9cfb4e6d9d"
    },
    {
      "path": "pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.module.css",
      "byteLength": 697,
      "sha256": "9fa05ed31d3884851205e8e86b79d4409adb28859c17b34221d95214c4e3b72d"
    },
    {
      "path": "pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.tsx",
      "byteLength": 4041,
      "sha256": "f83dbe5d5ed817a9c54721762ef3b455c76afb61f9139263db20f11309175fc8"
    },
    {
      "path": "pixso-70-118899/sber-space-ui/generated/generation-report.json",
      "byteLength": 8454,
      "sha256": "d8d2760cb5d9c2b1df49065543242ddb0a984c405ae06fc4e6214c28bcf32fcf"
    },
    {
      "path": "pixso-70-118899/sber-space-ui/resolution-plan.json",
      "byteLength": 10491,
      "sha256": "5454c690e28bae6cd5f9f99a635eae6d9c0be99d9da9b0e6a2a9e3e296b533d4"
    }
  ]
}
```

<!-- react-generation-provenance:end -->
