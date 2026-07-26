import type {
  ContentSource,
  ReactComponentRecipe,
  ResolutionNode,
  StateSource,
  UiInteraction,
  UiNodeV2,
} from "@uig/contracts";

import { ReactGenerationError } from "./errors.js";
import type {
  GeneratedPropModel,
  ReactPropModel,
  ReactPropsBuildResult,
} from "./generation-model.js";

export function buildPropsModel(
  node: UiNodeV2,
  resolution: ResolutionNode,
  recipe: ReactComponentRecipe,
): ReactPropsBuildResult {
  if (resolution.decision === "blocked") {
    throw new ReactGenerationError(
      "GENERATION_INPUT_INVALID",
      `Cannot build props for blocked node ${node.id}`,
    );
  }

  const elementProps: ReactPropModel[] = [];
  const renderOnlyNames = new Set<string>();
  if ("staticProps" in recipe) {
    for (const prop of recipe.staticProps) {
      setElementProp(elementProps, {
        name: prop.target,
        value:
          prop.value.kind === "literal"
            ? { kind: "literal", value: prop.value.value }
            : { kind: prop.value.kind },
      });
      renderOnlyNames.add(prop.target);
    }
  }

  const resolvedDefaults =
    resolution.decision === "reuse" || resolution.decision === "compose"
      ? resolution.props
      : {};

  for (const name of Object.keys(resolvedDefaults).sort()) {
    const value = resolvedDefaults[name];
    if (!isLiteral(value)) {
      throw new ReactGenerationError(
        "GENERATION_INPUT_INVALID",
        `Default prop ${name} on ${node.id} is not a supported literal`,
      );
    }
    setHigherPrecedenceProp(elementProps, renderOnlyNames, {
      name,
      value: { kind: "literal", value },
    });
  }

  let textChild: ReactPropsBuildResult["textChild"];
  if (recipe.content) {
    const value = readContent(node, recipe.content.source);
    if (value === undefined) {
      throw new ReactGenerationError(
        "GENERATION_INPUT_INCOMPLETE",
        `Node ${node.id} has no ${recipe.content.source}`,
      );
    }
    if (recipe.content.target === "children") {
      textChild = { kind: "text", value };
      renderOnlyNames.delete(recipe.content.target);
    } else {
      setHigherPrecedenceProp(elementProps, renderOnlyNames, {
        name: recipe.content.target,
        value: { kind: "literal", value },
      });
    }
  }

  for (const mapping of recipe.stateProps) {
    const value = readState(node, mapping.source);
    if (value === undefined) {
      continue;
    }
    if (!matchesValueType(value, mapping.valueType)) {
      throw new ReactGenerationError(
        "GENERATION_INPUT_INVALID",
        `${mapping.source} on ${node.id} is not ${mapping.valueType}`,
      );
    }
    setHigherPrecedenceProp(elementProps, renderOnlyNames, {
      name: mapping.target,
      value: { kind: "literal", value },
    });
  }

  const generatedByName = new Map<string, GeneratedPropModel>();
  const mappedEventTargets = new Set<string>();
  for (const mapping of recipe.eventProps) {
    const interactions = (node.interactions ?? []).filter(
      (interaction) => interaction.event === mapping.source,
    );
    for (const interaction of interactions) {
      const external = generatedProp(interaction);
      const existing = generatedByName.get(external.name);
      if (existing && existing.type !== external.type) {
        throw new ReactGenerationError(
          "GENERATION_PROP_CONFLICT",
          `Interaction props ${existing.interactionKey} and ${interaction.key} both normalize to ${external.name}`,
        );
      }
      generatedByName.set(external.name, existing ?? external);
      if (mappedEventTargets.has(mapping.target)) {
        throw new ReactGenerationError(
          "GENERATION_PROP_CONFLICT",
          `Multiple interactions map to ${mapping.target} on ${node.id}`,
        );
      }
      mappedEventTargets.add(mapping.target);
      setHigherPrecedenceProp(elementProps, renderOnlyNames, {
        name: mapping.target,
        value: { kind: "external-prop", propName: external.name },
      });
    }
  }

  if (recipe.classNameProp) {
    setHigherPrecedenceProp(elementProps, renderOnlyNames, {
      name: recipe.classNameProp,
      value: { kind: "class-name", className: cssIdentifier(node.id) },
    });
  }

  return {
    elementProps: elementProps.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    externalProps: [...generatedByName.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    renderOnlyPropNames: [...renderOnlyNames].sort((left, right) =>
      left.localeCompare(right),
    ),
    ...(textChild ? { textChild } : {}),
  };
}

function readContent(
  node: UiNodeV2,
  source: ContentSource,
): string | undefined {
  const key = source.slice("content.".length);
  const value = node.content?.[key];
  return typeof value === "string" ? value : undefined;
}

function readState(node: UiNodeV2, source: StateSource): unknown {
  const key = source.slice("state.".length);
  return node.state?.[key];
}

function generatedProp(interaction: UiInteraction): GeneratedPropModel {
  const name = `on${pascal(interaction.key)}`;
  if (interaction.event === "activate") {
    if (interaction.valueType !== "void") {
      invalidInteraction(interaction);
    }
    return {
      name,
      optional: true,
      type: "() => void",
      interactionKey: interaction.key,
    };
  }
  if (interaction.valueType === "void") {
    invalidInteraction(interaction);
  }
  return {
    name,
    optional: true,
    type: `(value: ${interaction.valueType}) => void`,
    interactionKey: interaction.key,
  };
}

function invalidInteraction(interaction: UiInteraction): never {
  throw new ReactGenerationError(
    "GENERATION_INPUT_INVALID",
    `Interaction ${interaction.key} has an invalid value type`,
  );
}

function setElementProp(props: ReactPropModel[], prop: ReactPropModel): void {
  const existing = props.findIndex((item) => item.name === prop.name);
  if (existing >= 0) {
    props.splice(existing, 1);
  }
  props.push(prop);
}

function setHigherPrecedenceProp(
  props: ReactPropModel[],
  renderOnlyNames: Set<string>,
  prop: ReactPropModel,
): void {
  setElementProp(props, prop);
  renderOnlyNames.delete(prop.name);
}

function isLiteral(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function matchesValueType(
  value: unknown,
  expected: "string" | "boolean" | "number",
): value is string | boolean | number {
  return typeof value === expected;
}

function cssIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_");
}

function pascal(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}
