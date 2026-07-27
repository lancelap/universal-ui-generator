import {
  DesignIRV2Schema,
  type Diagnostic,
  ResolutionPlanV2Schema,
  UiManifestV2Schema,
  assertDesignIRV2Integrity,
  assertResolutionPlanV2Integrity,
  assertUiManifestV2Integrity,
  stableStringify,
  validateWithSchema,
} from "@uig/contracts";
import { resolveUiManifestV2 } from "@uig/component-resolver";
import { sha256 } from "@uig/design-context";

import { ReactGenerationError } from "./errors.js";
import type {
  ReactGenerationInput,
  ValidatedGenerationInput,
} from "./generation-model.js";

export function validateGenerationInput(
  input: ReactGenerationInput,
): ValidatedGenerationInput {
  try {
    validateWithSchema(DesignIRV2Schema, input.designIr);
    validateWithSchema(UiManifestV2Schema, input.uiManifest);
    validateWithSchema(ResolutionPlanV2Schema, input.resolutionPlan);
    assertDesignIRV2Integrity(input.designIr);
    assertUiManifestV2Integrity(input.uiManifest, input.designIr);
    assertResolutionPlanV2Integrity(input.resolutionPlan);
  } catch (error) {
    invalid("Generation artifacts do not satisfy the v2 contracts", error);
  }

  assertSourceProofs(input);
  assertPackProof(input);
  assertResolutionAuthorization(input);

  const manifestNodes = flatten(input.uiManifest.root);
  const resolutionsByManifestNodeId = indexResolutions(input);
  assertExactResolutionJoin(manifestNodes, resolutionsByManifestNodeId);

  for (const node of manifestNodes) {
    const resolution = resolutionsByManifestNodeId.get(node.id)!;
    if (node.role === "unresolved" || resolution.semanticRole !== node.role) {
      invalid(`Resolution does not match semantic node ${node.id}`);
    }
  }

  const common = {
    ...input,
    manifestNodes,
    resolutionsByManifestNodeId,
  };
  if (
    input.resolutionPlan.summary.blocked > 0 ||
    input.resolutionPlan.nodes.some((node) => node.decision === "blocked") ||
    input.resolutionPlan.diagnostics.some((diagnostic) => diagnostic.blocking)
  ) {
    return {
      ...common,
      status: "blocked",
      diagnostics: blockedDiagnostics(input),
    };
  }

  return { ...common, status: "ready" };
}

function assertResolutionAuthorization(input: ReactGenerationInput): void {
  let canonical: ReturnType<typeof resolveUiManifestV2>;
  try {
    canonical = resolveUiManifestV2({
      manifest: input.uiManifest,
      designIr: input.designIr,
      pack: input.pack,
    });
  } catch (error) {
    invalid("Canonical component resolution failed", error);
  }

  const storedAuthorization = {
    nodes: input.resolutionPlan.nodes,
    summary: input.resolutionPlan.summary,
  };
  const canonicalAuthorization = {
    nodes: canonical.nodes,
    summary: canonical.summary,
  };
  if (
    stableStringify(storedAuthorization) !==
    stableStringify(canonicalAuthorization)
  ) {
    invalid(
      "Resolution decisions are not authorized by the loaded design-system pack",
    );
  }
}

function assertSourceProofs(input: ReactGenerationInput): void {
  const { source } = input.resolutionPlan;
  if (
    source.designIr.artifactId !== input.designIr.sourceArtifactId ||
    source.designIr.sha256 !== sha256(stableStringify(input.designIr)) ||
    source.uiManifest.artifactId !== input.uiManifest.sourceArtifactId ||
    source.uiManifest.sha256 !== sha256(stableStringify(input.uiManifest)) ||
    input.designIr.sourceArtifactId !== input.uiManifest.sourceArtifactId
  ) {
    invalid("Generation source hashes or artifact IDs do not match");
  }
}

function assertPackProof(input: ReactGenerationInput): void {
  const target = input.resolutionPlan.target;
  if (
    target.designSystem !== input.pack.manifest.id ||
    target.designSystemVersion !== input.pack.manifest.version ||
    target.packSha256 !== input.pack.sha256
  ) {
    invalid("Resolution target does not match the loaded design-system pack");
  }
}

function indexResolutions(
  input: ReactGenerationInput,
): ReadonlyMap<
  string,
  ReactGenerationInput["resolutionPlan"]["nodes"][number]
> {
  const indexed = new Map<
    string,
    ReactGenerationInput["resolutionPlan"]["nodes"][number]
  >();
  for (const resolution of input.resolutionPlan.nodes) {
    if (indexed.has(resolution.manifestNodeId)) {
      invalid(`Duplicate resolution for ${resolution.manifestNodeId}`);
    }
    indexed.set(resolution.manifestNodeId, resolution);
  }
  return indexed;
}

function assertExactResolutionJoin(
  manifestNodes: ReactGenerationInput["uiManifest"]["root"][],
  resolutions: ReadonlyMap<
    string,
    ReactGenerationInput["resolutionPlan"]["nodes"][number]
  >,
): void {
  const manifestIds = new Set(manifestNodes.map((node) => node.id));
  for (const node of manifestNodes) {
    if (!resolutions.has(node.id)) {
      invalid(`Missing resolution for ${node.id}`);
    }
  }
  for (const resolutionId of resolutions.keys()) {
    if (!manifestIds.has(resolutionId)) {
      invalid(`Resolution references unknown node ${resolutionId}`);
    }
  }
}

function blockedDiagnostics(input: ReactGenerationInput): Diagnostic[] {
  return [
    ...input.resolutionPlan.diagnostics,
    {
      severity: "error",
      blocking: true,
      stage: "react-generation",
      code: "GENERATION_INPUT_BLOCKED",
      message: "React generation is blocked by the resolution plan",
      evidence: {
        blockedResolutionCount: input.resolutionPlan.summary.blocked,
      },
    },
  ];
}

function flatten(
  root: ReactGenerationInput["uiManifest"]["root"],
): ReactGenerationInput["uiManifest"]["root"][] {
  return [root, ...root.children.flatMap(flatten)];
}

function invalid(message: string, cause?: unknown): never {
  throw new ReactGenerationError("GENERATION_INPUT_INVALID", message, {
    cause,
  });
}
