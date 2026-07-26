# Diagnostics

Diagnostics use `{ severity, blocking, stage, code, message }` plus optional
source, evidence, and suggestions. A blocking diagnostic prevents a successful
resolution but does not delete the run artifacts. Warnings keep the run
reviewable as `completed-with-warnings`.

Provider and input failures are formatted as `CODE: message` and exit with code
`1`. A completed planning pipeline whose resolution contains blocking
diagnostics exits with code `2`.

## Pixso provider

| Code                     | Meaning                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `PIXSO_URL_INVALID`      | URL is invalid, unsupported, lacks a design file key, or lacks `item-id` |
| `PIXSO_TOKEN_MISSING`    | A live command has no local `PIXSO_ACCESS_TOKEN`                         |
| `PIXSO_AUTH_FAILED`      | Pixso rejected the token                                                 |
| `PIXSO_NODE_NOT_FOUND`   | Requested file/node could not be found                                   |
| `PIXSO_REQUEST_FAILED`   | Transport or remote tool request failed                                  |
| `PIXSO_RESPONSE_INVALID` | MCP content is not valid JSON or lacks a DSL object/version              |

## Artifact store and bounded queries

| Code                             | Meaning                                              |
| -------------------------------- | ---------------------------------------------------- |
| `ARTIFACT_ID_INVALID`            | Artifact ID does not match the public ID format      |
| `ARTIFACT_METADATA_INVALID`      | Stored metadata is malformed or refers to another ID |
| `DESIGN_QUERY_LIMIT_INVALID`     | Query limit is invalid                               |
| `DESIGN_QUERY_DEPTH_INVALID`     | Visible-tree depth is invalid                        |
| `DESIGN_QUERY_CURSOR_INVALID`    | Cursor cannot be decoded or validated                |
| `DESIGN_QUERY_CURSOR_MISMATCH`   | Cursor belongs to another query or DesignIR          |
| `DESIGN_QUERY_ROOT_NOT_FOUND`    | Requested query root is absent                       |
| `DESIGN_SUMMARY_LIMIT_TOO_SMALL` | Byte budget cannot hold even the mandatory summary   |

## Normalization

| Code                            | Blocking | Meaning                                                                                      |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `DESIGN_DSL_UNSUPPORTED`        | yes      | DSL envelope, identity, geometry, reference structure, or normalized contract is unsupported |
| `DESIGN_NODE_REFERENCE_MISSING` | yes      | A child reference cannot be resolved                                                         |
| `DESIGN_PAINT_UNSUPPORTED`      | no       | A paint cannot be represented; the node retains an `unsupported` paint and evidence          |

## Semantic planning

| Code                          | Blocking | Meaning                                                           |
| ----------------------------- | -------- | ----------------------------------------------------------------- |
| `SEMANTIC_MAPPING_CONFLICT`   | yes      | Exact Pixso mappings claim the same key/variant inconsistently    |
| `SEMANTIC_CONFIDENCE_TOO_LOW` | yes      | No role reached the warning threshold                             |
| `SEMANTIC_ROLE_AMBIGUOUS`     | no       | Role passed the warning threshold but not the automatic threshold |

## Pack validation

| Code                              | Meaning                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `DESIGN_SYSTEM_PACK_INVALID`      | Manifest/file schema, path containment, duplicate definition, or pack structure is invalid |
| `COMPONENT_CATALOG_ENTRY_INVALID` | Catalog ownership or role-policy candidate entry is inconsistent                           |
| `RULE_REFERENCE_MISSING`          | Policy, verification, companion, or composition points to an unknown component             |
| `COMPOSITION_CYCLE_DETECTED`      | Required-component graph contains a cycle                                                  |
| `COMPONENT_EXPORT_UNVERIFIED`     | A reusable component or its composition closure lacks verification                         |

Pack-validation errors stop before semantic resolution.

## Component resolution

| Code                               | Blocking | Meaning                                                                           |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `SEMANTIC_POLICY_MISSING`          | yes      | Pack has no policy for the semantic role                                          |
| `COMPONENT_CAPABILITY_MISSING`     | yes      | Candidates exist but do not satisfy required capabilities/form adapter            |
| `COMPONENT_EXPORT_UNVERIFIED`      | yes      | Selected component or composition member is unverified                            |
| `COMPONENT_COMPOSITION_INCOMPLETE` | yes      | Required composition is not permitted or complete                                 |
| `NATIVE_FALLBACK_FORBIDDEN`        | yes      | No verified component decision exists and pack forbids local fallback             |
| `COMPONENT_UNRESOLVED`             | yes      | Current packs' policy-specific unresolved code                                    |
| `VISUAL_TOKEN_MISMATCH`            | no       | Resolution is usable but reviewed DesignIR appearance differs from the pack token |

`diagnosticCodes` on each resolution node mirrors the blocking decision code;
the top-level `diagnostics` array contains the reader-facing detail.
