import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  type ComponentCatalog,
  ComponentCatalogSchema,
  type ComponentCatalogEntry,
  CompositionRulesSchema,
  type CompositionRules,
  DesignSystemPackSchema,
  type DesignSystemPack,
  DesignSystemPackV2Schema,
  type DesignSystemPackV2,
  DesignTokensSchema,
  type DesignTokens,
  type PixsoMap,
  PixsoMapSchema,
  type PixsoSemanticMapping,
  type ReactRenderRecipesV2,
  ReactRenderRecipesSchema,
  type ReactStylePolicy,
  ReactStylePolicySchema,
  SemanticPolicySchema,
  type SemanticPolicy,
  validateWithSchema,
  VerificationSchema,
  type Verification,
} from "@uig/contracts";

import { buildCatalogIndexes } from "./catalog-index.js";
import { DesignSystemPackError } from "./errors.js";
import { hashLoadedDesignSystemPackDocuments } from "./hash-loaded-pack.js";
import { normalizeReactRenderRecipes } from "./normalize-react-recipes.js";
import { validateCompositions } from "./validate-compositions.js";
import { validateReactRecipes } from "./validate-react-recipes.js";

export interface LoadedDesignSystemPack {
  manifest: DesignSystemPack | DesignSystemPackV2;
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  candidatesByRole: ReadonlyMap<string, readonly ComponentCatalogEntry[]>;
  semanticPolicy: SemanticPolicy;
  exactPixsoMappings: readonly PixsoSemanticMapping[];
  compositionRules: CompositionRules;
  tokens: DesignTokens;
  verification: Verification;
}

export interface LoadedDesignSystemPackV2 extends LoadedDesignSystemPack {
  manifest: DesignSystemPackV2;
  reactRenderRecipes: ReactRenderRecipesV2;
  reactStylePolicy: ReactStylePolicy;
  sha256: string;
}

export async function loadDesignSystemPack(
  packDirectory: string,
): Promise<LoadedDesignSystemPack> {
  try {
    const root = await realpath(packDirectory);
    const rawManifest = await readSafeJson(root, "pack.json");
    if (!isSchemaDocument(rawManifest)) {
      invalidManifest();
    }
    if (rawManifest.schema === "design-system-pack/v1") {
      const manifest = validateWithSchema(DesignSystemPackSchema, rawManifest);
      return loadCommonPack(root, manifest);
    }
    if (rawManifest.schema === "design-system-pack/v2") {
      const manifest = validateWithSchema(
        DesignSystemPackV2Schema,
        rawManifest,
      );
      return await loadV2Pack(root, manifest);
    }
    invalidManifest();
  } catch (error) {
    if (error instanceof DesignSystemPackError) {
      throw error;
    }
    throw new DesignSystemPackError(
      "DESIGN_SYSTEM_PACK_INVALID",
      "Design-system pack could not be loaded",
      { cause: error },
    );
  }
}

export async function loadDesignSystemPackV2(
  packDirectory: string,
): Promise<LoadedDesignSystemPackV2> {
  const loaded = await loadDesignSystemPack(packDirectory);
  if (loaded.manifest.schema !== "design-system-pack/v2") {
    throw new DesignSystemPackError(
      "DESIGN_SYSTEM_PACK_INVALID",
      "React generation requires design-system-pack/v2",
    );
  }
  return loaded as LoadedDesignSystemPackV2;
}

interface CommonPackDocuments {
  catalog: ComponentCatalog;
  semanticPolicy: SemanticPolicy;
  pixsoMap: PixsoMap;
  compositionRules: CompositionRules;
  tokens: DesignTokens;
  verification: Verification;
}

async function loadCommonPack(
  root: string,
  manifest: DesignSystemPack | DesignSystemPackV2,
): Promise<LoadedDesignSystemPack> {
  const documents = await loadCommonDocuments(root, manifest);
  const indexes = validateCommonDocuments(documents);
  return {
    manifest,
    ...indexes,
    semanticPolicy: documents.semanticPolicy,
    exactPixsoMappings: documents.pixsoMap.mappings,
    compositionRules: documents.compositionRules,
    tokens: documents.tokens,
    verification: documents.verification,
  };
}

async function loadV2Pack(
  root: string,
  manifest: DesignSystemPackV2,
): Promise<LoadedDesignSystemPackV2> {
  const [documents, rawReactRenderRecipes, reactStylePolicy] =
    await Promise.all([
      loadCommonDocuments(root, manifest),
      readAndValidate(
        root,
        manifest.files.reactRenderRecipes,
        ReactRenderRecipesSchema,
      ),
      readAndValidate(
        root,
        manifest.files.reactStylePolicy,
        ReactStylePolicySchema,
      ),
    ]);
  const reactRenderRecipes = normalizeReactRenderRecipes(rawReactRenderRecipes);
  const indexes = validateCommonDocuments(documents);
  validateReactRecipes({
    componentsById: indexes.componentsById,
    semanticPolicy: documents.semanticPolicy,
    compositionRules: documents.compositionRules,
    reactRenderRecipes,
    reactStylePolicy,
  });

  return {
    manifest,
    ...indexes,
    semanticPolicy: documents.semanticPolicy,
    exactPixsoMappings: documents.pixsoMap.mappings,
    compositionRules: documents.compositionRules,
    tokens: documents.tokens,
    verification: documents.verification,
    reactRenderRecipes,
    reactStylePolicy,
    sha256: hashLoadedDesignSystemPackDocuments({
      manifest,
      ...documents,
      reactRenderRecipes,
      reactStylePolicy,
    }),
  };
}

