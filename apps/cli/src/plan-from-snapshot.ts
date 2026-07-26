import { join } from "node:path";

import { loadDesignSystemPack } from "@uig/component-catalog";
import { resolveUiManifest } from "@uig/component-resolver";
import {
  type DesignSnapshot,
  type GenerationRun,
  GenerationRunSchema,
  validateWithSchema,
} from "@uig/contracts";
import { buildDesignSummary, createArtifactStore } from "@uig/design-context";
import { normalizePixsoDesign } from "@uig/design-normalizer";
import { buildUiManifest } from "@uig/semantic-planner";

import { createRunLayout } from "./run-layout.js";
import { writeRunArtifacts } from "./write-run-artifacts.js";

interface InternalSnapshotInput {
  snapshot?: DesignSnapshot;
  fetchCompleted?: boolean;
}

export async function planFromSnapshot(
  input: {
    artifactId: string;
    designSystemPackPath: string;
    workspaceDir: string;
    now: () => Date;
  } & InternalSnapshotInput,
): Promise<GenerationRun> {
  const now = input.now();
  const store = createArtifactStore(join(input.workspaceDir, ".uig"));
  const [bytes, metadata, pack] = await Promise.all([
    store.read(input.artifactId),
    store.describe(input.artifactId),
    loadDesignSystemPack(input.designSystemPackPath),
  ]);
  const rawDsl = parseJson(bytes);
  const snapshot =
    input.snapshot ??
    createSnapshot({
      artifactId: input.artifactId,
      documentId: metadata.documentId,
      nodeId: metadata.nodeId,
      sha256: metadata.sha256,
      byteLength: metadata.byteLength,
      rawDsl,
      retrievedAt: now,
    });
  const designIr = normalizePixsoDesign({
    artifactId: input.artifactId,
    rawDsl,
  });
  const designSummary = buildDesignSummary({ ir: designIr });
  const uiManifest = buildUiManifest({
    ir: designIr,
    exactMappings: [...pack.exactPixsoMappings],
  });
  const resolutionPlan = resolveUiManifest({
    manifest: uiManifest,
    designIr,
    pack,
  });
  const diagnostics = resolutionPlan.diagnostics;
  const blocked = diagnostics.some((diagnostic) => diagnostic.blocking);
  const warning = diagnostics.some(
    (diagnostic) => diagnostic.severity === "warning",
  );
  const layout = createRunLayout({
    workspaceDir: input.workspaceDir,
    now,
    nodeId: metadata.nodeId,
    packId: pack.manifest.id,
  });
  const run = validateWithSchema(GenerationRunSchema, {
    schema: "generation-run/v1",
    runId: layout.runId,
    status: blocked
      ? "blocked"
      : warning
        ? "completed-with-warnings"
        : "completed",
    stages: {
      fetch: input.fetchCompleted ? "completed" : "skipped",
      normalize: "completed",
      summarize: "completed",
      plan: "completed",
      resolve: blocked ? "blocked" : "completed",
    },
    artifacts: {
      snapshot: layout.files.snapshot,
      designIr: layout.files.designIr,
      designSummary: layout.files.designSummary,
      uiManifest: layout.files.uiManifest,
      resolutionPlan: layout.files.resolutionPlan,
      diagnostics: layout.files.diagnostics,
    },
  });

  await writeRunArtifacts({
    layout,
    artifacts: {
      [layout.files.snapshot]: snapshot,
      [layout.files.designIr]: designIr,
      [layout.files.designSummary]: designSummary,
      [layout.files.uiManifest]: uiManifest,
      [layout.files.resolutionPlan]: resolutionPlan,
      [layout.files.diagnostics]: diagnostics,
      [layout.files.run]: run,
    },
  });
  return run;
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
}

function createSnapshot(input: {
  artifactId: string;
  documentId: string;
  nodeId: string;
  sha256: string;
  byteLength: number;
  rawDsl: unknown;
  retrievedAt: Date;
}): DesignSnapshot {
  const dsl = (input.rawDsl as { dsl?: { dslVersion?: unknown } }).dsl;
  if (typeof dsl?.dslVersion !== "string") {
    throw new Error("Stored Pixso DSL has no dslVersion");
  }
  const url = new URL(
    `https://pixso.net/app/design/${encodeURIComponent(input.documentId)}`,
  );
  url.searchParams.set("item-id", input.nodeId);
  return {
    schema: "design-snapshot/v1",
    artifactId: input.artifactId,
    provider: "pixso",
    source: {
      documentId: input.documentId,
      nodeId: input.nodeId,
      url: url.toString(),
    },
    retrievedAt: input.retrievedAt.toISOString(),
    content: {
      format: "pixso-node-dsl",
      version: dsl.dslVersion,
      sha256: input.sha256,
      byteLength: input.byteLength,
    },
  };
}
