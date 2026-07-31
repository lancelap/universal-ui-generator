import ts from "typescript";

import type {
  FallbackComponentModel,
  GeneratedPropModel,
  ReactElementModel,
  ReactGeneratedRelativeImportModel,
  ReactGenerationModel,
  ReactPropModel,
  ReactPropValueModel,
  ReactSingleSelectionCollectionElementModel,
} from "./generation-model.js";

const factory = ts.factory;

export function emitTsx(
  model: ReactGenerationModel,
  componentName: string,
  generatedRelativeImports: ReactGeneratedRelativeImportModel[] = [],
): string {
  const needsStyles = containsClassName(model.root);
  const statements: ts.Statement[] = [
    ...emitImports(model, componentName, needsStyles, generatedRelativeImports),
    emitPropsInterface(componentName, model.externalProps),
    emitComponent(componentName, model.externalProps, model.root),
  ];
  return printStatements(statements);
}

export function emitFallbackTsx(fallback: FallbackComponentModel): string {
  const componentName = fallback.localComponentName;
  const propsName = `${componentName}Props`;
  const statements: ts.Statement[] = [
    factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        true,
        undefined,
        factory.createNamedImports([
          factory.createImportSpecifier(
            false,
            undefined,
            factory.createIdentifier("ReactNode"),
          ),
        ]),
      ),
      factory.createStringLiteral("react"),
      undefined,
    ),
    factory.createImportDeclaration(
      undefined,
      factory.createImportClause(
        false,
        factory.createIdentifier("styles"),
        undefined,
      ),
      factory.createStringLiteral(`./${componentName}.module.css`),
      undefined,
    ),
    factory.createInterfaceDeclaration(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      factory.createIdentifier(propsName),
      undefined,
      undefined,
      [
        factory.createPropertySignature(
          undefined,
          factory.createIdentifier("children"),
          factory.createToken(ts.SyntaxKind.QuestionToken),
          factory.createTypeReferenceNode("ReactNode", undefined),
        ),
      ],
    ),
    factory.createFunctionDeclaration(
      [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      undefined,
      factory.createIdentifier(componentName),
      undefined,
      [
        factory.createParameterDeclaration(
          undefined,
          undefined,
          factory.createObjectBindingPattern([
            factory.createBindingElement(
              undefined,
              undefined,
              factory.createIdentifier("children"),
              undefined,
            ),
          ]),
          undefined,
          factory.createTypeReferenceNode(propsName, undefined),
          undefined,
        ),
      ],
      undefined,
      factory.createBlock(
        [
          factory.createReturnStatement(
            factory.createParenthesizedExpression(
              factory.createJsxElement(
                factory.createJsxOpeningElement(
                  factory.createIdentifier("div"),
                  undefined,
                  factory.createJsxAttributes([
                    factory.createJsxAttribute(
                      factory.createIdentifier("className"),
                      factory.createJsxExpression(
                        undefined,
                        factory.createElementAccessExpression(
                          factory.createIdentifier("styles"),
                          factory.createStringLiteral(fallback.className),
                        ),
                      ),
                    ),
                  ]),
                ),
                [
                  factory.createJsxExpression(
                    undefined,
                    factory.createIdentifier("children"),
                  ),
                ],
                factory.createJsxClosingElement(
                  factory.createIdentifier("div"),
                ),
              ),
            ),
          ),
        ],
        true,
      ),
    ),
  ];
  return printStatements(statements);
}

function printStatements(statements: ts.Statement[]): string {
  const file = factory.updateSourceFile(
    factory.createSourceFile(
      statements,
      factory.createToken(ts.SyntaxKind.EndOfFileToken),
      ts.NodeFlags.None,
    ),
    statements,
  );

  return (
    ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printFile(file)
      .trimEnd() + "\n"
  );
}

