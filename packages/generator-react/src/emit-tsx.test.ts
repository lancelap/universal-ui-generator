import type { ReactGenerationModel } from "./generation-model.js";
import { describe, expect, it } from "vitest";

import { emitTsx } from "./emit-tsx.js";
import { ReactGenerationError } from "./errors.js";
import { validateGeneratedTsx } from "./validate-generated-source.js";

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
    expect(source).toContain('{"\\u041F\\u0440\\u0438\\u0432\\u0435\\u0442');
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
});

describe("validateGeneratedTsx", () => {
  const expectation = {
    componentName: "DialogPreview",
    packages: ["@ui/assets", "@ui/core"],
    importedLocalNames: ["Dialog", "DialogBody", "Logo"],
    jsxNames: ["Dialog", "DialogBody", "Logo"],
    localComponentNames: [],
  };

  it("accepts the AST-emitted source", () => {
    expect(() =>
      validateGeneratedTsx(emitTsx(model(), "DialogPreview"), expectation),
    ).not.toThrow();
  });

  it("accepts a locally declared fallback component without treating it as an import", () => {
    const source = [
      'import { Dialog } from "@ui/core";',
      "function GeneratedWarning() { return <div />; }",
      "export function DialogPreview() { return <Dialog><GeneratedWarning /></Dialog>; }",
      "",
    ].join("\n");

    expect(() =>
      validateGeneratedTsx(source, {
        componentName: "DialogPreview",
        packages: ["@ui/core"],
        importedLocalNames: ["Dialog"],
        jsxNames: ["Dialog", "GeneratedWarning"],
        localComponentNames: ["GeneratedWarning"],
      }),
    ).not.toThrow();
  });

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
