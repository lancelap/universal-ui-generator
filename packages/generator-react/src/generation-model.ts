import type { LoadedDesignSystemPackV2 } from "@uig/component-catalog";
import type {
  DesignIRV2,
  Diagnostic,
  ResolutionNode,
  ResolutionPlanV2,
  UiManifestV2,
  UiNodeV2,
} from "@uig/contracts";

export interface ReactGenerationInput {
  sourceRunId: string;
  designIr: DesignIRV2;
  uiManifest: UiManifestV2;
  resolutionPlan: ResolutionPlanV2;
  pack: LoadedDesignSystemPackV2;
}

interface ValidatedGenerationBase extends ReactGenerationInput {
  manifestNodes: UiNodeV2[];
  resolutionsByManifestNodeId: ReadonlyMap<string, ResolutionNode>;
}

export interface ReadyGenerationInput extends ValidatedGenerationBase {
  status: "ready";
}

export interface BlockedGenerationInput extends ValidatedGenerationBase {
  status: "blocked";
  diagnostics: Diagnostic[];
}

export type ValidatedGenerationInput =
  ReadyGenerationInput | BlockedGenerationInput;
