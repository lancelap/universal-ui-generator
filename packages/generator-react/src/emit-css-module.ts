import { ReactGenerationError } from "./errors.js";
import type {
  StyleDeclarationModel,
  StyleRuleModel,
} from "./generation-model.js";

const CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const cssProperties = {
  display: "display",
  flexDirection: "flex-direction",
  gap: "gap",
  padding: "padding",
  width: "width",
  minWidth: "min-width",
  maxWidth: "max-width",
  height: "height",
  minHeight: "min-height",
  maxHeight: "max-height",
  alignItems: "align-items",
  justifyContent: "justify-content",
  alignSelf: "align-self",
  flexWrap: "flex-wrap",
  position: "position",
  inset: "inset",
  background: "background",
  color: "color",
  border: "border",
  borderRadius: "border-radius",
  boxShadow: "box-shadow",
  opacity: "opacity",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontWeight: "font-weight",
  lineHeight: "line-height",
  textAlign: "text-align",
} as const satisfies Record<StyleDeclarationModel["property"], string>;

const propertyOrder = Object.keys(cssProperties) as Array<
  StyleDeclarationModel["property"]
>;

export function emitCssModule(styles: StyleRuleModel[]): string {
  const rules = [...styles]
    .map(validateRule)
    .sort((left, right) => left.className.localeCompare(right.className));

  return rules
    .map(
      (rule) =>
        `.${rule.className} {\n${rule.declarations
          .map(
            (declaration) =>
              `  ${cssProperties[declaration.property]}: ${declaration.value};`,
          )
          .join("\n")}\n}`,
    )
    .join("\n\n")
    .concat("\n");
}

function validateRule(rule: StyleRuleModel): StyleRuleModel {
  if (!CLASS_NAME.test(rule.className)) {
    invalid(`Unsafe CSS Module class name ${JSON.stringify(rule.className)}`);
  }

  const seen = new Set<string>();
  const declarations = [...rule.declarations]
    .map((declaration) => validateDeclaration(declaration, seen))
    .sort(
      (left, right) =>
        propertyOrder.indexOf(left.property) -
        propertyOrder.indexOf(right.property),
    );
  return { className: rule.className, declarations };
}

function validateDeclaration(
  declaration: StyleDeclarationModel,
  seen: Set<string>,
): StyleDeclarationModel {
  if (!Object.hasOwn(cssProperties, declaration.property)) {
    invalid(`Unsupported CSS property ${JSON.stringify(declaration.property)}`);
  }
  if (seen.has(declaration.property)) {
    invalid(`Duplicate CSS property ${declaration.property}`);
  }
  if (
    typeof declaration.value !== "string" ||
    declaration.value.includes("!important") ||
    /[;{}]|\/\*/.test(declaration.value)
  ) {
    invalid(`CSS declaration ${declaration.property} contains unsafe syntax`);
  }
  seen.add(declaration.property);
  return declaration;
}

function invalid(message: string): never {
  throw new ReactGenerationError("GENERATION_SOURCE_INVALID", message);
}
