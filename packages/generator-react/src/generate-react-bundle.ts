import { TextEncoder } from "node:util";

import {
  type Diagnostic,
  type GeneratedSourceFile,
  type ReactGenerationBundleV2,
  type ReactGenerationReportV2,
  ReactGenerationReportV2Schema,
  assertReactGenerationReportIntegrity,
  stableStringify,
  validateWithSchema,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";

import { buildReactGenerationModel } from "./build-react-generation-model.js";
import { emitCssModule } from "./emit-css-module.js";
import { emitFallbackTsx, emitTsx } from "./emit-tsx.js";
import type {
  ReactElementModel,
  ReactGeneratedRelativeImportModel,
  ReactGenerationInput,
  ReactGenerationModel,
} from "./generation-model.js";
import { validateGenerationInput } from "./validate-generation-input.js";
import { validateGeneratedTsx } from "./validate-generated-source.js";

const componentName = "GeneratedModal";
const encoder = new TextEncoder();

/** Compiles validated v2 planning artifacts into a deterministic React bundle. */
export function generateReactBundle(
  input: ReactGenerationInput,
): ReactGenerationBundleV2 {
  const validated = validateGenerationInput(input);
  if (validated.status === "blocked") {
    const report = reportForBlocked(input, validated.diagnostics);
    return {
      schema: "react-generation-bundle/v2",
      status: "blocked",
      sourceRunId: input.sourceRunId,
      files: [],
      report,
    };
  }

  const model = buildReactGenerationModel(validated);
  const generatedRelativeImports = model.fallbacks.map(
    (fallback): ReactGeneratedRelativeImportModel => ({
      kind: "generated-relative",
      path: `./fallbacks/${fallback.localComponentName}`,
      specifiers: [
        {
          imported: fallback.localComponentName,
          local: fallback.localComponentName,
        },
      ],
    }),
  );
  const tsx = emitTsx(model, componentName, generatedRelativeImports);
  validateGeneratedTsx(tsx, {
    componentName,
    externalImports: externalImportExpectations(model),
    ...(rootUsesStyles(model.root)
      ? {
          cssModuleImport: {
            source: `./${componentName}.module.css`,
            localName: "styles",
          },
        }
      : {}),
    generatedRelativeImports: generatedRelativeImports.map((item) => ({
      source: item.path,
      specifiers: item.specifiers.map((specifier) => ({
        kind: "named",
        imported: specifier.imported,
        local: specifier.local,
      })),
    })),
    jsxNames: jsxNames(model.root),
    localComponentNames: [],
  });

  const fallbackClassNames = new Set(
    model.fallbacks.map((fallback) => fallback.className),
  );
  const files: GeneratedSourceFile[] = [
    sourceFile(
      `${componentName}.module.css`,
      "css-module",
      emitCssModule(
        model.styles.filter(
          (style) => !fallbackClassNames.has(style.className),
        ),
      ),
    ),
    sourceFile(`${componentName}.tsx`, "tsx", tsx),
  ];
  for (const fallback of model.fallbacks) {
    const fallbackTsx = emitFallbackTsx(fallback);
    validateGeneratedTsx(fallbackTsx, {
      componentName: fallback.localComponentName,
      externalImports: [
        {
          source: "react",
          specifiers: [
            {
              kind: "named",
              imported: "ReactNode",
              local: "ReactNode",
            },
          ],
          typeOnly: true,
        },
      ],
      cssModuleImport: {
        source: `./${fallback.localComponentName}.module.css`,
        localName: "styles",
      },
      generatedRelativeImports: [],
      jsxNames: [],
      localComponentNames: [],
    });
    const fallbackStyles = model.styles.filter(
      (style) => style.className === fallback.className,
    );
    files.push(
      sourceFile(
        `fallbacks/${fallback.localComponentName}.module.css`,
        "fallback-css-module",
        emitCssModule(fallbackStyles),
      ),
      sourceFile(
        `fallbacks/${fallback.localComponentName}.tsx`,
        "fallback-tsx",
        fallbackTsx,
      ),
    );
  }
  const report = reportForGenerated(input, model, files);
  return {
    schema: "react-generation-bundle/v2",
    status: "generated",
    sourceRunId: input.sourceRunId,
    files,
    report,
  };
}

function reportForBlocked(
  input: ReactGenerationInput,
  diagnostics: Diagnostic[],
): ReactGenerationReportV2 {
  return validateReport({
    schema: "react-generation-report/v2",
    status: "blocked",
    sourceRunId: input.sourceRunId,
    designSystem: input.pack.manifest.id,
    statistics: emptyStatistics(0),
    renderOnlyProps: [],
    validation: {
      inputContracts: "passed",
      pack: "passed",
      syntax: "not-run",
      targetTypecheck: "not-run",
    },
    files: [],
    diagnostics: sortDiagnostics(diagnostics),
  });
}

function reportForGenerated(
  input: ReactGenerationInput,
  model: ReactGenerationModel,
  files: GeneratedSourceFile[],
): ReactGenerationReportV2 {
  const fileReports = files.map((file) => ({
    path: file.path,
    kind: file.kind,
    sha256: file.sha256,
    byteLength: file.byteLength,
  }));
  return validateReport({
    schema: "react-generation-report/v2",
    status: "generated",
    componentName,
    sourceRunId: input.sourceRunId,
    designSystem: input.pack.manifest.id,
    statistics: {
      manifestNodes: validatedManifestNodeCount(input.uiManifest.root),
      imports: model.imports.length,
      generatedProps: model.externalProps.length,
      cssRules: model.styles.length,
      fallbackComponents: model.fallbacks.length,
      filesByKind: {
        tsx: files.filter((file) => file.kind === "tsx").length,
        cssModule: files.filter((file) => file.kind === "css-module").length,
        fallbackTsx: files.filter((file) => file.kind === "fallback-tsx")
          .length,
        fallbackCssModule: files.filter(
          (file) => file.kind === "fallback-css-module",
        ).length,
      },
      sourceByteLength: files.reduce(
        (total, file) => total + file.byteLength,
        0,
      ),
    },
    renderOnlyProps: [...model.renderOnlyProps].sort(
      (left, right) =>
        left.manifestNodeId.localeCompare(right.manifestNodeId) ||
        left.componentId.localeCompare(right.componentId) ||
        stableStringify(left.propNames).localeCompare(
          stableStringify(right.propNames),
        ),
    ),
    validation: {
      inputContracts: "passed",
      pack: "passed",
      syntax: "passed",
      targetTypecheck: "not-run",
    },
    files: fileReports,
    diagnostics: sortDiagnostics([
      ...input.resolutionPlan.diagnostics.filter(
        (diagnostic) => !diagnostic.blocking,
      ),
      ...model.diagnostics,
    ]),
  });
}

function sourceFile(
  path: string,
  kind: GeneratedSourceFile["kind"],
  source: string,
): GeneratedSourceFile {
  const bytes = encoder.encode(source);
  return {
    path,
    kind,
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
  };
}

function jsxNames(root: ReactElementModel): string[] {
  const names = new Set<string>();
  const visit = (element: ReactElementModel): void => {
    if (element.kind !== "intrinsic-wrapper") {
      names.add(
        element.kind === "fallback"
          ? element.localComponentName
          : element.localName,
      );
    }
    if (element.kind === "compose") {
      for (const slot of element.slots) {
        names.add(slot.localName);
        slot.children.forEach(visit);
      }
    }
    element.children.forEach(visit);
  };
  visit(root);
  return [...names].sort();
}

function rootUsesStyles(root: ReactElementModel): boolean {
  const props =
    root.kind === "reuse" || root.kind === "compose" ? root.props : [];
  return (
    root.kind === "intrinsic-wrapper" ||
    props.some((prop) => prop.value.kind === "class-name") ||
    (root.kind === "compose" &&
      root.slots.some((slot) => slot.children.some(rootUsesStyles))) ||
    root.children.some(rootUsesStyles)
  );
}

function externalImportExpectations(model: ReactGenerationModel) {
  return model.imports.map((item) => ({
    source: item.package,
    specifiers:
      item.kind === "default"
        ? [
            {
              kind: "default" as const,
              imported: "default",
              local: item.local,
            },
          ]
        : item.specifiers.map((specifier) => ({
            kind: "named" as const,
            imported: specifier.imported,
            local: specifier.local,
          })),
    typeOnly: false,
  }));
}

function validatedManifestNodeCount(
  root: ReactGenerationInput["uiManifest"]["root"],
): number {
  return (
    1 +
    root.children.reduce(
      (count, child) => count + validatedManifestNodeCount(child),
      0,
    )
  );
}

function emptyStatistics(manifestNodes: number) {
  return {
    manifestNodes,
    imports: 0,
    generatedProps: 0,
    cssRules: 0,
    fallbackComponents: 0,
    filesByKind: { tsx: 0, cssModule: 0, fallbackTsx: 0, fallbackCssModule: 0 },
    sourceByteLength: 0,
  };
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      left.stage.localeCompare(right.stage) ||
      left.code.localeCompare(right.code) ||
      stableStringify(left.evidence ?? {}).localeCompare(
        stableStringify(right.evidence ?? {}),
      ),
  );
}

function validateReport(
  report: ReactGenerationReportV2,
): ReactGenerationReportV2 {
  const validated = validateWithSchema(ReactGenerationReportV2Schema, report);
  assertReactGenerationReportIntegrity(validated);
  return validated;
}
