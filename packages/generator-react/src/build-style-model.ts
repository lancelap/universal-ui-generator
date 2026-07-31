import type {
  AppearanceStyleProperty,
  DesignNodeV2,
  Diagnostic,
  LayoutStyleProperty,
  ReactComponentRecipeV2,
  ReactStylePolicy,
  UiNodeV2,
} from "@uig/contracts";

import { ReactGenerationError } from "./errors.js";
import type {
  StyleBuildResult,
  StyleDeclarationModel,
  StyleRuleModel,
  ReactSingleSelectionCollectionElementModel,
} from "./generation-model.js";

const propertyOrder = [
  "display",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "alignSelf",
  "gap",
  "padding",
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "position",
  "inset",
  "background",
  "color",
  "border",
  "borderRadius",
  "boxShadow",
  "opacity",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
] as const;

type StyleProperty = LayoutStyleProperty | AppearanceStyleProperty;

export interface ParentPositioningEvidence {
  canAttach: boolean;
  positionAllowed: boolean;
}

export function buildStyleModel(input: {
  node: UiNodeV2;
  designNode: DesignNodeV2;
  componentId?: string;
  recipe: ReactComponentRecipeV2;
  policy: ReactStylePolicy;
  parentPositioning?: ParentPositioningEvidence;
  relativeContainingBlock?: boolean;
}): StyleBuildResult {
  const declarations = new Map<StyleProperty, string>();
  const diagnostics: Diagnostic[] = [];
  const allowed = allowedProperties(input.policy, input.componentId);
  let requiresRelativeParent = false;
  const add = (property: StyleProperty, value: string, structural = false) => {
    if (allowed.has(property)) {
      declarations.set(property, value);
      return;
    }
    if (structural) {
      throw new ReactGenerationError(
        "GENERATION_LAYOUT_UNSUPPORTED",
        `Node ${input.node.id} requires the forbidden structural style ${property}`,
      );
    }
    if (isLayoutProperty(property)) return;
    diagnostics.push(forbiddenStyleDiagnostic(input.node, property));
  };

  const layout = input.designNode.layout;
  if (layout?.mode === "vertical" || layout?.mode === "horizontal") {
    add("display", "flex");
    add("flexDirection", layout.mode === "vertical" ? "column" : "row");
    if (layout.wrap) add("flexWrap", "wrap");
    addAllowedKeyword(add, "alignItems", layout.alignItems);
    if (layout.justifyContent) {
      addAllowedKeyword(add, "justifyContent", layout.justifyContent);
    }
    add("gap", px(layout.gap));
    add("padding", paddingValue(layout.padding));
  }

  add("width", px(input.designNode.geometry.width));
  add("height", px(input.designNode.geometry.height));

  if (
    input.relativeContainingBlock &&
    input.designNode.position?.mode === "absolute"
  ) {
    throw new ReactGenerationError(
      "GENERATION_LAYOUT_UNSUPPORTED",
      `Node ${input.node.id} cannot be both absolute and a relative containing block`,
    );
  }
  if (input.relativeContainingBlock) add("position", "relative", true);

  if (input.designNode.position?.mode === "absolute") {
    if (
      !input.parentPositioning?.canAttach ||
      !input.parentPositioning.positionAllowed
    ) {
      throw new ReactGenerationError(
        "GENERATION_LAYOUT_UNSUPPORTED",
        `Node ${input.node.id} has no legal relative containing parent`,
      );
    }
    add("position", "absolute", true);
    const inset = input.designNode.position.inset;
    if (inset) add("inset", insetValue(inset), true);
    requiresRelativeParent = true;
  }

  const appearance = input.designNode.appearance;
  const solidFill = appearance.fills.find((fill) => fill.type === "solid");
  if (solidFill?.color) {
    add("background", colorValue(solidFill.color, solidFill.opacity));
  }
  if (appearance.fills.some((fill) => fill.type === "unsupported")) {
    diagnostics.push(forbiddenStyleDiagnostic(input.node, "background"));
  }

  const border = appearance.borders[0];
  if (border && isUniform(border.width)) {
    add(
      "border",
      `${px(border.width.top)} ${border.style} ${colorValue(border.color, border.opacity)}`,
    );
  } else if (appearance.borders.length > 0) {
    diagnostics.push(forbiddenStyleDiagnostic(input.node, "border"));
  }

  if (!isZeroRadii(appearance.radii)) {
    add("borderRadius", radiiValue(appearance.radii));
  }
  if (appearance.shadows.length > 0) {
    add("boxShadow", shadowsValue(appearance.shadows));
  }
  if (appearance.opacity !== 1) add("opacity", String(appearance.opacity));

  const text = input.designNode.text;
  if (text?.fontFamily && safeFontFamily(text.fontFamily)) {
    add("fontFamily", text.fontFamily);
  } else if (text?.fontFamily) {
    diagnostics.push(forbiddenStyleDiagnostic(input.node, "fontFamily"));
  }
  if (text?.fontSize !== undefined) add("fontSize", px(text.fontSize));
  if (text?.fontWeight !== undefined)
    add("fontWeight", String(text.fontWeight));
  if (text?.lineHeight !== undefined) add("lineHeight", px(text.lineHeight));
  if (text?.textAlign && isTextAlign(text.textAlign)) {
    add("textAlign", text.textAlign);
  } else if (text?.textAlign) {
    diagnostics.push(forbiddenStyleDiagnostic(input.node, "textAlign"));
  }

  const orderedDeclarations = propertyOrder.flatMap((property) => {
    const value = declarations.get(property);
    return value === undefined ? [] : [{ property, value }];
  });
  return {
    rules:
      orderedDeclarations.length === 0
        ? []
        : [
            {
              className: cssIdentifier(input.node.id),
              declarations: orderedDeclarations,
            },
          ],
    diagnostics: sortDiagnostics(diagnostics),
    requiresRelativeParent,
  };
}

