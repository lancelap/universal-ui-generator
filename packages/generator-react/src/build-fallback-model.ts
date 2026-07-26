import type {
  DesignNodeV2,
  ReactStylePolicy,
  ResolutionNode,
  UiNodeV2,
} from "@uig/contracts";

import { cssIdentifier } from "./build-style-model.js";
import { ReactGenerationError } from "./errors.js";
import type { FallbackComponentModel } from "./generation-model.js";

export function buildFallbackModel(input: {
  node: UiNodeV2;
  designNode: DesignNodeV2;
  resolution: ResolutionNode;
  policy: ReactStylePolicy;
}): FallbackComponentModel {
  if (input.resolution.decision !== "fallback") {
    throw new ReactGenerationError(
      "GENERATION_FALLBACK_FORBIDDEN",
      `Node ${input.node.id} is not resolved as a fallback`,
    );
  }
  if (
    input.policy.fallback.layout !== "all-supported" ||
    input.policy.fallback.appearance !== "all-supported" ||
    input.resolution.styleStrategy !== "css-module"
  ) {
    throw new ReactGenerationError(
      "GENERATION_FALLBACK_FORBIDDEN",
      `Fallback styles are not approved for ${input.node.id}`,
    );
  }
  if (input.node.layoutSourceNodeId !== input.designNode.id) {
    throw new ReactGenerationError(
      "GENERATION_SOURCE_INVALID",
      `Fallback node ${input.node.id} does not match design node ${input.designNode.id}`,
    );
  }
  return {
    nodeId: input.node.id,
    localComponentName: pascalIdentifier(input.resolution.localComponentName),
    className: cssIdentifier(input.node.id),
  };
}

function pascalIdentifier(value: string): string {
  const normalized = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return normalized || "GeneratedFallback";
}