function emitImports(
  model: ReactGenerationModel,
  componentName: string,
  needsStyles: boolean,
  generatedRelativeImports: ReactGeneratedRelativeImportModel[],
): ts.ImportDeclaration[] {
  const imports = model.imports.map((item) => {
    const importClause =
      item.kind === "default"
        ? factory.createImportClause(
            false,
            factory.createIdentifier(item.local),
            undefined,
          )
        : factory.createImportClause(
            false,
            undefined,
            factory.createNamedImports(
              item.specifiers.map((specifier) =>
                factory.createImportSpecifier(
                  false,
                  specifier.imported === specifier.local
                    ? undefined
                    : factory.createIdentifier(specifier.imported),
                  factory.createIdentifier(specifier.local),
                ),
              ),
            ),
          );
    return factory.createImportDeclaration(
      undefined,
      importClause,
      factory.createStringLiteral(item.package),
      undefined,
    );
  });
  imports.push(
    ...[...generatedRelativeImports]
      .sort(
        (left, right) =>
          left.path.localeCompare(right.path) ||
          JSON.stringify(left.specifiers).localeCompare(
            JSON.stringify(right.specifiers),
          ),
      )
      .map((item) =>
        factory.createImportDeclaration(
          undefined,
          factory.createImportClause(
            false,
            undefined,
            factory.createNamedImports(
              [...item.specifiers]
                .sort(
                  (left, right) =>
                    left.local.localeCompare(right.local) ||
                    left.imported.localeCompare(right.imported),
                )
                .map((specifier) =>
                  factory.createImportSpecifier(
                    false,
                    specifier.imported === specifier.local
                      ? undefined
                      : factory.createIdentifier(specifier.imported),
                    factory.createIdentifier(specifier.local),
                  ),
                ),
            ),
          ),
          factory.createStringLiteral(item.path),
          undefined,
        ),
      ),
  );
  if (needsStyles) {
    imports.push(
      factory.createImportDeclaration(
        undefined,
        factory.createImportClause(
          false,
          factory.createIdentifier("styles"),
          undefined,
        ),
        factory.createStringLiteral(`./${componentName}.module.css`),
        undefined,
      ),
    );
  }
  return imports;
}

function emitPropsInterface(
  componentName: string,
  props: GeneratedPropModel[],
): ts.InterfaceDeclaration {
  return factory.createInterfaceDeclaration(
    [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    factory.createIdentifier(`${componentName}Props`),
    undefined,
    undefined,
    props.map((prop) =>
      factory.createPropertySignature(
        undefined,
        factory.createIdentifier(prop.name),
        prop.optional
          ? factory.createToken(ts.SyntaxKind.QuestionToken)
          : undefined,
        callbackType(prop),
      ),
    ),
  );
}

function callbackType(prop: GeneratedPropModel): ts.FunctionTypeNode {
  const match = /^\(value: (string|boolean|number)\) => void$/.exec(prop.type);
  return factory.createFunctionTypeNode(
    undefined,
    match
      ? [
          factory.createParameterDeclaration(
            undefined,
            undefined,
            factory.createIdentifier("value"),
            undefined,
            factory.createKeywordTypeNode(
              match[1] === "string"
                ? ts.SyntaxKind.StringKeyword
                : match[1] === "boolean"
                  ? ts.SyntaxKind.BooleanKeyword
                  : ts.SyntaxKind.NumberKeyword,
            ),
            undefined,
          ),
        ]
      : [],
    factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
  );
}

function emitComponent(
  componentName: string,
  props: GeneratedPropModel[],
  root: ReactElementModel,
): ts.FunctionDeclaration {
  return factory.createFunctionDeclaration(
    [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    undefined,
    factory.createIdentifier(componentName),
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createObjectBindingPattern(
          props.map((prop) =>
            factory.createBindingElement(
              undefined,
              undefined,
              factory.createIdentifier(prop.name),
              undefined,
            ),
          ),
        ),
        undefined,
        factory.createTypeReferenceNode(`${componentName}Props`, undefined),
        undefined,
      ),
    ],
    undefined,
    factory.createBlock(
      [
        factory.createReturnStatement(
          factory.createParenthesizedExpression(emitElement(root)),
        ),
      ],
      true,
    ),
  );
}

