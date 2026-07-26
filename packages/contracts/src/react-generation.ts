import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

import { DiagnosticSchema } from "./diagnostic.js";
import { closedObject } from "./schema-utils.js";

export const GeneratedSourceFileKindSchema = Type.Union([
  Type.Literal("tsx"),
  Type.Literal("css-module"),
  Type.Literal("fallback-tsx"),
  Type.Literal("fallback-css-module"),
]);

const SafeGeneratedPathSchema = Type.String({
  minLength: 1,
  pattern:
    "^(?![\\\\/])(?![A-Za-z]:[\\\\/])(?!.*(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)).+$",
});

export const GeneratedSourceFileReportSchema = closedObject({
  path: SafeGeneratedPathSchema,
  kind: GeneratedSourceFileKindSchema,
  sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  byteLength: Type.Integer({ minimum: 0 }),
});

const InputValidationStatusSchema = Type.Union([
  Type.Literal("passed"),
  Type.Literal("failed"),
]);

const StatisticsSchema = closedObject({
  manifestNodes: Type.Integer({ minimum: 0 }),
  imports: Type.Integer({ minimum: 0 }),
  generatedProps: Type.Integer({ minimum: 0 }),
  cssRules: Type.Integer({ minimum: 0 }),
  fallbackComponents: Type.Integer({ minimum: 0 }),
  filesByKind: closedObject({
    tsx: Type.Integer({ minimum: 0 }),
    cssModule: Type.Integer({ minimum: 0 }),
    fallbackTsx: Type.Integer({ minimum: 0 }),
    fallbackCssModule: Type.Integer({ minimum: 0 }),
  }),
  sourceByteLength: Type.Integer({ minimum: 0 }),
});

const ReportV1CommonProperties = {
  schema: Type.Literal("react-generation-report/v1"),
  sourceRunId: Type.String({ minLength: 1 }),
  designSystem: Type.String({ minLength: 1 }),
  statistics: StatisticsSchema,
};

export const GeneratedReactGenerationReportV1Schema = closedObject({
  ...ReportV1CommonProperties,
  status: Type.Literal("generated"),
  componentName: Type.String({ minLength: 1 }),
  validation: closedObject({
    inputContracts: Type.Literal("passed"),
    pack: Type.Literal("passed"),
    syntax: Type.Literal("passed"),
    targetTypecheck: Type.Literal("not-run"),
  }),
  files: Type.Array(GeneratedSourceFileReportSchema, { minItems: 1 }),
  diagnostics: Type.Array(DiagnosticSchema),
});

export const BlockedReactGenerationReportV1Schema = closedObject({
  ...ReportV1CommonProperties,
  status: Type.Literal("blocked"),
  componentName: Type.Optional(Type.String({ minLength: 1 })),
  validation: closedObject({
    inputContracts: InputValidationStatusSchema,
    pack: InputValidationStatusSchema,
    syntax: Type.Literal("not-run"),
    targetTypecheck: Type.Literal("not-run"),
  }),
  files: Type.Array(GeneratedSourceFileReportSchema, { maxItems: 0 }),
  diagnostics: Type.Array(DiagnosticSchema, { minItems: 1 }),
});

export const ReactGenerationReportV1Schema = Type.Union([
  GeneratedReactGenerationReportV1Schema,
  BlockedReactGenerationReportV1Schema,
]);

export const RenderOnlyPropReportSchema = closedObject({
  manifestNodeId: Type.String({ minLength: 1 }),
  componentId: Type.String({ minLength: 1 }),
  propNames: Type.Array(Type.String({ minLength: 1 })),
});

const ReportV2CommonProperties = {
  schema: Type.Literal("react-generation-report/v2"),
  sourceRunId: Type.String({ minLength: 1 }),
  designSystem: Type.String({ minLength: 1 }),
  statistics: StatisticsSchema,
  renderOnlyProps: Type.Array(RenderOnlyPropReportSchema),
};

export const GeneratedReactGenerationReportV2Schema = closedObject({
  ...ReportV2CommonProperties,
  status: Type.Literal("generated"),
  componentName: Type.String({ minLength: 1 }),
  validation: closedObject({
    inputContracts: Type.Literal("passed"),
    pack: Type.Literal("passed"),
    syntax: Type.Literal("passed"),
    targetTypecheck: Type.Literal("not-run"),
  }),
  files: Type.Array(GeneratedSourceFileReportSchema, { minItems: 1 }),
  diagnostics: Type.Array(DiagnosticSchema),
});

