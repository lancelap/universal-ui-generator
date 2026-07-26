import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesignSystemPackV2 } from "../packages/component-catalog/src/index.js";
import { resolveUiManifestV2 } from "../packages/component-resolver/src/index.js";
import {
  type DesignIRV2,
  type ReactGenerationBundleV2,
  type UiManifestV2,
  DesignIRV2Schema,
  UiManifestV2Schema,
  stableStringify,
  validateWithSchema,
} from "../packages/contracts/src/index.js";
import { sha256 } from "../packages/design-context/src/index.js";
import { normalizePixsoDesignV2 } from "../packages/design-normalizer/src/index.js";
import { generateReactBundle } from "../packages/generator-react/src/index.js";
import { buildUiManifestV2 } from "../packages/semantic-planner/src/index.js";

const repoRoot = resolve(import.meta.dirname, "..");
const fixturesRoot = join(repoRoot, "fixtures");
const decoder = new TextDecoder();

export interface CandidateSummary {
  componentName: string;
  importPackages: string[];
  externalPropNames: string[];
  renderOnlyPropNames: string[];
  diagnosticCodes: string[];
  cssRuleCount: number;
  fileHashes: Record<string, string>;
  candidateDirectory: string;
}

export async function generateReactAcceptanceCandidates(
  input: {
    destination?: string;
  } = {},
): Promise<CandidateSummary[]> {
  const destination = input.destination
    ? resolve(input.destination)
    : await mkdtemp(join(tmpdir(), "uig-react-acceptance-"));
  await assertOutsideFixtures(destination);
  await mkdir(destination, { recursive: true });

  const neutralDir = join(repoRoot, "fixtures", "react-generation", "modal");
  const [designIr, uiManifest] = await Promise.all([
    readContract<DesignIRV2>(
      join(neutralDir, "source.design-ir.json"),
      DesignIRV2Schema,
    ),
    readContract<UiManifestV2>(
      join(neutralDir, "source.ui-manifest.json"),
      UiManifestV2Schema,
    ),
  ]);
  const summaries: CandidateSummary[] = [];

  for (const packId of ["sber-space-ui", "material-ui"]) {
    const pack = await loadDesignSystemPackV2(
      join(repoRoot, "design-system-packs", packId),
    );
    const resolutionPlan = resolveUiManifestV2({
      manifest: uiManifest,
      designIr,
      pack,
    });
    const bundle = generateReactBundle({
      sourceRunId: "run_acceptance_neutral_modal",
      designIr,
      uiManifest,
      resolutionPlan,
      pack,
    });
    const candidateDirectory = join(destination, "modal", packId);
    await mkdir(candidateDirectory, { recursive: true });
    await writeFile(
      join(candidateDirectory, "resolution-plan.json"),
      stableStringify(resolutionPlan),
      "utf8",
    );
    await writeBundle(join(candidateDirectory, "generated"), bundle);
    summaries.push(summarize(bundle, candidateDirectory));
  }

  const rawDsl = JSON.parse(
    await readFile(
      join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
      "utf8",
    ),
  );
  const sber = await loadDesignSystemPackV2(
    join(repoRoot, "design-system-packs", "sber-space-ui"),
  );
  const realDesignIr = normalizePixsoDesignV2({
    artifactId: "pixso_WSLukjrKancvZG0zbaMnyA_4_314_0d6c50995105",
    rootNodeId: "4:314",
    rawDsl,
  });
  const realManifest = buildUiManifestV2({
    ir: realDesignIr,
    exactMappings: [...sber.exactPixsoMappings],
  });
  const realPlan = resolveUiManifestV2({
    manifest: realManifest,
    designIr: realDesignIr,
    pack: sber,
  });
  const realBundle = generateReactBundle({
    sourceRunId: "run_acceptance_pixso_4_314",
    designIr: realDesignIr,
    uiManifest: realManifest,
    resolutionPlan: realPlan,
    pack: sber,
  });
  const realCandidateDirectory = join(
    destination,
    "pixso-4-314",
    "sber-space-ui",
  );
  await writeBundle(join(realCandidateDirectory, "generated"), realBundle);
  summaries.push(summarize(realBundle, realCandidateDirectory));

  return summaries;
}

async function assertOutsideFixtures(destination: string): Promise<void> {
  if (isInside(destination, fixturesRoot)) {
    throw new Error("Candidate destination must be outside fixtures");
  }
  const existingParent = await nearestExistingDirectory(destination);
  const canonicalParent = await realpath(existingParent);
  const projected = join(
    canonicalParent,
    relative(existingParent, destination),
  );
  if (isInside(projected, await realpath(fixturesRoot))) {
    throw new Error("Candidate destination must be outside fixtures");
  }
}

function isInside(candidate: string, parent: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

async function nearestExistingDirectory(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      await realpath(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new Error(`No existing parent for candidate destination ${path}`);
      }
      current = parent;
    }
  }
}

async function writeBundle(
  directory: string,
  bundle: ReactGenerationBundleV2,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const file of bundle.files) {
    const destination = join(directory, ...file.path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes);
  }
  await writeFile(
    join(directory, "generation-report.json"),
    stableStringify(bundle.report),
    "utf8",
  );
}

function summarize(
  bundle: ReactGenerationBundleV2,
  candidateDirectory: string,
): CandidateSummary {
  const tsx = bundle.files
    .filter((file) => file.kind === "tsx" || file.kind === "fallback-tsx")
    .map((file) => decoder.decode(file.bytes))
    .join("\n");
  const reportBytes = new TextEncoder().encode(stableStringify(bundle.report));
  return {
    componentName: bundle.report.componentName ?? "(blocked)",
    importPackages: [
      ...new Set(
        [...tsx.matchAll(/from "([^"]+)";/g)]
          .map((match) => match[1]!)
          .filter((value) => !value.startsWith(".")),
      ),
    ].sort(),
    externalPropNames: [
      ...new Set(
        [...tsx.matchAll(/^\s+(on[A-Za-z0-9]+)\?:/gm)].map(
          (match) => match[1]!,
        ),
      ),
    ].sort(),
    renderOnlyPropNames: [
      ...new Set(
        bundle.report.renderOnlyProps.flatMap((entry) => entry.propNames),
      ),
    ].sort(),
    diagnosticCodes: [
      ...new Set(
        bundle.report.diagnostics.map((diagnostic) => diagnostic.code),
      ),
    ].sort(),
    cssRuleCount: bundle.report.statistics.cssRules,
    fileHashes: Object.fromEntries(
      [
        ...bundle.files.map((file) => [file.path, file.sha256] as const),
        ["generation-report.json", sha256(reportBytes)] as const,
      ].sort(([left], [right]) => left.localeCompare(right)),
    ),
    candidateDirectory,
  };
}

async function readContract<T>(
  path: string,
  schema: Parameters<typeof validateWithSchema>[0],
): Promise<T> {
  return validateWithSchema(
    schema,
    JSON.parse(await readFile(path, "utf8")),
  ) as T;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const destinationFlag = process.argv.indexOf("--output");
  const destination =
    destinationFlag >= 0 ? process.argv[destinationFlag + 1] : undefined;
  const summaries = await generateReactAcceptanceCandidates({
    ...(destination ? { destination } : {}),
  });
  process.stdout.write(`${stableStringify(summaries)}`);
}
