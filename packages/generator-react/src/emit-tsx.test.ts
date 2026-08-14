import type {
  FallbackComponentModel,
  ReactGenerationModel,
} from "./generation-model.js";
import { describe, expect, it } from "vitest";

import { emitFallbackTsx, emitTsx } from "./emit-tsx.js";
import { ReactGenerationError } from "./errors.js";
import {
  type GeneratedTsxExpectation,
  validateGeneratedTsx,
} from "./validate-generated-source.js";

describe("emitTsx", () => {
  it("emits a render-only component with escaped text, slots, and fixed opcodes", () => {
    const source = emitTsx(model(), "DialogPreview");

    expect(source).toContain('import Logo from "@ui/assets";');
    expect(source).toContain('import { Dialog, DialogBody } from "@ui/core";');
    expect(source).toContain("export interface DialogPreviewProps {");
    expect(source).toContain("onDismiss?: () => void;");
    expect(source).toContain("onValueChange?: (value: string) => void;");
    expect(source).toContain("export function DialogPreview(");
    expect(source).toContain("options={[]}");
    expect(source).toContain("onChange={() => undefined}");
    expect(source).toContain('className={styles["ui_dialog_4-314"]}');
    expect(source).toContain('title="Закрыть &quot;диалог&quot; <script>"');
    expect(source).toContain('{"Привет, <мир> & {не код}"}');
    expect(source).not.toMatch(/\\u04[0-9a-fA-F]{2}/);
    expect(source).toContain("<DialogBody>");
    expect(source).toContain("<Logo />");
    expect(source.endsWith("\n")).toBe(true);
    expect(source.endsWith("\n\n")).toBe(false);

    for (const forbidden of [
      "useState",
      "useEffect",
      "fetch(",
      "axios",
      "dangerouslySetInnerHTML",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("is byte-identical for the same typed model", () => {
    expect(emitTsx(model(), "DialogPreview")).toBe(
      emitTsx(model(), "DialogPreview"),
    );
  });

  it("emits one bounded selection group with two sections and five options", () => {
    const source = emitTsx(choicePanelModel(), "GeneratedChoicePanel");

    expect(source.match(/<SelectionGroup\b/g)).toHaveLength(1);
    expect(source.match(/<SelectionOption\b/g)).toHaveLength(5);
    expect(
      source.match(/className=\{styles\["choiceSection"\]\}/g),
    ).toHaveLength(2);
    expect(source).toContain('value=""');
    expect(source).toContain("onChange={() => { }}");
    expect(source).toContain('direction="column"');
    expect(source).toContain('groupName="Choose actions"');
    expect(source).toContain('value="option-5"');
    expect(source).toContain("Second section");
    expect(source).toContain("Description five");
    expect(source).toContain("<LeadingAsset");
    expect(source.match(/<TrailingAsset\b/g)).toHaveLength(5);
    expect(source.indexOf("choiceSection")).toBeGreaterThan(
      source.indexOf("<SelectionGroup"),
    );
    expect(source).not.toMatch(
      /<input\b|type="radio"|checkbox|useState|Tooltip/,
    );
  });

  it("AST-imports generated fallbacks from stable relative paths", () => {
    const source = emitTsx(modelWithFallback(), "DialogPreview", [
      {
        kind: "generated-relative",
        path: "./fallbacks/GeneratedWarning",
        specifiers: [
          {
            imported: "GeneratedWarning",
            local: "GeneratedWarning",
          },
        ],
      },
    ]);

    expect(source).toContain(
      'import { GeneratedWarning } from "./fallbacks/GeneratedWarning";',
    );
    expect(source).toContain("<GeneratedWarning>");
    expect(source).not.toContain("function GeneratedWarning");
  });
});

describe("emitFallbackTsx", () => {
  it("exports a children-preserving intrinsic fallback with its own CSS module", () => {
    const source = emitFallbackTsx(fallbackModel());

    expect(source).toContain('import type { ReactNode } from "react";');
    expect(source).toContain(
      'import styles from "./GeneratedWarning.module.css";',
    );
    expect(source).toContain("export interface GeneratedWarningProps {");
    expect(source).toContain("children?: ReactNode;");
    expect(source).toContain(
      "export function GeneratedWarning({ children }: GeneratedWarningProps)",
    );
    expect(source).toContain(
      '<div className={styles["ui_warning"]}>{children}</div>',
    );
  });
});

describe("validateGeneratedTsx", () => {
  const expectation: GeneratedTsxExpectation = {
    componentName: "DialogPreview",
    exportedDeclarations: [
      { kind: "interface", name: "DialogPreviewProps" },
      { kind: "function", name: "DialogPreview" },
    ],
    externalImports: [
      {
        source: "@ui/assets",
        specifiers: [{ kind: "default", imported: "default", local: "Logo" }],
        typeOnly: false,
      },
      {
        source: "@ui/core",
        specifiers: [
          { kind: "named", imported: "Dialog", local: "Dialog" },
          {
            kind: "named",
            imported: "DialogBody",
            local: "DialogBody",
          },
        ],
        typeOnly: false,
      },
    ],
    cssModuleImport: {
      source: "./DialogPreview.module.css",
      localName: "styles",
    },
    generatedRelativeImports: [],
    jsxNames: ["Dialog", "DialogBody", "Logo"],
    localComponentNames: [],
  };

  it("accepts the AST-emitted source", () => {
    expect(() =>
      validateGeneratedTsx(emitTsx(model(), "DialogPreview"), expectation),
    ).not.toThrow();
  });

  it("accepts an exact generated-relative fallback import", () => {
    const source = [
      'import { Dialog } from "@ui/core";',
      'import { GeneratedWarning } from "./fallbacks/GeneratedWarning";',
      "export function DialogPreview() { return <Dialog><GeneratedWarning /></Dialog>; }",
      "",
    ].join("\n");

    expect(() =>
      validateGeneratedTsx(source, {
        componentName: "DialogPreview",
        exportedDeclarations: [{ kind: "function", name: "DialogPreview" }],
        externalImports: [
          {
            source: "@ui/core",
            specifiers: [
              { kind: "named", imported: "Dialog", local: "Dialog" },
            ],
            typeOnly: false,
          },
        ],
        generatedRelativeImports: [
          {
            source: "./fallbacks/GeneratedWarning",
            specifiers: [
              {
                kind: "named",
                imported: "GeneratedWarning",
                local: "GeneratedWarning",
              },
            ],
          },
        ],
        jsxNames: ["Dialog", "GeneratedWarning"],
        localComponentNames: [],
      }),
    ).not.toThrow();
  });

  it("rejects generated-relative and external imports with wrong exported bindings", () => {
    const generatedAlias = [
      'import { Dialog } from "@ui/core";',
      'import { Wrong as GeneratedWarning } from "./fallbacks/GeneratedWarning";',
      "export function DialogPreview() { return <Dialog><GeneratedWarning /></Dialog>; }",
      "",
    ].join("\n");
    const externalAlias = [
      'import { Wrong as Dialog } from "@ui/core";',
      "export function DialogPreview() { return <Dialog />; }",
      "",
    ].join("\n");

    expect(() =>
      validateGeneratedTsx(generatedAlias, {
        componentName: "DialogPreview",
        exportedDeclarations: [{ kind: "function", name: "DialogPreview" }],
        externalImports: [
          {
            source: "@ui/core",
            specifiers: [
              { kind: "named", imported: "Dialog", local: "Dialog" },
            ],
            typeOnly: false,
          },
        ],
        generatedRelativeImports: [
          {
            source: "./fallbacks/GeneratedWarning",
            specifiers: [
              {
                kind: "named",
                imported: "GeneratedWarning",
                local: "GeneratedWarning",
              },
            ],
          },
        ],
        jsxNames: ["Dialog", "GeneratedWarning"],
        localComponentNames: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_SOURCE_INVALID",
      }),
    );
    expect(() =>
      validateGeneratedTsx(externalAlias, {
        componentName: "DialogPreview",
        exportedDeclarations: [{ kind: "function", name: "DialogPreview" }],
        externalImports: [
          {
            source: "@ui/core",
            specifiers: [
              { kind: "named", imported: "Dialog", local: "Dialog" },
            ],
            typeOnly: false,
          },
        ],
        generatedRelativeImports: [],
        jsxNames: ["Dialog"],
        localComponentNames: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_SOURCE_INVALID",
      }),
    );
  });

  it("accepts the exact type and CSS imports emitted for a fallback file", () => {
    expect(() =>
      validateGeneratedTsx(emitFallbackTsx(fallbackModel()), {
        componentName: "GeneratedWarning",
        exportedDeclarations: [
          { kind: "interface", name: "GeneratedWarningProps" },
          { kind: "function", name: "GeneratedWarning" },
        ],
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
          source: "./GeneratedWarning.module.css",
          localName: "styles",
        },
        generatedRelativeImports: [],
        jsxNames: [],
        localComponentNames: [],
      }),
    ).not.toThrow();
  });

  it("rejects missing exports and duplicate root declarations", () => {
    const valid = emitTsx(model(), "DialogPreview");
    const missingComponentExport = valid.replace(
      "export function DialogPreview",
      "function DialogPreview",
    );
    const missingPropsExport = valid.replace(
      "export interface DialogPreviewProps",
      "interface DialogPreviewProps",
    );
    const duplicateComponent = `${valid}\nexport function DialogPreview() { return <Dialog />; }\n`;
    const nestedDuplicateComponent = valid.replace(
      "    return (",
      "    function DialogPreview() { return <Dialog />; }\n    return (",
    );
    const unexpectedReexport = `${valid}\nexport { DialogPreview as Extra };\n`;
    for (const source of [
      missingComponentExport,
      missingPropsExport,
      duplicateComponent,
      nestedDuplicateComponent,
      unexpectedReexport,
    ]) {
      expect(() => validateGeneratedTsx(source, expectation)).toThrowError(
        expect.objectContaining<Partial<ReactGenerationError>>({
          code: "GENERATION_SOURCE_INVALID",
        }),
      );
    }
  });

  it.each([
    ["class", "class DialogPreview {}"],
    ["type alias", "type DialogPreviewProps = {};"],
    ["enum", "enum DialogPreview {}"],
    ["module", "namespace DialogPreviewProps {}"],
  ])(
    "rejects a non-exported %s declaration that collides with an expected binding",
    (_kind, declaration) => {
      const source = `${emitTsx(model(), "DialogPreview")}\n${declaration}\n`;

      expect(() => validateGeneratedTsx(source, expectation)).toThrowError(
        expect.objectContaining<Partial<ReactGenerationError>>({
          code: "GENERATION_SOURCE_INVALID",
        }),
      );
    },
  );

  it("rejects a source that omits an expected JSX component despite retaining its imports", () => {
    const source = [
      'import Logo from "@ui/assets";',
      'import { Dialog, DialogBody } from "@ui/core";',
      "export function DialogPreview() { return <Dialog><Logo /></Dialog>; }",
      "",
    ].join("\n");

    expect(() => validateGeneratedTsx(source, expectation)).toThrowError(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_SOURCE_INVALID",
      }),
    );
  });

  it("rejects sources with an unexpected package, JSX identifier, or syntax", () => {
    for (const source of [
      'import { Dialog } from "@unexpected/ui";\nexport function DialogPreview() { return <Dialog />; }\n',
      'import { Dialog, DialogBody } from "@ui/core";\nexport function DialogPreview() { return <Unknown />; }\n',
      "export function DialogPreview() { return <Dialog>; }\n",
    ]) {
      expect(() => validateGeneratedTsx(source, expectation)).toThrowError(
        expect.objectContaining<Partial<ReactGenerationError>>({
          code: "GENERATION_SOURCE_INVALID",
        }),
      );
    }
  });
});

function model(): ReactGenerationModel {
  return {
    imports: [
      {
        kind: "default",
        package: "@ui/assets",
        componentId: "assets.Logo",
        imported: "Logo",
        local: "Logo",
      },
      {
        kind: "named",
        package: "@ui/core",
        specifiers: [
          {
            componentId: "ui.Dialog",
            imported: "Dialog",
            local: "Dialog",
          },
          {
            componentId: "ui.DialogBody",
            imported: "DialogBody",
            local: "DialogBody",
          },
        ],
      },
    ],
    externalProps: [
      {
        name: "onDismiss",
        optional: true,
        type: "() => void",
        interactionKey: "dismiss",
      },
      {
        name: "onValueChange",
        optional: true,
        type: "(value: string) => void",
        interactionKey: "value-change",
      },
    ],
    renderOnlyProps: [],
    styles: [],
    fallbacks: [],
    diagnostics: [],
    root: {
      kind: "compose",
      nodeId: "ui_dialog_4-314",
      sourceNodeIds: ["4:314"],
      componentId: "ui.Dialog",
      localName: "Dialog",
      props: [
        {
          name: "className",
          value: { kind: "class-name", className: "ui_dialog_4-314" },
        },
        {
          name: "onDismiss",
          value: { kind: "external-prop", propName: "onDismiss" },
        },
        { name: "options", value: { kind: "empty-array" } },
        { name: "onChange", value: { kind: "noop" } },
        {
          name: "title",
          value: { kind: "literal", value: 'Закрыть "диалог" <script>' },
        },
      ],
      textChild: { kind: "text", value: "Привет, <мир> & {не код}" },
      slots: [
        {
          name: "body",
          componentId: "ui.DialogBody",
          localName: "DialogBody",
          children: [
            {
              kind: "reuse",
              nodeId: "ui_logo",
              sourceNodeIds: ["4:315"],
              componentId: "assets.Logo",
              localName: "Logo",
              props: [],
              children: [],
            },
          ],
        },
      ],
      children: [],
    },
  };
}

function choicePanelModel(): ReactGenerationModel {
  const options = Array.from({ length: 5 }, (_, index) => ({
    id: `option-${index + 1}`,
    sourceNodeIds: [`source-${index + 1}`],
    label: `Option ${index + 1}`,
    description: index === 4 ? "Description five" : `Description ${index + 1}`,
    hasTrailingAsset: true,
    props: [
      {
        name: "value",
        value: { kind: "literal" as const, value: `option-${index + 1}` },
      },
    ],
  }));
  return {
    imports: [
      {
        kind: "named",
        package: "@test/ui",
        specifiers: [
          ["group", "SelectionGroup"],
          ["option", "SelectionOption"],
          ["layout", "Layout"],
          ["title", "Text"],
          ["description", "Description"],
          ["leading", "LeadingAsset"],
          ["trailing", "TrailingAsset"],
        ].map(([componentId, local]) => ({
          componentId: componentId!,
          imported: local!,
          local: local!,
        })),
      },
    ],
    externalProps: [],
    renderOnlyProps: [],
    styles: [],
    fallbacks: [],
    diagnostics: [],
    root: {
      kind: "single-selection-collection",
      nodeId: "choice-panel",
      sourceNodeIds: ["source-root"],
      rootComponentId: "group",
      rootLocalName: "SelectionGroup",
      localName: "SelectionGroup",
      optionComponentId: "option",
      optionLocalName: "SelectionOption",
      layoutComponentId: "layout",
      layoutLocalName: "Layout",
      titleComponentId: "title",
      titleLocalName: "Text",
      descriptionComponentId: "description",
      descriptionLocalName: "Description",
      leadingAssetLocalName: "LeadingAsset",
      trailingAssetLocalName: "TrailingAsset",
      title: "Choose actions",
      rootProps: [
        { name: "value", value: { kind: "literal", value: "" } },
        { name: "onChange", value: { kind: "noop" } },
        { name: "direction", value: { kind: "literal", value: "column" } },
        {
          name: "groupName",
          value: { kind: "literal", value: "Choose actions" },
        },
      ],
      props: [
        { name: "value", value: { kind: "literal", value: "" } },
        { name: "onChange", value: { kind: "noop" } },
        { name: "direction", value: { kind: "literal", value: "column" } },
        {
          name: "groupName",
          value: { kind: "literal", value: "Choose actions" },
        },
      ],
      sections: [
        { id: "first", options: options.slice(0, 2) },
        { id: "second", label: "Second section", options: options.slice(2) },
      ],
      classNames: {
        root: "choicePanel",
        header: "choicePanelHeader",
        section: "choiceSection",
        sectionLabel: "choiceSectionLabel",
        optionRow: "choiceOptionRow",
        optionContent: "choiceOptionContent",
        description: "choiceDescription",
        trailingAsset: "choiceTrailingAsset",
      },
      children: [],
    },
  };
}

function modelWithFallback(): ReactGenerationModel {
  return {
    ...model(),
    imports: [],
    externalProps: [],
    styles: [],
    fallbacks: [fallbackModel()],
    root: {
      kind: "fallback",
      nodeId: "ui_warning",
      sourceNodeIds: ["4:314"],
      localComponentName: "GeneratedWarning",
      children: [
        {
          kind: "intrinsic-wrapper",
          nodeId: "ui_child",
          sourceNodeIds: ["4:315"],
          tag: "div",
          className: "ui_child",
          children: [],
        },
      ],
    },
  };
}

function fallbackModel(): FallbackComponentModel {
  return {
    nodeId: "ui_warning",
    localComponentName: "GeneratedWarning",
    className: "ui_warning",
  };
}
