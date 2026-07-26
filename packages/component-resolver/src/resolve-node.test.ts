import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadDesignSystemPack,
  type LoadedDesignSystemPack,
} from "@uig/component-catalog";
import type { ComponentCatalogEntry, UiNode } from "@uig/contracts";
import { beforeAll, describe, expect, it } from "vitest";

import { resolveNode } from "./resolve-node.js";

const sberPath = fileURLToPath(
  new URL("../../../design-system-packs/sber-space-ui", import.meta.url),
);
let pack: LoadedDesignSystemPack;

beforeAll(async () => {
  pack = await loadDesignSystemPack(sberPath);
});

describe("resolveNode decision table", () => {
  it.each([
    ["heading", "reuse"],
    ["dialog", "compose"],
    ["warning", "fallback"],
    ["combobox", "blocked"],
  ] as const)("resolves %s as %s", (role, decision) => {
    const result = resolveNode({ node: uiNode(role), pack });

    expect(result.resolution.decision).toBe(decision);
    if (decision === "blocked") {
      expect(result.resolution).not.toHaveProperty("binding");
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ blocking: true }),
      );
    }
  });

  it("never reuses an unverified catalog entry", () => {
    const typography = pack.componentsById.get("base.Typography")!;
    const unverified: ComponentCatalogEntry = {
      ...typography,
      verified: false,
    };
    const unsafePack: LoadedDesignSystemPack = {
      ...pack,
      componentsById: new Map(pack.componentsById).set(
        unverified.id,
        unverified,
      ),
      candidatesByRole: new Map(pack.candidatesByRole).set("heading", [
        unverified,
      ]),
    };

    const result = resolveNode({ node: uiNode("heading"), pack: unsafePack });
    expect(result.resolution.decision).toBe("blocked");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "COMPONENT_EXPORT_UNVERIFIED" }),
    );
  });

  it("filters candidates by capabilities and form adapter", () => {
    const node = uiNode("textInput");
    node.requiredCapabilities = ["label", "missing-capability"];
    node.formAdapter = "unsupported";

    const result = resolveNode({ node, pack });
    expect(result.resolution.decision).toBe("blocked");
    expect(result.diagnostics[0]?.code).toBe("COMPONENT_CAPABILITY_MISSING");
  });
});

function uiNode(role: string): UiNode {
  return {
    id: `ui_${role}_node`,
    kind: role.includes("Action") ? "action" : "control",
    role,
    sourceNodeIds: ["node"],
    confidence: 1,
    evidence: [{ kind: "test", value: role }],
    children: [],
  };
}
