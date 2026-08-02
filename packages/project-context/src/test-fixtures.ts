import type { ContextFingerprintInputs } from "./fingerprint-context.js";

const hash = "a".repeat(64);

export function contextInputs(): ContextFingerprintInputs {
  return {
    config: {
      schema: "ui-context-config/v1",
      framework: "react",
      language: "typescript",
      designSystemPacks: ["sber-space-ui"],
      componentRoots: [
        {
          path: "src/shared/ui",
          entry: "src/shared/ui/index.ts",
          importSource: "@/shared/ui",
        },
      ],
      iconRoots: [],
      workspacePackages: { discovery: "public-exports" },
      ignore: [],
    },
    mappings: {
      schema: "project-component-mappings/v1",
      components: [
        {
          componentId: "project:@/shared/ui#AppRadioGroup",
          semanticRoles: ["choicePanel"],
          capabilities: ["single-selection", "value", "change"],
          formAdapters: ["controlled"],
          status: "mapped",
        },
      ],
      designComponents: [],
    },
    annotations: {
      schema: "project-component-annotations/v1",
      components: [
        {
          componentId: "project:@/shared/ui#AppRadioGroup",
          summary: "Single selection",
          usage: [],
          restrictions: [],
          examples: [],
        },
      ],
    },
    policies: {
      schema: "project-component-policies/v1",
      resolution: {
        allowSuggested: false,
        allowNativeFallback: false,
        preferProjectComponents: true,
      },
      components: { excluded: [], deprecatedAllowed: false },
      imports: { preferPublicFacades: true, allowDeepImports: false },
    },
    publicComponents: {
      schema: "public-components/v1",
      components: [
        {
          id: "project:@/shared/ui#AppRadioGroup",
          kind: "react-component",
          framework: "react",
          availability: "verified",
          import: {
            source: "@/shared/ui",
            export: "AppRadioGroup",
            style: "named",
          },
          contract: {
            propsType: "AppRadioGroupProps",
            acceptsChildren: false,
            props: [],
          },
          semantics: [
            {
              role: "choicePanel",
              status: "suggested",
              confidence: 0.86,
              evidence: [],
            },
          ],
          capabilities: [],
          formAdapters: [],
          evidence: [
            {
              kind: "public-export",
              path: "src/shared/ui/index.ts",
              export: "AppRadioGroup",
            },
          ],
        },
      ],
      icons: [],
      diagnostics: [],
    },
    installedPackages: {
      schema: "installed-packages/v1",
      lockfile: { path: "pnpm-lock.yaml", sha256: hash },
      packages: [
        {
          name: "@sber-space-ui/radio",
          version: "2.0.0",
          packageJsonPath: "node_modules/@sber-space-ui/radio/package.json",
          publicTypeEntries: [
            {
              subpath: ".",
              path: "node_modules/@sber-space-ui/radio/index.d.ts",
              sha256: hash,
              exports: ["RadioGroup", "Radio"],
            },
          ],
        },
      ],
      diagnostics: [],
    },
    designSystemPacks: [
      { id: "sber-space-ui", version: "2.0.0", sha256: hash },
    ],
  };
}
