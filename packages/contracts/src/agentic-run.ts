import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { closedObject } from "./schema-utils.js";

const sha256Schema = Type.String({ pattern: "^[a-f0-9]{64}$" });

const safeRelativePath = Type.String({
  minLength: 1,
  pattern:
    "^(?![\\\\/])(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+$",
});

export const UigAgenticRunStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("implementation-recorded"),
  Type.Literal("code-review-recorded"),
  Type.Literal("browser-review-recorded"),
  Type.Literal("complete"),
  Type.Literal("partial-success"),
  Type.Literal("generated-with-errors"),
  Type.Literal("blocked"),
  Type.Literal("cancelled"),
]);

export const UigPrepareBuildInputSchema = closedObject({
  source: Type.Union([
    closedObject({
      kind: Type.Literal("pixso-url"),
      url: Type.String({ minLength: 1 }),
      designSystem: Type.String({ minLength: 1 }),
    }),
    closedObject({
      kind: Type.Literal("local-dsl"),
      path: safeRelativePath,
      designSystem: Type.String({ minLength: 1 }),
    }),
    closedObject({
      kind: Type.Literal("stored-run"),
      runId: Type.String({ minLength: 1 }),
    }),
    closedObject({
      kind: Type.Literal("screenshot"),
      path: safeRelativePath,
      pageName: Type.String({ minLength: 1 }),
      designSystem: Type.String({ minLength: 1 }),
    }),
  ]),
  refreshProjectContext: Type.Optional(Type.Boolean()),
});

export const UigPrepareBuildStageSchema = Type.Union([
  Type.Literal("fetch"),
  Type.Literal("normalize"),
  Type.Literal("summarize"),
  Type.Literal("plan"),
  Type.Literal("resolve"),
  Type.Literal("context"),
  Type.Literal("store"),
]);

export const UigPrepareBuildDiagnosticSchema = closedObject({
  code: Type.String({ minLength: 1 }),
  severity: Type.Union([
    Type.Literal("info"),
    Type.Literal("warning"),
    Type.Literal("error"),
  ]),
  blocking: Type.Boolean(),
  stage: UigPrepareBuildStageSchema,
  message: Type.String({ minLength: 1 }),
});

export const UigPrepareBuildComponentSchema = closedObject({
  componentId: Type.String({ minLength: 1 }),
  exportName: Type.String({ minLength: 1 }),
  importSource: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("verified"),
    Type.Literal("mapped"),
    Type.Literal("pack-owned"),
    Type.Literal("suggested"),
  ]),
  semanticRoles: Type.Array(Type.String({ minLength: 1 }), { maxItems: 50 }),
});

export const UigPrepareBuildResultSchema = closedObject({
  schema: Type.Literal("uig-qwen-prepare-build-result/v1"),
  status: Type.Union([
    Type.Literal("ready"),
    Type.Literal("blocked"),
    Type.Literal("ready-with-warnings"),
  ]),
  runId: Type.String({ minLength: 1 }),
  runPath: safeRelativePath,
  sourceKind: Type.Union([
    Type.Literal("pixso-url"),
    Type.Literal("local-dsl"),
    Type.Literal("stored-run"),
    Type.Literal("screenshot"),
  ]),
  designEvidencePath: safeRelativePath,
  projectContextPath: safeRelativePath,
  projectContextFingerprint: Type.Optional(sha256Schema),
  designSystem: Type.String({ minLength: 1 }),
  designSystemVersion: Type.Optional(Type.String({ minLength: 1 })),
  packSha256: Type.Optional(sha256Schema),
  reusableComponents: Type.Array(UigPrepareBuildComponentSchema, {
    maxItems: 100,
  }),
  diagnostics: Type.Array(UigPrepareBuildDiagnosticSchema, { maxItems: 50 }),
});

export const UigRecordImplementationFileSchema = closedObject({
  path: safeRelativePath,
  sha256: sha256Schema,
  kind: Type.Union([
    Type.Literal("page"),
    Type.Literal("preview"),
    Type.Literal("mock"),
    Type.Literal("style"),
    Type.Literal("other"),
  ]),
});

