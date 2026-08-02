import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { UiContextConfigV1 } from "@uig/contracts";

import { resolveConfiguredPublicRoots } from "./resolve-public-entry.js";
import { scanPublicProject } from "./scan-public-symbols.js";

const workspaceDir = resolve(
  fileURLToPath(new URL("./__fixtures__/react-public-api", import.meta.url)),
);

const config: UiContextConfigV1 = {
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
  iconRoots: [
    {
      path: "src/shared/icons",
      entry: "src/shared/icons/index.ts",
      importSource: "@/shared/icons",
    },
  ],
  workspacePackages: { discovery: "public-exports" },
  ignore: [],
};

describe("scanPublicProject", () => {
  it("emits only proven public React exports with facade identities", async () => {
    const resolvedRoots = await resolveConfiguredPublicRoots({
      workspaceDir,
      config,
    });
    const result = await scanPublicProject({
      workspaceDir,
      config,
      resolvedRoots,
    });
    expect(result.components.map(({ id }) => id)).toEqual([
      "project:@/shared/ui#ArrowButton",
      "project:@/shared/ui#ForwardedInput",
      "project:@/shared/ui#MemoButton",
      "project:@/shared/ui#default",
    ]);
    expect(
      result.components.some(({ id }) => id.includes("InternalOption")),
    ).toBe(false);
    expect(
      result.components.some(({ id }) => id.includes("CreatePayload")),
    ).toBe(false);
    expect(result.icons.map(({ id }) => id)).toEqual([
      "project:@/shared/icons#Cancel",
      "project:@/shared/icons#Upload",
    ]);
  });

  it("preserves normalized public props and import styles", async () => {
    const resolvedRoots = await resolveConfiguredPublicRoots({
      workspaceDir,
      config,
    });
    const result = await scanPublicProject({
      workspaceDir,
      config,
      resolvedRoots,
    });
    const arrow = result.components.find(({ id }) =>
      id.endsWith("#ArrowButton"),
    )!;
    expect(arrow.import).toEqual({
      source: "@/shared/ui",
      export: "ArrowButton",
      style: "named",
    });
    expect(arrow.contract.acceptsChildren).toBe(true);
    expect(arrow.contract.props).toEqual([
      {
        name: "children",
        required: false,
        type: { kind: "react-node" },
        deprecated: false,
      },
      {
        name: "disabled",
        required: false,
        type: { kind: "boolean" },
        deprecated: false,
      },
    ]);
    expect(
      result.components.find(({ id }) => id.endsWith("#default"))?.import.style,
    ).toBe("default");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "COMPONENT_PROP_TYPE_OPAQUE",
        severity: "warning",
        componentId: "project:@/shared/ui#default",
      }),
    );
  });
});