export function buildSingleSelectionStyleModel(input: {
  node: UiNodeV2;
  designNode: DesignNodeV2;
  rootComponentId: string;
  policy: ReactStylePolicy;
  classNames: ReactSingleSelectionCollectionElementModel["classNames"];
}): StyleBuildResult {
  const root = buildStyleModel({
    node: input.node,
    designNode: input.designNode,
    componentId: input.rootComponentId,
    recipe: {
      componentId: input.rootComponentId,
      staticProps: [],
      stateProps: [],
      eventProps: [],
      semanticChildrenPolicy: "required",
      wrapper: "allowed",
      provenance: {
        kind: "generator",
        source: "single-selection structural lowering",
      },
    },
    policy: input.policy,
  });
  const rootRules = root.rules.map((rule) => ({
    ...rule,
    className: input.classNames.root,
  }));
  const fixedRules: StyleRuleModel[] = [
    {
      className: input.classNames.header,
      declarations: [
        { property: "display", value: "flex" },
        { property: "flexDirection", value: "row" },
        { property: "alignItems", value: "center" },
        { property: "gap", value: "12px" },
      ],
    },
    {
      className: input.classNames.section,
      declarations: [
        { property: "display", value: "flex" },
        { property: "flexDirection", value: "column" },
        { property: "gap", value: "12px" },
      ],
    },
    {
      className: input.classNames.sectionLabel,
      declarations: [{ property: "width", value: "100%" }],
    },
    {
      className: input.classNames.optionRow,
      declarations: [
        { property: "display", value: "flex" },
        { property: "flexDirection", value: "row" },
        { property: "alignItems", value: "flex-start" },
        { property: "gap", value: "12px" },
      ],
    },
    {
      className: input.classNames.optionContent,
      declarations: [
        { property: "display", value: "flex" },
        { property: "flexDirection", value: "column" },
        { property: "gap", value: "4px" },
        { property: "width", value: "100%" },
      ],
    },
    {
      className: input.classNames.description,
      declarations: [{ property: "width", value: "100%" }],
    },
    {
      className: input.classNames.trailingAsset,
      declarations: [{ property: "alignSelf", value: "flex-start" }],
    },
  ];
  return {
    rules: [...rootRules, ...fixedRules],
    diagnostics: root.diagnostics,
    requiresRelativeParent: false,
  };
}

