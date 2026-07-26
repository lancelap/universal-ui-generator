import dialogManifest from "./__fixtures__/dialog.ui-manifest.json";

import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesignSystemPack } from "@uig/component-catalog";
import type {
  Appearance,
  DesignIR,
  DesignNode,
  UiManifest,
} from "@uig/contracts";
import { stableStringify } from "@uig/contracts";
import { describe, expect, it } from "vitest";

import { resolveUiManifest } from "./resolve-ui-manifest.js";

const packsRoot = fileURLToPath(
  new URL("../../../design-system-packs", import.meta.url),
);

describe("resolveUiManifest", () => {
  it("resolves one immutable semantic manifest through both packs", async () => {
    const [sber, mui] = await Promise.all([
      loadDesignSystemPack(join(packsRoot, "sber-space-ui")),
      loadDesignSystemPack(join(packsRoot, "material-ui")),
    ]);
    const manifest = dialogManifest as UiManifest;
    const before = stableStringify(manifest);
    const designIr = designForManifest(manifest);

    const sberPlan = resolveUiManifest({ manifest, designIr, pack: sber });
    const muiPlan = resolveUiManifest({ manifest, designIr, pack: mui });

    expect(stableStringify(manifest)).toBe(before);
    expect(packages(sberPlan)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^@sber-space-ui\//)]),
    );
    expect(packages(muiPlan)).toEqual(["@mui/material"]);
    expect(
      sberPlan.nodes.find((node) => node.semanticRole === "dialog"),
    ).not.toEqual(muiPlan.nodes.find((node) => node.semanticRole === "dialog"));
    expect(sberPlan.nodes.map((node) => node.manifestNodeId)).toEqual(
      muiPlan.nodes.map((node) => node.manifestNodeId),
    );
    expect(sberPlan.summary).toEqual(counts(sberPlan.nodes));
    expect(muiPlan.summary).toEqual(counts(muiPlan.nodes));
  });
});

const appearance: Appearance = {
  fills: [],
  borders: [],
  radii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  shadows: [],
  opacity: 1,
};

function designForManifest(manifest: UiManifest): DesignIR {
  const ids = flatten(manifest.root).flatMap((node) => node.sourceNodeIds);
  const nodes: Record<string, DesignNode> = {};
  ids.forEach((id) => {
    nodes[id] = {
      id,
      type: "frame",
      name: id,
      visible: true,
      children: [],
      geometry: { x: 0, y: 0, width: 100, height: 40 },
      appearance,
      source: { provider: "pixso", nodeId: id },
    };
  });
  return {
    schema: "design-ir/v1",
    sourceArtifactId: manifest.sourceArtifactId,
    dslVersion: "2.1.15",
    rootNodeId: "root",
    nodes,
    diagnostics: [],
  };
}

function flatten(root: UiManifest["root"]): UiManifest["root"][] {
  return [root, ...root.children.flatMap(flatten)];
}

function packages(plan: ReturnType<typeof resolveUiManifest>): string[] {
  return Array.from(
    new Set(
      plan.nodes.flatMap((node) =>
        node.decision === "reuse"
          ? [node.binding.package]
          : node.decision === "compose"
            ? node.bindings.map((binding) => binding.package)
            : [],
      ),
    ),
  ).sort();
}

function counts(nodes: ReturnType<typeof resolveUiManifest>["nodes"]) {
  return {
    reuse: nodes.filter((node) => node.decision === "reuse").length,
    compose: nodes.filter((node) => node.decision === "compose").length,
    fallback: nodes.filter((node) => node.decision === "fallback").length,
    blocked: nodes.filter((node) => node.decision === "blocked").length,
  };
}
