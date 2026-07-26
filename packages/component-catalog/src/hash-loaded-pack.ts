import {
  type ComponentCatalog,
  type CompositionRules,
  type DesignSystemPackV2,
  type DesignTokens,
  type PixsoMap,
  type ReactRenderRecipesV2,
  type ReactStylePolicy,
  type SemanticPolicy,
  stableStringify,
  type Verification,
} from "@uig/contracts";
import { sha256 } from "@uig/design-context";

export interface LoadedDesignSystemPackDocuments {
  manifest: DesignSystemPackV2;
  catalog: ComponentCatalog;
  semanticPolicy: SemanticPolicy;
  pixsoMap: PixsoMap;
  compositionRules: CompositionRules;
  tokens: DesignTokens;
  verification: Verification;
  reactRenderRecipes: ReactRenderRecipesV2;
  reactStylePolicy: ReactStylePolicy;
}

export function hashLoadedDesignSystemPackDocuments(
  documents: LoadedDesignSystemPackDocuments,
): string {
  return sha256(
    stableStringify({
      manifest: documents.manifest,
      documents: {
        catalog: documents.catalog,
        semanticPolicy: documents.semanticPolicy,
        pixsoMap: documents.pixsoMap,
        compositionRules: documents.compositionRules,
        tokens: documents.tokens,
        verification: documents.verification,
        reactRenderRecipes: documents.reactRenderRecipes,
        reactStylePolicy: documents.reactStylePolicy,
      },
    }),
  );
}
