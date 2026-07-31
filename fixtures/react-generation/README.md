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
      "byteLength": 1259,
      "sha256": "29062c8c1a1d31edeaec8ef8df4fa43edee3a12f0a5ce1650fe77ef6bc054eca"
    },
    {
      "path": "modal/material-ui/generated/generation-report.json",
      "byteLength": 1665,
      "sha256": "0a1fb22e1bbba6e98ab1c5cc397d631a14c3ef1ff7cfc63aae22122fda923125"
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
      "byteLength": 1327,
      "sha256": "aaa2ed243dab7009f7ecf49e4b66c45607de32e7f28f6bd75ac3cdad4e215a0d"
    },
    {
      "path": "modal/sber-space-ui/generated/generation-report.json",
      "byteLength": 1181,
      "sha256": "2dab02f2817dbf421dfb45affac986551f6725707fce294c5f1a57f2a6068f43"
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
      "byteLength": 1384,
      "sha256": "49a85308f47e1d0996e51e208c3dd1026983135787f3cfcec70f94ddceee0e65"
    },
    {
      "path": "pixso-4-314/sber-space-ui/generated/generation-report.json",
      "byteLength": 6355,
      "sha256": "f0b1b8d96312ea19abf52069925a2a9cc4461b0dfdece46891c56fd68792bb7d"
    },
    {
      "path": "pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.module.css",
      "byteLength": 697,
      "sha256": "9fa05ed31d3884851205e8e86b79d4409adb28859c17b34221d95214c4e3b72d"
    },
    {
      "path": "pixso-70-118899/sber-space-ui/generated/GeneratedChoicePanel.tsx",
      "byteLength": 6433,
      "sha256": "4055b5817d5b930053a98100c4d6ddf1890908cc59988f3788b0bcfc9e3b5f04"
    },
    {
      "path": "pixso-70-118899/sber-space-ui/generated/generation-report.json",
      "byteLength": 8454,
      "sha256": "f245fabc5110a3379128086f0e6a23a8d5e4047aef64f5ca1ede1177cbd65be8"
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
