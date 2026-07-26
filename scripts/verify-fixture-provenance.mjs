import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(repoRoot, "fixtures", "pixso");
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
    ? dsl.pixTreeDslNodes.map((node) => node?.guid)
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

console.log(`Verified ${provenance.fixtures.length} Pixso fixtures`);