function allowedProperties(
  policy: ReactStylePolicy,
  componentId: string | undefined,
): ReadonlySet<StyleProperty> {
  if (!componentId) return new Set(propertyOrder);
  const component = policy.components.find(
    (candidate) => candidate.componentId === componentId,
  );
  return new Set(
    component
      ? [...component.layout.allowed, ...component.appearance.allowed]
      : [
          ...policy.defaults.layout.allowed,
          ...policy.defaults.appearance.allowed,
        ],
  );
}

function addAllowedKeyword(
  add: (property: StyleProperty, value: string, structural?: boolean) => void,
  property: "alignItems" | "justifyContent",
  value: string,
): void {
  if (isFlexAlignment(value)) add(property, value);
}

function isFlexAlignment(value: string): boolean {
  return [
    "stretch",
    "center",
    "flex-start",
    "flex-end",
    "start",
    "end",
    "baseline",
    "space-between",
    "space-around",
    "space-evenly",
  ].includes(value);
}

function isTextAlign(value: string): boolean {
  return ["left", "right", "center", "justify", "start", "end"].includes(value);
}

function px(value: number): string {
  return `${value}px`;
}

function paddingValue(
  padding: NonNullable<DesignNodeV2["layout"]>["padding"],
): string {
  const values = [padding.top, padding.right, padding.bottom, padding.left].map(
    px,
  );
  if (padding.top === padding.bottom && padding.right === padding.left) {
    return `${values[0]} ${values[1]}`;
  }
  if (padding.right === padding.left) {
    return `${values[0]} ${values[1]} ${values[2]}`;
  }
  return values.join(" ");
}

function isLayoutProperty(
  property: StyleProperty,
): property is LayoutStyleProperty {
  return propertyOrder.indexOf(property) <= propertyOrder.indexOf("inset");
}

function insetValue(
  inset: NonNullable<NonNullable<DesignNodeV2["position"]>["inset"]>,
): string {
  return [inset.top, inset.right, inset.bottom, inset.left]
    .map((value) => (value === undefined ? "auto" : px(value)))
    .join(" ");
}

function isUniform(width: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): boolean {
  return (
    width.top === width.right &&
    width.top === width.bottom &&
    width.top === width.left
  );
}

function isZeroRadii(radii: DesignNodeV2["appearance"]["radii"]): boolean {
  return (
    radii.topLeft === 0 &&
    radii.topRight === 0 &&
    radii.bottomRight === 0 &&
    radii.bottomLeft === 0
  );
}

function radiiValue(radii: DesignNodeV2["appearance"]["radii"]): string {
  return [radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft]
    .map(px)
    .join(" ");
}

function shadowsValue(shadows: DesignNodeV2["appearance"]["shadows"]): string {
  return shadows
    .map(
      (shadow) =>
        `${shadow.type === "inner" ? "inset " : ""}${px(shadow.x)} ${px(shadow.y)} ${px(shadow.blur)} ${px(shadow.spread)} ${colorValue(shadow.color, shadow.opacity)}`,
    )
    .join(", ");
}

function colorValue(color: string, opacity: number): string {
  if (opacity === 1) return color;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function safeFontFamily(value: string): boolean {
  return !/[!;{}]/.test(value);
}

function forbiddenStyleDiagnostic(
  node: UiNodeV2,
  property: StyleProperty,
): Diagnostic {
  return {
    severity: "warning",
    blocking: false,
    stage: "react-generation",
    code: "GENERATION_STYLE_OVERRIDE_FORBIDDEN",
    message: `Style ${property} is not permitted for ${node.id}`,
    evidence: { manifestNodeId: node.id, semanticRole: node.role, property },
  };
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      String(left.evidence?.property ?? "").localeCompare(
        String(right.evidence?.property ?? ""),
      ),
  );
}

export function cssIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_");
}
