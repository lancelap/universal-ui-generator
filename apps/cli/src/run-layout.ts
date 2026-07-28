import { join } from "node:path";

export interface RunLayout {
  uigDir: string;
  runDir: string;
  runId: string;
  files: {
    run: string;
    snapshot: string;
    designIr: string;
    normalizationProvenance: string;
    designSummary: string;
    uiManifest: string;
    resolutionPlan: string;
    diagnostics: string;
  };
}

export function createRunLayout(input: {
  workspaceDir: string;
  now: Date;
  nodeId: string;
  packId: string;
}): RunLayout {
  const timestamp = input.now
    .toISOString()
    .replace(/[-:.]/g, "")
    .replace("Z", "Z");
  const nodeId = input.nodeId
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const runId = `run_${timestamp}_${nodeId}`;
  return {
    uigDir: join(input.workspaceDir, ".uig"),
    runDir: join(input.workspaceDir, ".uig", "runs", runId),
    runId,
    files: {
      run: "run.json",
      snapshot: "snapshot.json",
      designIr: "design-ir.json",
      normalizationProvenance: "normalization-provenance.json",
      designSummary: "design-summary.json",
      uiManifest: "ui-manifest.json",
      resolutionPlan: `resolution-plan.${input.packId}.json`,
      diagnostics: "diagnostics.json",
    },
  };
}
