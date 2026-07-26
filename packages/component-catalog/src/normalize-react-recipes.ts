import type {
  ReactRenderRecipesV1,
  ReactRenderRecipesV2,
} from "@uig/contracts";

export function normalizeReactRenderRecipes(
  input: ReactRenderRecipesV1 | ReactRenderRecipesV2,
): ReactRenderRecipesV2 {
  if (input.schema === "react-render-recipes/v2") {
    return structuredClone(input);
  }
  return {
    schema: "react-render-recipes/v2",
    components: input.components.map((recipe) => ({
      ...recipe,
      staticProps: [],
    })),
    compositions: structuredClone(input.compositions),
  };
}
