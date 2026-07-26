import type { StyleRuleModel } from "./generation-model.js";
import { describe, expect, it } from "vitest";

import { emitCssModule } from "./emit-css-module.js";
import { ReactGenerationError } from "./errors.js";

describe("emitCssModule", () => {
  it("serializes typed declarations into safe CSS Module classes", () => {
    expect(emitCssModule(rules())).toBe(
      `.ui_dialog_4-314 {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n`,
    );
  });

  it("is byte-identical when input rules and declarations are reordered", () => {
    const reversed: StyleRuleModel[] = [
      {
        className: "z_dialog",
        declarations: [
          { property: "gap", value: "10px" },
          { property: "display", value: "flex" },
        ],
      },
      {
        className: "a_dialog",
        declarations: [
          { property: "fontSize", value: "14px" },
          { property: "color", value: "#112233" },
        ],
      },
    ];
    const ordered: StyleRuleModel[] = [
      {
        className: "a_dialog",
        declarations: [
          { property: "color", value: "#112233" },
          { property: "fontSize", value: "14px" },
        ],
      },
      {
        className: "z_dialog",
        declarations: [
          { property: "display", value: "flex" },
          { property: "gap", value: "10px" },
        ],
      },
    ];

    expect(emitCssModule(reversed)).toBe(emitCssModule(ordered));
  });

  it("rejects selectors, unknown properties, and priority escapes", () => {
    const unsafe = [
      [{ className: "body .dialog", declarations: [] }],
      [
        {
          className: "ui_dialog",
          declarations: [{ property: "--token", value: "red" }],
        },
      ],
      [
        {
          className: "ui_dialog",
          declarations: [{ property: "toString", value: "red" }],
        },
      ],
      [
        {
          className: "ui_dialog",
          declarations: [{ property: "color", value: "red !important" }],
        },
      ],
      [
        {
          className: "ui_dialog",
          declarations: [
            { property: "color", value: "red; body { color: red }" },
          ],
        },
      ],
    ] as unknown as StyleRuleModel[][];

    for (const rules of unsafe) {
      expect(() => emitCssModule(rules)).toThrowError(
        expect.objectContaining<Partial<ReactGenerationError>>({
          code: "GENERATION_SOURCE_INVALID",
        }),
      );
    }
  });
});

function rules(): StyleRuleModel[] {
  return [
    {
      className: "ui_dialog_4-314",
      declarations: [
        { property: "display", value: "flex" },
        { property: "flexDirection", value: "column" },
        { property: "gap", value: "10px" },
      ],
    },
  ];
}
