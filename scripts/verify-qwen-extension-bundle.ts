import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  buildQwenAdapterBundle,
  type QwenAdapterProvenance,
} from "./build-qwen-extension.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const bundlePath = join(repoRoot, "dist", "qwen-adapter.mjs");
const provenancePath = join(repoRoot, "dist", "qwen-adapter.provenance.json");

await verifyQwenExtensionBundle();

async function verifyQwenExtensionBundle(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "uig-qwen-bundle-"));
  try {
    const [committedBundle, provenanceBytes, lockfileBytes] = await Promise.all(
      [
        readFile(bundlePath),
        readFile(provenancePath),
        readFile(join(repoRoot, "pnpm-lock.yaml")),
      ],
    );
    const provenance = parseProvenance(provenanceBytes);
    const expected: QwenAdapterProvenance = {
      schema: "uig-qwen-adapter-provenance/v1",
      artifact: "dist/qwen-adapter.mjs",
      sha256: sha256(committedBundle),
      sourceEntry: "extensions/qwen-cli/src/server.ts",
      buildCommand: "pnpm build:qwen-extension",
      lockfile: "pnpm-lock.yaml",
      lockfileSha256: sha256(lockfileBytes),
      node: ">=22",
      bundler: "esbuild@0.28.1",
    };
    if (!isDeepStrictEqual(provenance, expected)) {
      throw new Error("Qwen adapter provenance does not match its inputs");
    }

    const rebuiltPath = join(temporaryRoot, "qwen-adapter.mjs");
    await buildQwenAdapterBundle({
      outfile: rebuiltPath,
      writeProvenance: false,
    });
    const rebuiltBundle = await readFile(rebuiltPath);
    if (!committedBundle.equals(rebuiltBundle)) {
      throw new Error("Qwen adapter bundle is not reproducible");
    }

    assertSafeBundle(committedBundle.toString("utf8"));
    const nodeMajor = Number.parseInt(process.versions.node, 10);
    if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
      throw new Error("Qwen adapter verification requires Node.js >=22");
    }
    process.stdout.write("Qwen adapter bundle verified\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parseProvenance(bytes: Uint8Array): QwenAdapterProvenance {
  const value: unknown = JSON.parse(
    new TextDecoder("utf8", { fatal: true }).decode(bytes),
  );
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Qwen adapter provenance must be an object");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "artifact",
    "buildCommand",
    "bundler",
    "lockfile",
    "lockfileSha256",
    "node",
    "schema",
    "sha256",
    "sourceEntry",
  ];
  if (
    Object.keys(record).sort().join("\n") !== expectedKeys.join("\n") ||
    record.schema !== "uig-qwen-adapter-provenance/v1" ||
    record.artifact !== "dist/qwen-adapter.mjs" ||
    typeof record.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    record.sourceEntry !== "extensions/qwen-cli/src/server.ts" ||
    record.buildCommand !== "pnpm build:qwen-extension" ||
    record.lockfile !== "pnpm-lock.yaml" ||
    typeof record.lockfileSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.lockfileSha256) ||
    record.node !== ">=22" ||
    record.bundler !== "esbuild@0.28.1"
  ) {
    throw new Error("Qwen adapter provenance has an invalid contract");
  }
  return record as unknown as QwenAdapterProvenance;
}

function assertSafeBundle(bundle: string): void {
  const forbidden: Array<[RegExp, string]> = [
    [/\/Users\//, "local macOS user path"],
    [/C:\\Users\\/, "local Windows user path"],
    [/\/\/[#@]\s*sourceMappingURL=/, "source map directive"],
    [/fixtures\//, "fixture path"],
    [/your_access_token/i, "example access token"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
    [/\bPIXSO_ACCESS_TOKEN\s*=/, "access-token assignment"],
  ];
  for (const [pattern, label] of forbidden) {
    if (pattern.test(bundle)) {
      throw new Error(`Qwen adapter bundle contains ${label}`);
    }
  }
  if (!/@license|@preserve|Copyright/i.test(bundle)) {
    throw new Error("Qwen adapter bundle is missing third-party legal notices");
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
