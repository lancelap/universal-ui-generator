import type {
  DesignSnapshot,
  Diagnostic,
  GenerationRun,
  ReactGenerationReport,
  ResolutionPlanV2,
} from "@uig/contracts";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const relativeArtifactPathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !path.split("/").includes(".."),
    "Expected a safe relative artifact path",
  );

export const UigPlanInputSchema = z
  .object({
    url: z.string().url().startsWith("https://pixso.net/app/design/"),
    designSystem: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .default("sber-space-ui"),
  })
  .strict();

export const UigGenerateInputSchema = z
  .object({
    runId: z.string().regex(/^run_[A-Za-z0-9_-]+$/),
  })
  .strict();

export const CompactDiagnosticSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "error"]),
    blocking: z.boolean(),
    stage: z.string().min(1),
    manifestNodeId: z.string().min(1).optional(),
    sourceNodeId: z.string().min(1).optional(),
    message: z.string().min(1),
  })
  .strict();

export const CompactDiagnosticsSchema = z
  .object({
    items: z.array(CompactDiagnosticSchema).max(50),
    totalCount: z.number().int().nonnegative(),
    returnedCount: z.number().int().nonnegative().max(50),
    truncated: z.boolean(),
    artifactPath: relativeArtifactPathSchema,
  })
  .strict();

export const UigPlanResultSchema = z
  .object({
    schema: z.literal("uig-qwen-plan-result/v1"),
    status: z.enum(["ready", "blocked"]),
    runId: z.string().min(1),
    runPath: relativeArtifactPathSchema,
    source: z
      .object({
        fileKey: z.string().min(1),
        nodeId: z.string().min(1),
      })
      .strict(),
    target: z
      .object({
        designSystem: z.string().min(1),
        designSystemVersion: z.string().min(1),
        packSha256: sha256Schema,
      })
      .strict(),
    summary: z
      .object({
        reuse: z.number().int().nonnegative(),
        compose: z.number().int().nonnegative(),
        fallback: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
      })
      .strict(),
    diagnostics: CompactDiagnosticsSchema,
  })
  .strict();

export const UigGenerateResultSchema = z
  .object({
    schema: z.literal("uig-qwen-generate-result/v1"),
    status: z.enum(["generated", "blocked"]),
    runId: z.string().min(1),
    outputPath: relativeArtifactPathSchema,
    writeStatus: z.enum(["written", "identical"]),
    files: z.array(
      z
        .object({
          path: relativeArtifactPathSchema,
          sha256: sha256Schema,
        })
        .strict(),
    ),
    imports: z.array(
      z
        .object({
          package: z.string().min(1),
          exports: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    renderOnlyProps: z.array(
      z
        .object({
          manifestNodeId: z.string().min(1),
          targets: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    diagnostics: CompactDiagnosticsSchema,
  })
  .strict();

export type UigPlanInput = z.infer<typeof UigPlanInputSchema>;
export type UigGenerateInput = z.infer<typeof UigGenerateInputSchema>;
export type CompactDiagnostic = z.infer<typeof CompactDiagnosticSchema>;
export type CompactDiagnostics = z.infer<typeof CompactDiagnosticsSchema>;
export type UigPlanResult = z.infer<typeof UigPlanResultSchema>;
export type UigGenerateResult = z.infer<typeof UigGenerateResultSchema>;

export function compactDiagnostics(
  diagnostics: readonly Diagnostic[],
  artifactPath: string,
): CompactDiagnostics {
  const items = diagnostics.slice(0, 50).map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    blocking: diagnostic.blocking,
    stage: diagnostic.stage,
    ...(diagnostic.source?.manifestNodeId
      ? { manifestNodeId: diagnostic.source.manifestNodeId }
      : {}),
    ...(diagnostic.source?.nodeId
      ? { sourceNodeId: diagnostic.source.nodeId }
      : {}),
    message: diagnostic.message,
  }));

  return CompactDiagnosticsSchema.parse({
    items,
    totalCount: diagnostics.length,
    returnedCount: items.length,
    truncated: diagnostics.length > items.length,
    artifactPath,
  });
}

export function buildPlanResult(input: {
  run: GenerationRun;
  runPath: string;
  snapshot: DesignSnapshot;
  resolutionPlan: ResolutionPlanV2;
}): UigPlanResult {
  return UigPlanResultSchema.parse({
    schema: "uig-qwen-plan-result/v1",
    status: input.run.status === "blocked" ? "blocked" : "ready",
    runId: input.run.runId,
    runPath: input.runPath,
    source: {
      fileKey: input.snapshot.source.documentId,
      nodeId: input.snapshot.source.nodeId,
    },
    target: {
      designSystem: input.resolutionPlan.target.designSystem,
      designSystemVersion: input.resolutionPlan.target.designSystemVersion,
      packSha256: input.resolutionPlan.target.packSha256,
    },
    summary: input.resolutionPlan.summary,
    diagnostics: compactDiagnostics(
      input.resolutionPlan.diagnostics,
      `${input.runPath}/${input.run.artifacts.diagnostics}`,
    ),
  });
}

export function buildGenerateResult(input: {
  runId: string;
  outputPath: string;
  writeStatus: "written" | "identical";
  report: ReactGenerationReport;
  reportSha256: string;
  resolutionPlan: ResolutionPlanV2;
}): UigGenerateResult {
  if (input.report.sourceRunId !== input.runId) {
    throw new Error(
      `Generation report run ID ${JSON.stringify(
        input.report.sourceRunId,
      )} does not match ${JSON.stringify(input.runId)}`,
    );
  }

  const files = [
    ...input.report.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
    })),
    {
      path: "generation-report.json",
      sha256: input.reportSha256,
    },
  ].sort((left, right) => compareText(left.path, right.path));

  const importsByPackage = new Map<string, Set<string>>();
  for (const node of input.resolutionPlan.nodes) {
    const bindings =
      node.decision === "reuse"
        ? [node.binding]
        : node.decision === "compose"
          ? node.bindings
          : [];
    for (const binding of bindings) {
      const exports =
        importsByPackage.get(binding.package) ?? new Set<string>();
      exports.add(binding.export);
      importsByPackage.set(binding.package, exports);
    }
  }
  const imports = [...importsByPackage]
    .sort(([left], [right]) => compareText(left, right))
    .map(([packageName, exports]) => ({
      package: packageName,
      exports: [...exports].sort(compareText),
    }));

  const renderOnlyProps =
    "renderOnlyProps" in input.report
      ? input.report.renderOnlyProps
          .map((entry) => ({
            manifestNodeId: entry.manifestNodeId,
            targets: [...entry.propNames].sort(compareText),
          }))
          .sort((left, right) =>
            compareText(left.manifestNodeId, right.manifestNodeId),
          )
      : [];

  return UigGenerateResultSchema.parse({
    schema: "uig-qwen-generate-result/v1",
    status: input.report.status,
    runId: input.runId,
    outputPath: input.outputPath,
    writeStatus: input.writeStatus,
    files,
    imports,
    renderOnlyProps,
    diagnostics: compactDiagnostics(
      input.report.diagnostics,
      `${input.outputPath}/generation-report.json`,
    ),
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