export const UigRecordImplementationAssumptionSchema = closedObject({
  code: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  severity: Type.Union([
    Type.Literal("info"),
    Type.Literal("warning"),
    Type.Literal("error"),
  ]),
});

export const UigRecordImplementationInputSchema = closedObject({
  runId: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("written"),
    Type.Literal("written-with-warnings"),
    Type.Literal("partial"),
    Type.Literal("failed"),
  ]),
  pagePath: safeRelativePath,
  previewPath: safeRelativePath,
  previewUrlPath: Type.String({ minLength: 1 }),
  previewCommand: Type.String({ minLength: 1 }),
  createdFiles: Type.Array(UigRecordImplementationFileSchema, {
    maxItems: 200,
  }),
  modifiedFiles: Type.Array(UigRecordImplementationFileSchema, {
    maxItems: 200,
  }),
  importedComponents: Type.Array(
    closedObject({
      componentId: Type.String({ minLength: 1 }),
      importSource: Type.String({ minLength: 1 }),
      exportName: Type.String({ minLength: 1 }),
    }),
    { maxItems: 100 },
  ),
  assumptions: Type.Array(UigRecordImplementationAssumptionSchema, {
    maxItems: 50,
  }),
  residualErrors: Type.Array(
    closedObject({
      code: Type.String({ minLength: 1 }),
      message: Type.String({ minLength: 1 }),
      path: Type.Optional(safeRelativePath),
    }),
    { maxItems: 50 },
  ),
  notes: Type.Optional(Type.String({ minLength: 1 })),
});

export const UigRecordImplementationResultSchema = closedObject({
  schema: Type.Literal("uig-qwen-record-implementation-result/v1"),
  runId: Type.String({ minLength: 1 }),
  runStatus: UigAgenticRunStatusSchema,
  reportPath: safeRelativePath,
  reportSha256: sha256Schema,
  importedComponents: Type.Array(
    closedObject({
      componentId: Type.String({ minLength: 1 }),
      importSource: Type.String({ minLength: 1 }),
      exportName: Type.String({ minLength: 1 }),
    }),
    { maxItems: 100 },
  ),
  accepted: Type.Boolean(),
  rejection: Type.Optional(
    closedObject({
      code: Type.String({ minLength: 1 }),
      message: Type.String({ minLength: 1 }),
    }),
  ),
});

export const UigRecordCodeReviewIssueSchema = closedObject({
  code: Type.String({ minLength: 1 }),
  severity: Type.Union([
    Type.Literal("info"),
    Type.Literal("warning"),
    Type.Literal("error"),
  ]),
  path: Type.Optional(safeRelativePath),
  message: Type.String({ minLength: 1 }),
});

export const UigRecordCodeReviewInputSchema = closedObject({
  runId: Type.String({ minLength: 1 }),
  verdict: Type.Union([
    Type.Literal("approved"),
    Type.Literal("approved-with-fixes"),
    Type.Literal("changes-requested"),
  ]),
  tsc: Type.Union([Type.Literal("passed"), Type.Literal("failed")]),
  lint: Type.Union([
    Type.Literal("passed"),
    Type.Literal("failed"),
    Type.Literal("not-configured"),
  ]),
  autoFixed: Type.Array(
    closedObject({
      path: safeRelativePath,
      beforeSha256: sha256Schema,
      afterSha256: sha256Schema,
      reason: Type.String({ minLength: 1 }),
    }),
    { maxItems: 100 },
  ),
  remainingIssues: Type.Array(UigRecordCodeReviewIssueSchema, {
    maxItems: 100,
  }),
  notes: Type.Optional(Type.String({ minLength: 1 })),
});

export const UigRecordCodeReviewResultSchema = closedObject({
  schema: Type.Literal("uig-qwen-record-code-review-result/v1"),
  runId: Type.String({ minLength: 1 }),
  runStatus: UigAgenticRunStatusSchema,
  reportPath: safeRelativePath,
  reportSha256: sha256Schema,
  accepted: Type.Boolean(),
  rejection: Type.Optional(
    closedObject({
      code: Type.String({ minLength: 1 }),
      message: Type.String({ minLength: 1 }),
    }),
  ),
});

