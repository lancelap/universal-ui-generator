# Pixso acceptance fixtures

These lossless JSON fixtures make the real-Pixso acceptance suite deterministic
and offline. The source bytes are excluded from formatting because their hashes
are part of the provenance contract. Refreshing a fixture is an explicit review
operation, not a side effect of running tests.

The requested node is not always the first item in `pixTreeDslNodes`: Pixso may
place exported dependency roots before it. The normalizer must select
`requestedNodeId` and must not infer the screen from array order.

<!-- fixture-provenance:start -->

```json
{
  "schema": "pixso-fixture-provenance/v1",
  "fixtures": [
    {
      "path": "modal-4-314/source.json",
      "sourceUrl": "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314",
      "fileKey": "WSLukjrKancvZG0zbaMnyA",
      "requestedNodeId": "4:314",
      "exportedRootNodeIds": ["4:314"],
      "dslVersion": "2.1.15",
      "converterVersion": "2.2.13",
      "byteLength": 3030014,
      "sha256": "0d6c50995105ef77393d2dfd1bc683f5f755b78a6fd26329e5be6767b66a3d07",
      "acquisition": {
        "kind": "legacy-cache-import",
        "strippedPrefix": "1",
        "originalByteLength": 3030015,
        "originalSha256": "f3bf45983025cb76623b98ceadedd7c6ed345c393b61726f3cb38f91817a9c63"
      }
    },
    {
      "path": "node-6-12547/source.json",
      "sourceUrl": "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=6:12547",
      "fileKey": "WSLukjrKancvZG0zbaMnyA",
      "requestedNodeId": "6:12547",
      "exportedRootNodeIds": ["I3:294", "6:12547"],
      "dslVersion": "2.1.15",
      "converterVersion": "2.2.13",
      "byteLength": 17021810,
      "sha256": "4a55447b5272b7b5f834ceb73fcbfa5a7a02923a38d06c6046f23e96829d205d",
      "acquisition": {
        "kind": "live-project-client",
        "retrievedOn": "2026-07-26"
      }
    },
    {
      "path": "node-70-118892/source.json",
      "sourceUrl": "https://pixso.net/app/design/PqSywlhYgqSRDoWr78IrdA?item-id=70:118892",
      "fileKey": "PqSywlhYgqSRDoWr78IrdA",
      "requestedNodeId": "70:118892",
      "exportedRootNodeIds": ["4:64514", "70:118892"],
      "dslVersion": "2.1.15",
      "converterVersion": "2.2.13",
      "byteLength": 2389379,
      "sha256": "899812d8c6284c3dbe5b1e633723275c7de09b7ac6e86e80ae4794ae06da202a",
      "acquisition": {
        "kind": "live-project-client",
        "retrievedOn": "2026-07-26"
      }
    }
  ]
}
```

<!-- fixture-provenance:end -->

Run `pnpm verify:fixtures` after any intentional refresh. It rejects byte,
hash, DSL-version, exported-root, and requested-root drift.
