import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(repoRoot, "fixtures", "pixso");
const reactFixtureRoot = join(repoRoot, "fixtures", "react-generation");

interface ReactProvenanceFile {
  path: string;
  byteLength: number;
  sha256: string;
}

export async function verifyReactFixtureProvenance(
  root: string,
  files: ReactProvenanceFile[],
): Promise<void> {
  const listedPaths = new Set<string>();
  for (const file of files) {
    if (
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      file.path.includes("\\") ||
      file.path.split("/").some((segment) => segment === "..")
    ) {
      throw new Error("React fixture provenance contains an unsafe path");
    }
    if (listedPaths.has(file.path)) {
      throw new Error(
        `React fixture provenance contains a duplicate path: ${file.path}`,
      );
    }
    listedPaths.add(file.path);
  }

  const actualPaths = await collectFixtureFiles(root);
  const listed = [...listedPaths].sort();
  if (JSON.stringify(listed) !== JSON.stringify(actualPaths)) {
    throw new Error(
      `React fixture provenance does not exactly match fixture files: listed=${JSON.stringify(listed)} actual=${JSON.stringify(actualPaths)}`,
    );
  }

  for (const file of files) {
    const bytes = await readFile(join(root, ...file.path.split("/")));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== file.byteLength || sha256 !== file.sha256) {
      throw new Error(
        `React fixture bytes do not match provenance: ${file.path}`,
      );
    }
  }
}

async function collectFixtureFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const fixturePath = relative(root, path).split(sep).join("/");
        if (fixturePath !== "README.md") {
          files.push(fixturePath);
        }
      }
    }
  };
  await visit(root);
  return files.sort();
}

async function main(): Promise<void> {
  const readme = await readFile(join(fixtureRoot, "README.md"), "utf8");
  const match = readme.match(
    /<!-- fixture-provenance:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- fixture-provenance:end -->/,
  );
  if (!match?.[1]) {
    throw new Error("Fixture README does not contain provenance JSON");
  }

  const provenance = JSON.parse(match[1]);
  if (
    provenance.schema !== "pixso-fixture-provenance/v1" ||
    !Array.isArray(provenance.fixtures)
  ) {
    throw new Error("Fixture provenance has an unsupported schema");
  }

  for (const fixture of provenance.fixtures) {
    const bytes = await readFile(join(fixtureRoot, fixture.path));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== fixture.byteLength || sha256 !== fixture.sha256) {
      throw new Error(`Fixture bytes do not match provenance: ${fixture.path}`);
    }

    const parsed = JSON.parse(bytes.toString("utf8"));
    const dsl = parsed?.dsl;
    const roots = Array.isArray(dsl?.pixTreeDslNodes)
      ? dsl.pixTreeDslNodes.map((node: { guid?: unknown }) => node?.guid)
      : [];
    if (
      dsl?.dslVersion !== fixture.dslVersion ||
      dsl?.converterVersion !== fixture.converterVersion ||
      JSON.stringify(roots) !== JSON.stringify(fixture.exportedRootNodeIds) ||
      !roots.includes(fixture.requestedNodeId)
    ) {
      throw new Error(`Fixture DSL identity does not match: ${fixture.path}`);
    }
  }

  const reactReadme = await readFile(
    join(reactFixtureRoot, "README.md"),
    "utf8",
  );
  const reactMatch = reactReadme.match(
    /<!-- react-generation-provenance:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- react-generation-provenance:end -->/,
  );
  if (!reactMatch?.[1]) {
    throw new Error("React fixture README does not contain provenance JSON");
  }
  const reactProvenance = JSON.parse(reactMatch[1]);
  if (
    reactProvenance.schema !== "react-generation-fixture-provenance/v1" ||
    !Array.isArray(reactProvenance.files)
  ) {
    throw new Error("React fixture provenance has an unsupported schema");
  }

  await verifyReactFixtureProvenance(
    reactFixtureRoot,
    reactProvenance.files as ReactProvenanceFile[],
  );

  console.log(
    `Verified ${provenance.fixtures.length} Pixso fixtures and ${reactProvenance.files.length} React fixture files`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