function emitElement(
  element: ReactElementModel,
): ts.JsxElement | ts.JsxSelfClosingElement {
  if (element.kind === "single-selection-collection") {
    return emitSingleSelectionCollection(element);
  }
  const tagName =
    element.kind === "intrinsic-wrapper"
      ? factory.createIdentifier(element.tag)
      : factory.createIdentifier(
          element.kind === "fallback"
            ? element.localComponentName
            : element.localName,
        );
  const props =
    element.kind === "reuse" || element.kind === "compose"
      ? element.props
      : element.kind === "intrinsic-wrapper"
        ? [
            {
              name: "className",
              value: {
                kind: "class-name",
                className: element.className,
              },
            } satisfies ReactPropModel,
          ]
        : [];
  const children = [
    ...(element.kind === "reuse" || element.kind === "compose"
      ? element.textChild
        ? [jsxText(element.textChild.value)]
        : []
      : []),
    ...(element.kind === "compose"
      ? element.slots.map((slot) =>
          jsxElement(
            factory.createIdentifier(slot.localName),
            [],
            slot.children.map(emitElement),
          ),
        )
      : element.children.map(emitElement)),
  ];
  return jsxElement(tagName, props, children);
}

function emitSingleSelectionCollection(
  element: ReactSingleSelectionCollectionElementModel,
): ts.JsxElement {
  const classProp = (className: string): ReactPropModel => ({
    name: "className",
    value: { kind: "class-name", className },
  });
  const textElement = (
    localName: string,
    value: string,
    props: ReactPropModel[] = [],
  ) => jsxElement(factory.createIdentifier(localName), props, [jsxText(value)]);
  const headerChildren: Array<ts.JsxChild | ts.JsxElement> = [];
  if (element.leadingAssetLocalName) {
    headerChildren.push(
      jsxElement(
        factory.createIdentifier(element.leadingAssetLocalName),
        [],
        [],
      ),
    );
  }
  headerChildren.push(textElement(element.titleLocalName, element.title));
  const header = jsxElement(
    factory.createIdentifier(element.layoutLocalName),
    [classProp(element.classNames.header)],
    headerChildren,
  );

  const sections = element.sections.map((section) => {
    const children: Array<ts.JsxChild | ts.JsxElement> = [];
    if (section.label) {
      children.push(
        textElement(element.titleLocalName, section.label, [
          classProp(element.classNames.sectionLabel),
        ]),
      );
    }
    for (const option of section.options) {
      const optionContent: Array<ts.JsxChild | ts.JsxElement> = [
        textElement(element.titleLocalName, option.label),
      ];
      if (option.description) {
        optionContent.push(
          textElement(element.descriptionLocalName, option.description, [
            classProp(element.classNames.description),
          ]),
        );
      }
      const optionElement = jsxElement(
        factory.createIdentifier(element.optionLocalName),
        option.props,
        [
          jsxElement(
            factory.createIdentifier(element.layoutLocalName),
            [classProp(element.classNames.optionContent)],
            optionContent,
          ),
        ],
      );
      const rowChildren: Array<ts.JsxChild | ts.JsxElement> = [optionElement];
      if (option.hasTrailingAsset && element.trailingAssetLocalName) {
        rowChildren.push(
          jsxElement(
            factory.createIdentifier(element.trailingAssetLocalName),
            [classProp(element.classNames.trailingAsset)],
            [],
          ),
        );
      }
      children.push(
        jsxElement(
          factory.createIdentifier(element.layoutLocalName),
          [classProp(element.classNames.optionRow)],
          rowChildren,
        ),
      );
    }
    return jsxElement(
      factory.createIdentifier("section"),
      [classProp(element.classNames.section)],
      children,
    );
  });
  const group = jsxStructuredElement(
    factory.createIdentifier(element.rootLocalName),
    element.rootProps,
    sections,
  );
  return jsxElement(
    factory.createIdentifier("section"),
    [classProp(element.classNames.root)],
    [header, group],
  ) as ts.JsxElement;
}

