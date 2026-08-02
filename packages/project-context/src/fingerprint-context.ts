import { createHash } from "node:crypto";

import type {
  EffectiveCatalogFingerprint,
  InstalledPackagesV1,
  ProjectComponentAnnotationsV1,
  ProjectComponentMappingsV1,
  ProjectComponentPoliciesV1,
  PublicComponentsV1,
  UiContextConfigV1,
} from "@uig/contracts";
import { stableStringify } from "@uig/contracts";

export interface ContextFingerprintInputs {
  config: UiContextConfigV1;
  mappings: ProjectComponentMappingsV1;
  annotations: ProjectComponentAnnotationsV1;
  policies: ProjectComponentPoliciesV1;
  publicComponents: PublicComponentsV1;
  installedPackages: InstalledPackagesV1;
  designSystemPacks: Array<{ id: string; version: string; sha256: string }>;
}

export function fingerprintProjectContext(
  input: ContextFingerprintInputs,
): EffectiveCatalogFingerprint {
  const designSystemPacks = Object.fromEntries(
    [...input.designSystemPacks]
      .sort((a, b) =>
        `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`),
      )
      .map((pack) => [`${pack.id}@${pack.version}`, pack.sha256]),
  );
  const inputs = {
    config: hash(input.config),
    project: hash(input.publicComponents),
    mappings: hash(input.mappings),
    annotations: hash(input.annotations),
    policies: hash(input.policies),
    lockfile: input.installedPackages.lockfile.sha256,
    installedPackages: hash(input.installedPackages.packages),
    designSystemPacks,
  };
  return { algorithm: "sha256", value: hash(inputs), inputs };
}

export function hashContextValue(value: unknown): string {
  return hash(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
