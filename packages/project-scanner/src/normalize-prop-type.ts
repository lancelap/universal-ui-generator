import type { NormalizedPropType } from "@uig/contracts";
import ts from "typescript";

export function normalizeType(input: {
  checker: ts.TypeChecker;
  type: ts.Type;
  location: ts.Node;
  depth?: number;
  seen?: ReadonlySet<number>;
}): NormalizedPropType {
  const { checker, location } = input;
  const depth = input.depth ?? 0;
  const displayName = checker.typeToString(input.type, location);
  if (
    /(?:^|\| )ReactNode(?: \||$)/.test(displayName) ||
    input.type.aliasSymbol?.getName() === "ReactNode"
  )
    return { kind: "react-node" };
  if (
    displayName === "ReactElement" ||
    displayName === "Element" ||
    displayName.startsWith("ReactElement<")
  )
    return { kind: "react-element" };
  if (depth >= 12)
    return {
      kind: "opaque",
      displayName,
      reason: "maximum-normalization-depth",
    };

  let type = input.type;
  if (type.isUnion()) {
    const defined = type.types.filter(
      (part) => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    );
    if (defined.length === 1)
      return normalizeType({ ...input, type: defined[0]!, depth: depth + 1 });
    if (
      defined.length > 0 &&
      defined.every((part) => part.flags & ts.TypeFlags.BooleanLiteral)
    ) {
      return { kind: "boolean" };
    }
    const literals = defined.map(literalValue);
    if (literals.every((value) => value !== undefined)) {
      return {
        kind: "enum",
        values: literals as Array<string | number | boolean>,
      };
    }
  }
  if (type.flags & ts.TypeFlags.StringLike) return { kind: "string" };
  if (type.flags & ts.TypeFlags.NumberLike) return { kind: "number" };
  if (type.flags & ts.TypeFlags.BooleanLike) return { kind: "boolean" };
  if (type.flags & ts.TypeFlags.Void) return { kind: "void" };
  if (checker.isTupleType(type)) {
    const args = checker.getTypeArguments(type as ts.TypeReference);
    return {
      kind: "tuple",
      elements: args.map((entry) =>
        normalizeType({ ...input, type: entry, depth: depth + 1 }),
      ),
    };
  }
  if (checker.isArrayType(type)) {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0];
    return element
      ? {
          kind: "array",
          element: normalizeType({ ...input, type: element, depth: depth + 1 }),
        }
      : { kind: "opaque", displayName, reason: "array-element-unresolved" };
  }
  const calls = type.getCallSignatures();
  if (calls.length > 0) {
    const signature = calls[0]!;
    return {
      kind: "function",
      parameters: signature.parameters.map((parameter) => ({
        name: parameter.getName(),
        type: normalizeType({
          ...input,
          type: checker.getTypeOfSymbolAtLocation(parameter, location),
          depth: depth + 1,
        }),
      })),
      returns: normalizeType({
        ...input,
        type: signature.getReturnType(),
        depth: depth + 1,
      }),
    };
  }
  const symbolName = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
  if (symbolName && !symbolName.startsWith("__"))
    return { kind: "reference", name: symbolName };
  const properties = type.getProperties();
  if (properties.length > 0) {
    return {
      kind: "object",
      properties: properties
        .sort((a, b) => a.getName().localeCompare(b.getName()))
        .map((property) => ({
          name: property.getName(),
          required: !(property.flags & ts.SymbolFlags.Optional),
          type: normalizeType({
            ...input,
            type: checker.getTypeOfSymbolAtLocation(property, location),
            depth: depth + 1,
          }),
        })),
    };
  }
  return { kind: "opaque", displayName, reason: "type-not-representable" };
}

function literalValue(type: ts.Type): string | number | boolean | undefined {
  if (type.isStringLiteral() || type.isNumberLiteral()) return type.value;
  if (type.flags & ts.TypeFlags.BooleanLiteral)
    return (type as { intrinsicName?: string }).intrinsicName === "true";
  return undefined;
}
