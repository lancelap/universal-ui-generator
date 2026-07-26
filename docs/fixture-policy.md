# Pixso fixture policy

Recorded fixtures make normal verification deterministic and independent of
Pixso availability, network access, and tokens. They are source evidence, not
an alternative design-system catalog.

## Provenance

Every fixture is listed in `fixtures/pixso/README.md` with:

- source URL, file key, and requested node ID;
- all exported `pixTreeDslNodes` root IDs;
- DSL and converter versions;
- exact byte length and SHA-256;
- acquisition kind and date;
- original byte/hash and stripped prefix for a sanitized legacy import.

`pnpm verify:fixtures` parses that metadata and rejects byte, hash, version,
root-order, or requested-root drift.

## Lossless storage and sanitization

Live retrieval uses the project's own Pixso Remote MCP client and writes its
canonical JSON bytes. The token is sent only in the `Token` request header and
is never serialized.

The imported `4:314` cache had one known non-JSON prefix byte (`1`). The import
script accepted that exact prefix, recorded the original hash and length,
removed only the prefix, validated the requested root and DSL versions, and
saved the remaining JSON bytes unchanged. Unexpected non-whitespace prefixes
are rejected.

Fixture JSON and reviewed goldens are excluded from automatic formatting
because their exact bytes are evidence.

## Multiple exported roots

Pixso may export a dependency before the selected node. For example, the
`6:12547` and `70:118892` fixtures each contain two top-level tree entries.
Snapshot metadata remains authoritative: normalization selects the requested
node ID and treats other roots only as reference dependencies.

Repeated guidless component overrides receive deterministic contextual IDs.
Property-only overrides without geometry are not promoted to visual nodes.

## Secrets and personal data

Before adding or refreshing a fixture:

1. confirm the selected design is permitted test material;
2. inspect text and metadata for secrets, credentials, personal contact data,
   or production identifiers;
3. never redact silently—either obtain a safe source fixture or document and
   reproduce an approved deterministic sanitization;
4. confirm the token is absent with repository search;
5. update provenance hashes only after review.

Do not commit `.zshrc`, environment dumps, request headers, MCP session state,
or `.uig` live caches.

## Golden review

Goldens are generated as candidates in a temporary directory. Review at least:

- selected root identity and node count;
- geometry, layout, text, fills, borders, radii, and shadows;
- semantic roles, confidence, evidence, and diagnostics;
- Sber and MUI decisions/imports independently;
- absence of cross-pack imports and invented components.

Only then copy candidates into the fixture directory. Finish with:

```bash
pnpm verify:fixtures
pnpm test:acceptance
pnpm verify
```

Refreshing source bytes without reviewing derived goldens is not accepted.

React candidates are generated with:

```bash
pnpm generate:react-acceptance-candidates
```

The script defaults to a fresh OS temporary directory and rejects destinations
inside `fixtures/`. Its output is limited to component name, import packages,
external and render-only prop names, diagnostic codes, CSS rule count, file
hashes, and candidate directory. It never prints raw Pixso DSL or tokens.

After manual review, accepted React fixture hashes are recorded in
`fixtures/react-generation/README.md` and checked by
`pnpm verify:fixtures`. The real `4:314` generated golden is derived from the
unchanged lossless `fixtures/pixso/modal-4-314/source.json`.