export const BlockedReactGenerationReportV2Schema = closedObject({
  ...ReportV2CommonProperties,
  status: Type.Literal("blocked"),
  componentName: Type.Optional(Type.String({ minLength: 1 })),
  validation: closedObject({
    inputContracts: InputValidationStatusSchema,
    pack: InputValidationStatusSchema,
    syntax: Type.Literal("not-run"),
    targetTypecheck: Type.Literal("not-run"),
  }),
  files: Type.Array(GeneratedSourceFileReportSchema, { maxItems: 0 }),
  diagnostics: Type.Array(DiagnosticSchema, { minItems: 1 }),
});

export const ReactGenerationReportV2Schema = Type.Union([
  GeneratedReactGenerationReportV2Schema,
  BlockedReactGenerationReportV2Schema,
]);

export const ReactGenerationReportSchema = Type.Union([
  ReactGenerationReportV1Schema,
  ReactGenerationReportV2Schema,
]);

export type GeneratedSourceFileKind = Static<
  typeof GeneratedSourceFileKindSchema
>;
export type GeneratedSourceFileReport = Static<
  typeof GeneratedSourceFileReportSchema
>;
export type RenderOnlyPropReport = Static<typeof RenderOnlyPropReportSchema>;
export type ReactGenerationReportV1 = Static<
  typeof ReactGenerationReportV1Schema
>;
export type ReactGenerationReportV2 = Static<
  typeof ReactGenerationReportV2Schema
>;
export type ReactGenerationReport = Static<typeof ReactGenerationReportSchema>;
export type ReactGenerationValidation = ReactGenerationReport["validation"];

export interface GeneratedSourceFile {
  path: string;
  kind: GeneratedSourceFileKind;
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
}

export interface ReactGenerationBundleV1 {
  schema: "react-generation-bundle/v1";
  status: "generated" | "blocked";
  sourceRunId: string;
  files: GeneratedSourceFile[];
  report: ReactGenerationReportV1;
}

export interface ReactGenerationBundleV2 {
  schema: "react-generation-bundle/v2";
  status: "generated" | "blocked";
  sourceRunId: string;
  files: GeneratedSourceFile[];
  report: ReactGenerationReportV2;
}

export type ReactGenerationBundle = ReactGenerationBundleV2;

export function assertReactGenerationReportIntegrity(
  report: ReactGenerationReport,
): void {
  const filesByKind = {
    tsx: 0,
    cssModule: 0,
    fallbackTsx: 0,
    fallbackCssModule: 0,
  };
  let sourceByteLength = 0;

  for (const file of report.files) {
    const statisticsKey = {
      tsx: "tsx",
      "css-module": "cssModule",
      "fallback-tsx": "fallbackTsx",
      "fallback-css-module": "fallbackCssModule",
    }[file.kind] as keyof typeof filesByKind;
    filesByKind[statisticsKey] += 1;
    sourceByteLength += file.byteLength;
  }

  for (const key of Object.keys(filesByKind) as Array<
    keyof typeof filesByKind
  >) {
    if (report.statistics.filesByKind[key] !== filesByKind[key]) {
      throw new Error(
        `REACT_GENERATION_REPORT_INTEGRITY: filesByKind.${key} is ${report.statistics.filesByKind[key]}, expected ${filesByKind[key]}`,
      );
    }
  }

  if (report.statistics.sourceByteLength !== sourceByteLength) {
    throw new Error(
      `REACT_GENERATION_REPORT_INTEGRITY: sourceByteLength is ${report.statistics.sourceByteLength}, expected ${sourceByteLength}`,
    );
  }

  if (
    report.status === "generated" &&
    (report.validation.syntax !== "passed" || report.files.length === 0)
  ) {
    throw new Error(
      "REACT_GENERATION_REPORT_INTEGRITY: generated output must have passed syntax and source files",
    );
  }

  if (
    report.status === "blocked" &&
    (report.validation.syntax !== "not-run" || report.files.length !== 0)
  ) {
    throw new Error(
      "REACT_GENERATION_REPORT_INTEGRITY: blocked output must have not-run syntax and zero source files",
    );
  }
}