function jsxStructuredElement(
  tagName: ts.JsxTagNameExpression,
  props: ReactPropModel[],
  children: Array<ts.JsxChild | ts.JsxSelfClosingElement | ts.JsxElement>,
): ts.JsxElement {
  const attributes = factory.createJsxAttributes(
    props.map((prop) =>
      prop.value.kind === "noop"
        ? factory.createJsxAttribute(
            factory.createIdentifier(prop.name),
            factory.createJsxExpression(
              undefined,
              factory.createArrowFunction(
                undefined,
                undefined,
                [],
                undefined,
                factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                factory.createBlock([], false),
              ),
            ),
          )
        : emitProp(prop),
    ),
  );
  return factory.createJsxElement(
    factory.createJsxOpeningElement(tagName, undefined, attributes),
    children,
    factory.createJsxClosingElement(tagName),
  );
}

function jsxElement(
  tagName: ts.JsxTagNameExpression,
  props: ReactPropModel[],
  children: Array<ts.JsxChild | ts.JsxSelfClosingElement | ts.JsxElement>,
): ts.JsxElement | ts.JsxSelfClosingElement {
  const attributes = factory.createJsxAttributes(props.map(emitProp));
  if (children.length === 0) {
    return factory.createJsxSelfClosingElement(tagName, undefined, attributes);
  }
  return factory.createJsxElement(
    factory.createJsxOpeningElement(tagName, undefined, attributes),
    children,
    factory.createJsxClosingElement(tagName),
  );
}

function emitProp(prop: ReactPropModel): ts.JsxAttribute {
  return factory.createJsxAttribute(
    factory.createIdentifier(prop.name),
    jsxPropInitializer(prop.value),
  );
}

function jsxPropInitializer(value: ReactPropValueModel): ts.JsxAttributeValue {
  if (value.kind === "literal" && typeof value.value === "string") {
    return factory.createStringLiteral(value.value);
  }
  return factory.createJsxExpression(undefined, expressionForValue(value));
}

function expressionForValue(value: ReactPropValueModel): ts.Expression {
  switch (value.kind) {
    case "literal":
      return literalExpression(value.value);
    case "empty-array":
      return factory.createArrayLiteralExpression();
    case "noop":
      return factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        factory.createIdentifier("undefined"),
      );
    case "external-prop":
      return factory.createIdentifier(value.propName);
    case "class-name":
      return factory.createElementAccessExpression(
        factory.createIdentifier("styles"),
        factory.createStringLiteral(value.className),
      );
  }
}

function literalExpression(
  value: string | number | boolean | null,
): ts.Expression {
  if (value === null) {
    return factory.createNull();
  }
  if (typeof value === "string") {
    return factory.createStringLiteral(value);
  }
  if (typeof value === "boolean") {
    return value ? factory.createTrue() : factory.createFalse();
  }
  return factory.createNumericLiteral(value);
}

function jsxText(value: string): ts.JsxExpression {
  return factory.createJsxExpression(
    undefined,
    factory.createStringLiteral(value),
  );
}

function containsClassName(element: ReactElementModel): boolean {
  if (element.kind === "single-selection-collection") {
    return true;
  }
  const props =
    element.kind === "reuse" || element.kind === "compose" ? element.props : [];
  return (
    element.kind === "intrinsic-wrapper" ||
    props.some((prop) => prop.value.kind === "class-name") ||
    (element.kind === "compose" &&
      element.slots.some((slot) => slot.children.some(containsClassName))) ||
    element.children.some(containsClassName)
  );
}