async function loadCommonDocuments(
  root: string,
  manifest: DesignSystemPack | DesignSystemPackV2,
): Promise<CommonPackDocuments> {
  const [
    catalog,
    semanticPolicy,
    pixsoMap,
    compositionRules,
    tokens,
    verification,
  ] = await Promise.all([
    readAndValidate(root, manifest.files.catalog, ComponentCatalogSchema),
    readAndValidate(root, manifest.files.semanticPolicy, SemanticPolicySchema),
    readAndValidate(root, manifest.files.pixsoMap, PixsoMapSchema),
    readAndValidate(
      root,
      manifest.files.compositionRules,
      CompositionRulesSchema,
    ),
    readAndValidate(root, manifest.files.tokens, DesignTokensSchema),
    readAndValidate(root, manifest.files.verification, VerificationSchema),
  ]);
  return {
    catalog,
    semanticPolicy,
    pixsoMap,
    compositionRules,
    tokens,
    verification,
  };
}

function validateCommonDocuments(documents: CommonPackDocuments) {
  const indexes = buildCatalogIndexes(
    documents.catalog.components,
    documents.semanticPolicy,
  );
  validateCompositions({
    componentsById: indexes.componentsById,
    compositionRules: documents.compositionRules,
  });
  validateVerification({
    componentsById: indexes.componentsById,
    candidatesByRole: indexes.candidatesByRole,
    semanticPolicy: documents.semanticPolicy,
    verification: documents.verification,
  });
  return indexes;
}

function isSchemaDocument(value: unknown): value is { schema: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    typeof value.schema === "string"
  );
}

function invalidManifest(): never {
  throw new DesignSystemPackError(
    "DESIGN_SYSTEM_PACK_INVALID",
    "Pack manifest has an unsupported schema",
  );
}

async function readAndValidate<
  S extends Parameters<typeof validateWithSchema>[0],
>(
  root: string,
  file: string,
  schema: S,
): Promise<ReturnType<typeof validateWithSchema<S>>> {
  return validateWithSchema(schema, await readSafeJson(root, file));
}

async function readSafeJson(root: string, file: string): Promise<unknown> {
  if (isAbsolute(file)) {
    throw new DesignSystemPackError(
      "DESIGN_SYSTEM_PACK_INVALID",
      "Pack file paths must be relative",
    );
  }
  const candidate = resolve(root, file);
  assertInside(root, candidate);
  const canonical = await realpath(candidate);
  assertInside(root, canonical);

  return JSON.parse(await readFile(canonical, "utf8"));
}

function assertInside(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new DesignSystemPackError(
      "DESIGN_SYSTEM_PACK_INVALID",
      "Pack file path escapes its directory",
    );
  }
}

function validateVerification(input: {
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  candidatesByRole: ReadonlyMap<string, readonly ComponentCatalogEntry[]>;
  semanticPolicy: SemanticPolicy;
  verification: Verification;
}): void {
  const statuses = new Map(
    input.verification.components.map((entry) => [
      entry.componentId,
      entry.status,
    ]),
  );
  if (statuses.size !== input.verification.components.length) {
    throw new DesignSystemPackError(
      "DESIGN_SYSTEM_PACK_INVALID",
      "Component verification contains duplicate component IDs",
    );
  }
  for (const entry of input.verification.components) {
    if (!input.componentsById.has(entry.componentId)) {
      throw new DesignSystemPackError(
        "RULE_REFERENCE_MISSING",
        `Verification references unknown component ${entry.componentId}`,
      );
    }
  }
  for (const [role, policy] of Object.entries(input.semanticPolicy.roles)) {
    if (!policy.allowedDecisions.includes("reuse")) {
      continue;
    }
    for (const candidate of input.candidatesByRole.get(role) ?? []) {
      validateVerifiedClosure(
        candidate,
        input.componentsById,
        statuses,
        new Set(),
      );
    }
  }
}

function validateVerifiedClosure(
  component: ComponentCatalogEntry,
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>,
  statuses: ReadonlyMap<string, "verified" | "unverified">,
  visited: Set<string>,
): void {
  if (visited.has(component.id)) {
    return;
  }
  visited.add(component.id);
  if (!component.verified || statuses.get(component.id) !== "verified") {
    throw new DesignSystemPackError(
      "COMPONENT_EXPORT_UNVERIFIED",
      `Reusable component ${component.id} is not verified`,
    );
  }
  for (const requiredId of component.requiredComponentIds) {
    const required = componentsById.get(requiredId);
    if (required) {
      validateVerifiedClosure(required, componentsById, statuses, visited);
    }
  }
}
