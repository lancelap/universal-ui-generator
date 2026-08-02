import type { ProjectScanCommandResult } from "@uig/project-context";
import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const safePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !value.includes("\\") &&
      !value.split("/").includes(".."),
    "Expected a safe workspace-relative path",
  );
const identifier = z.string().min(1).max(256);
const boundedStrings = z.array(identifier).max(50);

const PublicRootSchema = z
  .object({
    path: safePath,
    entry: safePath,
    importSource: identifier,
  })
  .strict();

export const UiContextConfigInputSchema = z
  .object({
    schema: z.literal("ui-context-config/v1"),
    framework: z.literal("react"),
    language: z.literal("typescript"),
    designSystemPacks: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9._-]*$/))
      .max(20),
    componentRoots: z.array(PublicRootSchema).max(100),
    iconRoots: z.array(PublicRootSchema).max(100),
    workspacePackages: z
      .object({ discovery: z.literal("public-exports") })
      .strict(),
    ignore: z.array(safePath).max(100),
  })
  .strict();

export const ProjectScanInputSchema = z
  .object({
    acceptDiscoveredConfig: z.boolean().optional(),
    discoveryId: sha256.optional(),
    acceptedConfig: UiContextConfigInputSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.acceptDiscoveredConfig === true &&
      (!value.discoveryId || !value.acceptedConfig)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "discoveryId and acceptedConfig are required when accepting configuration",
      });
    }
  });

export const ProjectComponentSearchInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    semanticRole: identifier.optional(),
    status: z.enum(["suggested", "mapped", "pack-owned"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export const ComponentContractInputSchema = z
  .object({ componentId: identifier })
  .strict();
export const IconPathsInputSchema = z
  .object({ names: z.array(identifier).min(1).max(50) })
  .strict();

const MappingChangeSchema = z
  .object({
    componentId: identifier,
    semanticRoles: boundedStrings,
    capabilities: boundedStrings,
    formAdapters: boundedStrings,
  })
  .strict();
export const MappingMutationInputSchema = z
  .object({
    catalogFingerprint: sha256,
    mappings: z.array(MappingChangeSchema).min(1).max(50),
  })
  .strict();
export const EmptyInputSchema = z.object({}).strict();

const diagnostic = z
  .object({
    severity: z.enum(["info", "warning", "error", "fatal"]),
    code: identifier,
    message: z.string().min(1).max(1000),
    path: safePath.optional(),
    componentId: identifier.optional(),
  })
  .strict();
const diagnostics = z
  .object({
    total: z.number().int().nonnegative(),
    returned: z.array(diagnostic).max(50),
    truncated: z.boolean(),
  })
  .strict();
const summary = z
  .object({
    verifiedComponents: z.number().int().nonnegative(),
    verifiedIcons: z.number().int().nonnegative(),
    mappedRoles: z.number().int().nonnegative(),
    suggestedRoles: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  })
  .strict();

export const ProjectScanResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("needs-configuration"),
      discoveryId: sha256,
      proposedConfig: UiContextConfigInputSchema,
      diagnostics: z.array(diagnostic).max(50),
    })
    .strict(),
  z
    .object({
      status: z.literal("completed"),
      catalog: z
        .object({ path: safePath, sha256, fingerprint: sha256 })
        .strict(),
      summary,
      diagnostics,
    })
    .strict(),
  z
    .object({
      status: z.literal("blocked"),
      stage: z.literal("project-scan"),
      diagnostics,
      artifactPath: safePath,
    })
    .strict(),
]);

const verifiedImport = z
  .object({
    source: identifier,
    export: identifier,
    style: z.enum(["named", "default"]),
  })
  .strict();
const semantic = z
  .object({
    role: identifier,
    status: z.enum(["suggested", "mapped", "pack-owned"]),
    confidence: z.number().min(0).max(1),
    source: safePath,
  })
  .strict();
const namedBinding = z
  .object({
    name: identifier,
    status: z.enum(["suggested", "mapped", "pack-owned"]),
    confidence: z.number().min(0).max(1),
    source: safePath,
  })
  .strict();

