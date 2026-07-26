import type { LoadedDesignSystemPackV2 } from "@uig/component-catalog";
import type {
  AppearanceStyleProperty,
  DesignIRV2,
  Diagnostic,
  LayoutStyleProperty,
  RenderOnlyPropReport,
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

export interface ReactNamedImportSpecifierModel {
  componentId: string;
  imported: string;
  local: string;
}

export interface ReactNamedImportModel {
  kind: "named";
  package: string;
  specifiers: ReactNamedImportSpecifierModel[];
}

export interface ReactDefaultImportModel {
  kind: "default";
  package: string;
  componentId: string;
  imported: string;
  local: string;
}

export type ReactImportModel = ReactNamedImportModel | ReactDefaultImportModel;

export type ReactPropValueModel =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "empty-array" }
  | { kind: "noop" }
  | { kind: "external-prop"; propName: string }
  | { kind: "class-name"; className: string };

export interface ReactPropModel {
  name: string;
  value: ReactPropValueModel;
}

export interface GeneratedPropModel {
  name: string;
  optional: true;
  type:
    | "() => void"
    | "(value: string) => void"
    | "(value: boolean) => void"
    | "(value: number) => void";
  interactionKey: string;
}

export interface ReactTextChildModel {
  kind: "text";
  value: string;
}

export interface ReactPropsBuildResult {
  elementProps: ReactPropModel[];
  externalProps: GeneratedPropModel[];
  renderOnlyPropNames: string[];
  textChild?: ReactTextChildModel;
}

interface ReactElementBaseModel {
  nodeId: string;
  sourceNodeIds: string[];
  children: ReactElementModel[];
}

export interface ReactReuseElementModel extends ReactElementBaseModel {
  kind: "reuse";
  componentId: string;
  localName: string;
  props: ReactPropModel[];
  textChild?: ReactTextChildModel;
}

export interface ReactCompositionSlotModel {
  name: string;
  componentId: string;
  localName: string;
  children: ReactElementModel[];
}

export interface ReactComposeElementModel extends ReactElementBaseModel {
  kind: "compose";
  componentId: string;
  localName: string;
  props: ReactPropModel[];
  textChild?: ReactTextChildModel;
  slots: ReactCompositionSlotModel[];
}

export interface ReactFallbackElementModel extends ReactElementBaseModel {
  kind: "fallback";
  localComponentName: string;
}

export interface StyleDeclarationModel {
  property: LayoutStyleProperty | AppearanceStyleProperty;
  value: string;
}

export interface StyleRuleModel {
  className: string;
  declarations: StyleDeclarationModel[];
}

export interface StyleBuildResult {
  rules: StyleRuleModel[];
  diagnostics: Diagnostic[];
  requiresRelativeParent: boolean;
}

export interface FallbackComponentModel {
  nodeId: string;
  localComponentName: string;
  className: string;
}

export interface ReactIntrinsicWrapperModel extends ReactElementBaseModel {
  kind: "intrinsic-wrapper";
  tag: "div";
  className: string;
}

export type ReactElementModel =
  | ReactReuseElementModel
  | ReactComposeElementModel
  | ReactFallbackElementModel
  | ReactIntrinsicWrapperModel;

export interface ReactGenerationModel {
  imports: ReactImportModel[];
  externalProps: GeneratedPropModel[];
  renderOnlyProps: RenderOnlyPropReport[];
  styles: StyleRuleModel[];
  fallbacks: FallbackComponentModel[];
  diagnostics: Diagnostic[];
  root: ReactElementModel;
}
