import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const safeRelativePath = z
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

const componentStatus = z.enum([
  "verified",
  "mapped",
  "pack-owned",
  "suggested",
]);

const componentFileKind = z.enum(["page", "preview", "mock", "style", "other"]);

const importRecord = z.object({
  componentId: z.string().min(1),
  importSource: z.string().min(1),
  exportName: z.string().min(1),
});

export const UigPrepareBuildInputSchema = z
  .object({
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("pixso-url"),
          url: z.string().min(1),
          designSystem: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("local-dsl"),
          path: safeRelativePath,
          designSystem: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("stored-run"),
          runId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          kind: z.literal("screenshot"),
          path: safeRelativePath,
          pageName: z.string().min(1),
          designSystem: z.string().min(1),
        })
        .strict(),
    ]),
    refreshProjectContext: z.boolean().optional(),
  })
  .strict();

export const UigPrepareBuildResultSchema = z
  .object({
    schema: z.literal("uig-qwen-prepare-build-result/v1"),
    status: z.enum(["ready", "blocked", "ready-with-warnings"]),
    runId: z.string().min(1),
    runPath: safeRelativePath,
    sourceKind: z.enum(["pixso-url", "local-dsl", "stored-run", "screenshot"]),
    designEvidencePath: safeRelativePath,
    projectContextPath: safeRelativePath,
    projectContextFingerprint: sha256Schema.optional(),
    designSystem: z.string().min(1),
    designSystemVersion: z.string().min(1).optional(),
    packSha256: sha256Schema.optional(),
    reusableComponents: z
      .array(
        z
          .object({
            componentId: z.string().min(1),
            exportName: z.string().min(1),
            importSource: z.string().min(1),
            status: componentStatus,
            semanticRoles: z.array(z.string().min(1)).max(50),
          })
          .strict(),
      )
      .max(100),
    diagnostics: z
      .array(
        z
          .object({
            code: z.string().min(1),
            severity: z.enum(["info", "warning", "error"]),
            blocking: z.boolean(),
            stage: z.enum([
              "fetch",
              "normalize",
              "summarize",
              "plan",
              "resolve",
              "context",
              "store",
            ]),
            message: z.string().min(1),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export const UigRecordImplementationInputSchema = z
  .object({
    runId: z.string().min(1),
    status: z.enum(["written", "written-with-warnings", "partial", "failed"]),
    pagePath: safeRelativePath,
    previewPath: safeRelativePath,
    previewUrlPath: z.string().min(1),
    previewCommand: z.string().min(1),
    createdFiles: z
      .array(
        z
          .object({
            path: safeRelativePath,
            sha256: sha256Schema,
            kind: componentFileKind,
          })
          .strict(),
      )
      .max(200),
    modifiedFiles: z
      .array(
        z
          .object({
            path: safeRelativePath,
            sha256: sha256Schema,
            kind: componentFileKind,
          })
          .strict(),
      )
      .max(200),
    importedComponents: z.array(importRecord).max(100),
    assumptions: z
      .array(
        z
          .object({
            code: z.string().min(1),
            description: z.string().min(1),
            severity: z.enum(["info", "warning", "error"]),
          })
          .strict(),
      )
      .max(50),
    residualErrors: z
      .array(
        z
          .object({
            code: z.string().min(1),
            message: z.string().min(1),
            path: safeRelativePath.optional(),
          })
          .strict(),
      )
      .max(50),
    notes: z.string().min(1).optional(),
  })
  .strict();

export const UigRecordImplementationResultSchema = z
  .object({
    schema: z.literal("uig-qwen-record-implementation-result/v1"),
    runId: z.string().min(1),
    runStatus: z.enum([
      "pending",
      "implementation-recorded",
      "code-review-recorded",
      "browser-review-recorded",
      "complete",
      "partial-success",
      "generated-with-errors",
      "blocked",
      "cancelled",
    ]),
    reportPath: safeRelativePath,
    reportSha256: sha256Schema,
    importedComponents: z.array(importRecord).max(100),
    accepted: z.boolean(),
    rejection: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const UigRecordCodeReviewInputSchema = z
  .object({
    runId: z.string().min(1),
    verdict: z.enum(["approved", "approved-with-fixes", "changes-requested"]),
    tsc: z.enum(["passed", "failed"]),
    lint: z.enum(["passed", "failed", "not-configured"]),
    autoFixed: z
      .array(
        z
          .object({
            path: safeRelativePath,
            beforeSha256: sha256Schema,
            afterSha256: sha256Schema,
            reason: z.string().min(1),
          })
          .strict(),
      )
      .max(100),
    remainingIssues: z
      .array(
        z
          .object({
            code: z.string().min(1),
            severity: z.enum(["info", "warning", "error"]),
            path: safeRelativePath.optional(),
            message: z.string().min(1),
          })
          .strict(),
      )
      .max(100),
    notes: z.string().min(1).optional(),
  })
  .strict();

export const UigRecordCodeReviewResultSchema = z
  .object({
    schema: z.literal("uig-qwen-record-code-review-result/v1"),
    runId: z.string().min(1),
    runStatus: z.enum([
      "pending",
      "implementation-recorded",
      "code-review-recorded",
      "browser-review-recorded",
      "complete",
      "partial-success",
      "generated-with-errors",
      "blocked",
      "cancelled",
    ]),
    reportPath: safeRelativePath,
    reportSha256: sha256Schema,
    accepted: z.boolean(),
    rejection: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const UigRecordBrowserReviewInputSchema = z
  .object({
    runId: z.string().min(1),
    verdict: z.enum(["ok", "ok-with-warnings", "failed"]),
    devServerCommand: z.string().min(1),
    previewUrl: z.string().min(1),
    screenshots: z
      .array(
        z
          .object({
            viewport: z.enum(["desktop", "narrow"]),
            path: safeRelativePath,
            sha256: sha256Schema,
          })
          .strict(),
      )
      .min(1)
      .max(4),
    unresolvedErrors: z
      .array(
        z
          .object({
            code: z.string().min(1),
            severity: z.enum(["info", "warning", "error"]),
            source: z.enum(["console", "pageerror", "network", "layout"]),
            message: z.string().min(1),
          })
          .strict(),
      )
      .max(100),
    runtimeFixes: z
      .array(
        z
          .object({
            path: safeRelativePath,
            beforeSha256: sha256Schema,
            afterSha256: sha256Schema,
            reason: z.string().min(1),
          })
          .strict(),
      )
      .max(100),
    notes: z.string().min(1).optional(),
  })
  .strict();

export const UigRecordBrowserReviewResultSchema = z
  .object({
    schema: z.literal("uig-qwen-record-browser-review-result/v1"),
    runId: z.string().min(1),
    runStatus: z.enum([
      "pending",
      "implementation-recorded",
      "code-review-recorded",
      "browser-review-recorded",
      "complete",
      "partial-success",
      "generated-with-errors",
      "blocked",
      "cancelled",
    ]),
    reportPath: safeRelativePath,
    reportSha256: sha256Schema,
    accepted: z.boolean(),
    rejection: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
