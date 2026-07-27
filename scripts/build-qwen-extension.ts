import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

import { stableStringify } from "../packages/contracts/src/index.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceEntry = "extensions/qwen-cli/src/server.ts";

export interface QwenAdapterProvenance {
  schema: "uig-qwen-adapter-provenance/v1";
  artifact: "dist/qwen-adapter.mjs";
  sha256: string;
  sourceEntry: "extensions/qwen-cli/src/server.ts";
  buildCommand: "pnpm build:qwen-extension";
  lockfile: "pnpm-lock.yaml";
  lockfileSha256: string;
  node: ">=22";
  bundler: "esbuild@0.28.1";
}

export async function buildQwenAdapterBundle(input: {
  outfile: string;
  writeProvenance?: boolean;
}): Promise<QwenAdapterProvenance> {
  await mkdir(dirname(input.outfile), { recursive: true });
  await build({
    absWorkingDir: repoRoot,
    entryPoints: [sourceEntry],
    outfile: input.outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "bundle",
    sourcemap: false,
    legalComments: "eof",
    charset: "utf8",
    minify: false,
    treeShaking: true,
    banner: {
      js: [
        'import { createRequire as __uigCreateRequire } from "node:module";',
        'import { dirname as __uigDirname } from "node:path";',
        'import { fileURLToPath as __uigFileURLToPath } from "node:url";',
        "const require = __uigCreateRequire(import.meta.url);",
        "const __filename = __uigFileURLToPath(import.meta.url);",
        "const __dirname = __uigDirname(__filename);",
      ].join("\n"),
    },
  });

  const emittedBundle = await readFile(input.outfile, "utf8");
  const normalizedBundle = emittedBundle.replace(/[ \t]+$/gm, "");
  if (normalizedBundle !== emittedBundle) {
    await writeFile(input.outfile, normalizedBundle, "utf8");
  }

  const [bundleBytes, lockfileBytes] = await Promise.all([
    readFile(input.outfile),
    readFile(join(repoRoot, "pnpm-lock.yaml")),
  ]);
  const provenance: QwenAdapterProvenance = {
    schema: "uig-qwen-adapter-provenance/v1",
    artifact: "dist/qwen-adapter.mjs",
    sha256: sha256(bundleBytes),
    sourceEntry,
    buildCommand: "pnpm build:qwen-extension",
    lockfile: "pnpm-lock.yaml",
    lockfileSha256: sha256(lockfileBytes),
    node: ">=22",
    bundler: "esbuild@0.28.1",
  };

  if (input.writeProvenance !== false) {
    const relativeOutput = relative(repoRoot, input.outfile).replaceAll(
      "\\",
      "/",
    );
    if (relativeOutput !== provenance.artifact) {
      throw new Error(
        `Committed Qwen adapter must be written to ${provenance.artifact}`,
      );
    }
    await writeFile(
      join(repoRoot, "dist", "qwen-adapter.provenance.json"),
      stableStringify(provenance),
      "utf8",
    );
  }
  return provenance;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await buildQwenAdapterBundle({
    outfile: join(repoRoot, "dist", "qwen-adapter.mjs"),
  });
}