export const UigRecordBrowserReviewScreenshotSchema = closedObject({
  viewport: Type.Union([Type.Literal("desktop"), Type.Literal("narrow")]),
  path: safeRelativePath,
  sha256: sha256Schema,
});

export const UigRecordBrowserReviewIssueSchema = closedObject({
  code: Type.String({ minLength: 1 }),
  severity: Type.Union([
    Type.Literal("info"),
    Type.Literal("warning"),
    Type.Literal("error"),
  ]),
  source: Type.Union([
    Type.Literal("console"),
    Type.Literal("pageerror"),
    Type.Literal("network"),
    Type.Literal("layout"),
  ]),
  message: Type.String({ minLength: 1 }),
});

export const UigRecordBrowserReviewInputSchema = closedObject({
  runId: Type.String({ minLength: 1 }),
  verdict: Type.Union([
    Type.Literal("ok"),
    Type.Literal("ok-with-warnings"),
    Type.Literal("failed"),
  ]),
  devServerCommand: Type.String({ minLength: 1 }),
  previewUrl: Type.String({ minLength: 1 }),
  screenshots: Type.Array(UigRecordBrowserReviewScreenshotSchema, {
    minItems: 1,
    maxItems: 4,
  }),
  unresolvedErrors: Type.Array(UigRecordBrowserReviewIssueSchema, {
    maxItems: 100,
  }),
  runtimeFixes: Type.Array(
    closedObject({
      path: safeRelativePath,
      beforeSha256: sha256Schema,
      afterSha256: sha256Schema,
      reason: Type.String({ minLength: 1 }),
    }),
    { maxItems: 100 },
  ),
  notes: Type.Optional(Type.String({ minLength: 1 })),
});

export const UigRecordBrowserReviewResultSchema = closedObject({
  schema: Type.Literal("uig-qwen-record-browser-review-result/v1"),
  runId: Type.String({ minLength: 1 }),
  runStatus: UigAgenticRunStatusSchema,
  reportPath: safeRelativePath,
  reportSha256: sha256Schema,
  accepted: Type.Boolean(),
  rejection: Type.Optional(
    closedObject({
      code: Type.String({ minLength: 1 }),
      message: Type.String({ minLength: 1 }),
    }),
  ),
});

export type UigAgenticRunStatus = Static<typeof UigAgenticRunStatusSchema>;
export type UigPrepareBuildInput = Static<typeof UigPrepareBuildInputSchema>;
export type UigPrepareBuildStage = Static<typeof UigPrepareBuildStageSchema>;
export type UigPrepareBuildDiagnostic = Static<
  typeof UigPrepareBuildDiagnosticSchema
>;
export type UigPrepareBuildComponent = Static<
  typeof UigPrepareBuildComponentSchema
>;
export type UigPrepareBuildResult = Static<typeof UigPrepareBuildResultSchema>;
export type UigRecordImplementationFile = Static<
  typeof UigRecordImplementationFileSchema
>;
export type UigRecordImplementationAssumption = Static<
  typeof UigRecordImplementationAssumptionSchema
>;
export type UigRecordImplementationInput = Static<
  typeof UigRecordImplementationInputSchema
>;
export type UigRecordImplementationResult = Static<
  typeof UigRecordImplementationResultSchema
>;
export type UigRecordCodeReviewIssue = Static<
  typeof UigRecordCodeReviewIssueSchema
>;
export type UigRecordCodeReviewInput = Static<
  typeof UigRecordCodeReviewInputSchema
>;
export type UigRecordCodeReviewResult = Static<
  typeof UigRecordCodeReviewResultSchema
>;
export type UigRecordBrowserReviewScreenshot = Static<
  typeof UigRecordBrowserReviewScreenshotSchema
>;
export type UigRecordBrowserReviewIssue = Static<
  typeof UigRecordBrowserReviewIssueSchema
>;
export type UigRecordBrowserReviewInput = Static<
  typeof UigRecordBrowserReviewInputSchema
>;
export type UigRecordBrowserReviewResult = Static<
  typeof UigRecordBrowserReviewResultSchema
>;
