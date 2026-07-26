import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loadDesignSystemPack } from "../packages/component-catalog/src/index.ts";
import { resolveUiManifest } from "../packages/component-resolver/src/index.ts";
import { stableStringify } from "../packages/contracts/src/index.ts";
import { buildDesignSummary } from "../packages/design-context/src/index.ts";
import { normalizePixsoDesign } from "../packages/design-normalizer/src/index.ts";
import { buildUiManifest } from "../packages/semantic-planner/src/index.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const fixtureDir = join(repoRoot, "fixtures", "pixso", "modal-4-314");
const outputDir = await mkdtemp(join(tmpdir(), "uig-goldens-"));
const rawDsl = JSON.parse(
  await readFile(join(fixtureDir, "source.json"), "utf8"),
);
const [sber, mui] = await Promise.all([
  loadDesignSystemPack(join(repoRoot, "design-system-packs", "sber-space-ui")),
  loadDesignSystemPack(join(repoRoot, "design-system-packs", "material-ui")),
]);
const designIr = normalizePixsoDesign({
  artifactId: "pixso_WSLukjrKancvZG0zbaMnyA_4_314_0d6c50995105",
  rawDsl,
});
const designSummary = buildDesignSummary({ ir: designIr });
const uiManifest = buildUiManifest({
  ir: designIr,
  exactMappings: [...sber.exactPixsoMappings],
});
const sberPlan = resolveUiManifest({
  manifest: uiManifest,
  designIr,
  pack: sber,
});
const muiPlan = resolveUiManifest({
  manifest: uiManifest,
  designIr,
  pack: mui,
});

const candidates = {
  "expected.design-ir.json": designIr,
  "expected.design-summary.json": designSummary,
  "expected.ui-manifest.json": uiManifest,
  "expected.sber-space-ui.resolution-plan.json": sberPlan,
  "expected.material-ui.resolution-plan.json": muiPlan,
};
for (const [file, value] of Object.entries(candidates)) {
  await writeFile(join(outputDir, file), stableStringify(value), "utf8");
}

const semanticNodes = flatten(uiManifest.root);
console.log(
  JSON.stringify({
    outputDir,
    nodeCount: Object.keys(designIr.nodes).length,
    root: designIr.nodes[designIr.rootNodeId],
    texts: Object.values(designIr.nodes)
      .flatMap((node) => (node.text?.value ? [node.text.value] : []))
      .slice(0, 20),
    semanticRoles: semanticNodes.map((node) => ({
      id: node.id,
      role: node.role,
      confidence: node.confidence,
    })),
    sberSummary: sberPlan.summary,
    muiSummary: muiPlan.summary,
    sberImports: imports(sberPlan.nodes),
    muiImports: imports(muiPlan.nodes),
    diagnostics: {
      semantic: uiManifest.diagnostics.map((item) => item.code),
      sber: sberPlan.diagnostics.map((item) => item.code),
      mui: muiPlan.diagnostics.map((item) => item.code),
    },
    summaryBytes: Buffer.byteLength(stableStringify(designSummary)),
  }),
);

function flatten(root: typeof uiManifest.root): (typeof uiManifest.root)[] {
  return [root, ...root.children.flatMap(flatten)];
}

function imports(nodes: typeof sberPlan.nodes): string[] {
  return Array.from(
    new Set(
      nodes.flatMap((node) =>
        node.decision === "reuse"
          ? [node.binding.package]
          : node.decision === "compose"
            ? node.bindings.map((item) => item.package)
            : [],
      ),
    ),
  ).sort();
}
