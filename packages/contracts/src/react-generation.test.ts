import { describe, expect, it } from "vitest";

import {
  ContractValidationError,
  type ReactGenerationReport,
  ReactGenerationReportSchema,
  assertReactGenerationReportIntegrity,
  validateWithSchema,
} from "./index.js";

const diagnostic = {
  severity: "error",
  blocking: true,
  stage: "react-generation",
  code: "GENERATION_INPUT_BLOCKED",
  message: "Resolution contains a blocked node",
} as const;

function reportFixture(status: "generated" | "blocked"): ReactGenerationReport {
  const common = {
    schema: "react-generation-report/v1",
    sourceRunId: "run_20260726_4-314",
    designSystem: "sber-space-ui",
  } as const;

  if (status === "generated") {
    return {
      ...common,
      status,
      componentName: "PaymentDetailsModal",
      validation: {
        inputContracts: "passed",
        pack: "passed",
        syntax: "passed",
        targetTypecheck: "not-run",
      },
      statistics: {
        manifestNodes: 7,
        imports: 5,
        generatedProps: 2,
        cssRules: 6,
        fallbackComponents: 0,
        filesByKind: {
          tsx: 1,
          cssModule: 1,
          fallbackTsx: 0,
          fallbackCssModule: 0,
        },
        sourceByteLength: 1500,
      },
      files: [
        {
          path: "PaymentDetailsModal.tsx",
          kind: "tsx",
          sha256: "a".repeat(64),
          byteLength: 1240,
        },
        {
          path: "PaymentDetailsModal.module.css",
          kind: "css-module",
          sha256: "b".repeat(64),
          byteLength: 260,
        },
      ],
      diagnostics: [],
    };
  }

  return {
    ...common,
    status,
    validation: {
      inputContracts: "passed",
      pack: "passed",
      syntax: "not-run",
      targetTypecheck: "not-run",
    },
    statistics: {
      manifestNodes: 7,
      imports: 0,
      generatedProps: 0,
      cssRules: 0,
      fallbackComponents: 0,
      filesByKind: {
        tsx: 0,
        cssModule: 0,
        fallbackTsx: 0,
        fallbackCssModule: 0,
      },
      sourceByteLength: 0,
    },
    files: [],
    diagnostics: [diagnostic],
  };
}

describe("React generation report", () => {
  it.each(["generated", "blocked"] as const)(
    "validates a %s report",
    (status) => {
      const report = reportFixture(status);
      expect(validateWithSchema(ReactGenerationReportSchema, report)).toEqual(
        report,
      );
      expect(() => assertReactGenerationReportIntegrity(report)).not.toThrow();
    },
  );

  it("requires passed syntax for generated output", () => {
    expect(() =>
      validateWithSchema(ReactGenerationReportSchema, {
        ...reportFixture("generated"),
        validation: {
          ...reportFixture("generated").validation,
          syntax: "not-run",
        },
      }),
    ).toThrowError(ContractValidationError);
  });

  it("requires not-run syntax and zero files for blocked output", () => {
    const generatedFile = reportFixture("generated").files[0];

    expect(() =>
      validateWithSchema(ReactGenerationReportSchema, {
        ...reportFixture("blocked"),
        validation: {
          ...reportFixture("blocked").validation,
          syntax: "passed",
        },
      }),
    ).toThrowError(ContractValidationError);
    expect(() =>
      validateWithSchema(ReactGenerationReportSchema, {
        ...reportFixture("blocked"),
        files: [generatedFile],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("accepts only not-run target typecheck status", () => {
    expect(() =>
      validateWithSchema(ReactGenerationReportSchema, {
        ...reportFixture("generated"),
        validation: {
          ...reportFixture("generated").validation,
          targetTypecheck: "passed",
        },
      }),
    ).toThrowError(ContractValidationError);
  });

  it.each(["/private/component.tsx", "../component.tsx", "a/../b.tsx"])(
    "rejects unsafe file path %s",
    (path) => {
      const report = reportFixture("generated");
      expect(() =>
        validateWithSchema(ReactGenerationReportSchema, {
          ...report,
          files: [{ ...report.files[0], path }],
        }),
      ).toThrowError(ContractValidationError);
    },
  );

  it("excludes the report itself from generated file kinds", () => {
    const report = reportFixture("generated");
    expect(() =>
      validateWithSchema(ReactGenerationReportSchema, {
        ...report,
        files: [{ ...report.files[0], kind: "report" }],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("rejects mismatching file counts and byte length", () => {
    const report = reportFixture("generated");
    expect(() =>
      assertReactGenerationReportIntegrity({
        ...report,
        statistics: {
          ...report.statistics,
          filesByKind: {
            ...report.statistics.filesByKind,
            tsx: 2,
          },
        },
      }),
    ).toThrow(/^REACT_GENERATION_REPORT_INTEGRITY:/);
    expect(() =>
      assertReactGenerationReportIntegrity({
        ...report,
        statistics: {
          ...report.statistics,
          sourceByteLength: 1499,
        },
      }),
    ).toThrow(/^REACT_GENERATION_REPORT_INTEGRITY:/);
  });
});