export const ProjectComponentSearchResultSchema = z
  .object({
    catalogFingerprint: sha256,
    catalogPath: safePath,
    totalCount: z.number().int().nonnegative(),
    returnedCount: z.number().int().nonnegative().max(50),
    truncated: z.boolean(),
    results: z
      .array(
        z
          .object({
            componentId: identifier,
            exportName: identifier,
            import: verifiedImport,
            score: z.number().nonnegative(),
            semantics: z.array(semantic).max(50),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

const contractRef = z.union([
  z
    .object({ artifact: z.literal("public-components"), id: identifier })
    .strict(),
  z
    .object({
      artifact: z.literal("installed-packages"),
      package: identifier,
      export: identifier,
    })
    .strict(),
]);
const normalizedType: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z
      .object({
        kind: z.enum([
          "string",
          "number",
          "boolean",
          "void",
          "react-node",
          "react-element",
        ]),
      })
      .strict(),
    z
      .object({
        kind: z.literal("enum"),
        values: z.array(z.union([z.string(), z.number(), z.boolean()])),
      })
      .strict(),
    z.object({ kind: z.literal("array"), element: normalizedType }).strict(),
    z
      .object({ kind: z.literal("tuple"), elements: z.array(normalizedType) })
      .strict(),
    z
      .object({
        kind: z.literal("object"),
        properties: z.array(
          z
            .object({
              name: identifier,
              required: z.boolean(),
              type: normalizedType,
            })
            .strict(),
        ),
      })
      .strict(),
    z
      .object({
        kind: z.literal("function"),
        parameters: z.array(
          z.object({ name: identifier, type: normalizedType }).strict(),
        ),
        returns: normalizedType,
      })
      .strict(),
    z.object({ kind: z.literal("reference"), name: identifier }).strict(),
    z
      .object({
        kind: z.literal("opaque"),
        displayName: identifier,
        reason: z.string().min(1),
      })
      .strict(),
  ]),
);
const exactContract = z
  .object({
    propsType: identifier,
    acceptsChildren: z.boolean(),
    props: z
      .array(
        z
          .object({
            name: identifier,
            required: z.boolean(),
            type: normalizedType,
            description: z.string().min(1).optional(),
            deprecated: z.boolean(),
          })
          .strict(),
      )
      .max(200),
    summary: z.string().min(1).optional(),
    deprecated: z.boolean().optional(),
  })
  .strict();
const evidence = z
  .array(
    z.union([
      z
        .object({
          kind: z.literal("public-export"),
          path: safePath,
          export: identifier,
        })
        .strict(),
      z
        .object({
          kind: z.literal("typescript-contract"),
          path: safePath,
          symbol: identifier,
        })
        .strict(),
    ]),
  )
  .max(50);

export const ComponentContractResultSchema = z
  .object({
    componentId: identifier,
    import: verifiedImport,
    contractRef,
    semantics: z.array(semantic).max(50),
    capabilities: z.array(namedBinding).max(50),
    formAdapters: z.array(namedBinding).max(50),
    annotations: boundedStrings,
    restrictions: boundedStrings,
    deprecated: z.boolean(),
    contract: exactContract.optional(),
    evidence: evidence.optional(),
    catalogFingerprint: sha256,
    catalogPath: safePath,
  })
  .strict();

const iconResult = z.union([
  z
    .object({
      name: identifier,
      status: z.literal("resolved"),
      import: verifiedImport,
      componentId: identifier,
    })
    .strict(),
  z
    .object({
      name: identifier,
      status: z.literal("ambiguous"),
      candidates: z
        .array(
          z
            .object({ componentId: identifier, import: verifiedImport })
            .strict(),
        )
        .max(50),
    })
    .strict(),
  z
    .object({
      name: identifier,
      status: z.literal("unresolved"),
      suggestions: boundedStrings,
    })
    .strict(),
]);
export const IconPathsResultSchema = z
  .object({
    catalogFingerprint: sha256,
    catalogPath: safePath,
    results: z.array(iconResult).max(50),
  })
  .strict();

export const MappingMutationResultSchema = z
  .object({
    mappingPath: safePath,
    catalogPath: safePath,
    catalogSha256: sha256,
    catalogFingerprint: sha256,
    summary,
  })
  .strict();

export const ProjectStatusResultSchema = z
  .object({
    status: z.enum(["missing", "ready", "stale", "blocked"]),
    changed: boundedStrings,
    catalog: z
      .object({ path: safePath, fingerprint: sha256 })
      .strict()
      .optional(),
  })
  .strict();

export type ProjectToolResult =
  | z.infer<typeof ProjectScanResultSchema>
  | z.infer<typeof ProjectComponentSearchResultSchema>
  | z.infer<typeof ComponentContractResultSchema>
  | z.infer<typeof IconPathsResultSchema>
  | z.infer<typeof MappingMutationResultSchema>
  | z.infer<typeof ProjectStatusResultSchema>;

export function compactProjectScanResult(
  result: ProjectScanCommandResult,
): z.infer<typeof ProjectScanResultSchema> {
  if (result.status === "needs-configuration") {
    return ProjectScanResultSchema.parse({
      ...result,
      diagnostics: result.diagnostics.slice(0, 50).map(compactDiagnostic),
    });
  }
  return ProjectScanResultSchema.parse({
    ...result,
    diagnostics: {
      ...result.diagnostics,
      returned: result.diagnostics.returned.slice(0, 50).map(compactDiagnostic),
    },
  });
}

function compactDiagnostic(value: {
  severity: "info" | "warning" | "error" | "fatal";
  code: string;
  message: string;
  path?: string;
  componentId?: string;
}) {
  return {
    severity: value.severity,
    code: value.code,
    message: value.message,
    ...(value.path ? { path: value.path } : {}),
    ...(value.componentId ? { componentId: value.componentId } : {}),
  };
}
