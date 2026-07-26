import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  ComponentCatalogSchema,
  type ComponentCatalogEntry,
  CompositionRulesSchema,
  type CompositionRules,
  DesignSystemPackSchema,
  type DesignSystemPack,
  DesignTokensSchema,
  type DesignTokens,
  PixsoMapSchema,
  type PixsoSemanticMapping,
  SemanticPolicySchema,
  type SemanticPolicy,
  validateWithSchema,
  VerificationSchema,
  type Verification,
} from "@uig/contracts";

import { buildCatalogIndexes } from "./catalog-index.js";
import { DesignSystemPackError } from "./errors.js";
import { validateCompositions } from "./validate-compositions.js";

export interface LoadedDesignSystemPack {
  manifest: DesignSystemPack;
  componentsById: ReadonlyMap<string, ComponentCatalogEntry>;
  candidatesByRole: ReadonlyMap<string, readonly ComponentCatalogEntry[]>;
  semanticPolicy: SemanticPolicy;
  exactPixsoMappings: readonly PixsoSemanticMapping[];
  compositionRules: CompositionRules;
  tokens: DesignTokens;
  verification: Verification;
}

export async function loadDesignSystemPack(
  packDirectory: string,
): Promise<LoadedDesignSystemPack> {
  try {
    const root = await realpath(packDirectory);
    const manifest = validateWithSchema(
      DesignSystemPackSchema,
      await readSafeJson(root, "pack.json"),
    );
    const [
      catalog,
      semanticPolicy,
      pixsoMap,
      compositionRules,
      tokens,
      verification,
    ] = await Promise.all([
      readAndValidate(root, manifest.files.catalog, ComponentCatalogSchema),
      readAndValidate(
        root,
        manifest.files.semanticPolicy,
        SemanticPolicySchema,
      ),
      readAndValidate(root, manifest.files.pixsoMap, PixsoMapSchema),
      readAndValidate(
        root,
        manifest.files.compositionRules,
        CompositionRulesSchema,
      ),
      readAndValidate(root, manifest.files.tokens, DesignTokensSchema),
      readAndValidate(root, manifest.files.verification, VerificationSchema),
    ]);

    const indexes = buildCatalogIndexes(catalog.components, semanticPolicy);
    validateCompositions({
      componentsById: indexes.componentsById,
      compositionRules,
    });
    validateVerification({
      componentsById: indexes.componentsById,
      candidatesByRole: indexes.candidatesByRole,
      semanticPolicy,
      verification,
    });

    return {
      manifest,
      ...indexes,
      semanticPolicy,
      exactPixsoMappings: pixsoMap.mappings,
      compositionRules,
      tokens,
      verification,
    };
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
