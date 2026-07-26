import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stableStringify } from "@uig/contracts";

import {
  createArtifactId,
  isArtifactId,
  sha256 as computeSha256,
} from "./artifact-id.js";

export interface StoredArtifact {
  artifactId: string;
  sha256: string;
  byteLength: number;
}

export interface StoredSourceArtifact extends StoredArtifact {
  provider: "pixso";
  documentId: string;
  nodeId: string;
}

export interface ArtifactStore {
  put(input: {
    provider: "pixso";
    documentId: string;
    nodeId: string;
    bytes: Uint8Array;
  }): Promise<StoredArtifact>;
  read(artifactId: string): Promise<Uint8Array>;
  describe(artifactId: string): Promise<StoredSourceArtifact>;
}

type ArtifactMetadata = StoredSourceArtifact;

export type ArtifactStoreErrorCode =
  "ARTIFACT_ID_INVALID" | "ARTIFACT_METADATA_INVALID";

export class ArtifactStoreError extends Error {
  readonly name = "ArtifactStoreError";

  constructor(
    readonly code: ArtifactStoreErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function createArtifactStore(rootDir: string): ArtifactStore {
  const contentDir = join(rootDir, "cache", "sha256");
  const metadataDir = join(rootDir, "artifacts");

  return {
    async put(input): Promise<StoredArtifact> {
      const contentHash = computeSha256(input.bytes);
      const artifactId = createArtifactId({
        provider: input.provider,
        documentId: input.documentId,
        nodeId: input.nodeId,
        sha256: contentHash,
      });
      const stored: StoredArtifact = {
        artifactId,
        sha256: contentHash,
        byteLength: input.bytes.byteLength,
      };
      const metadata: ArtifactMetadata = {
        ...stored,
        provider: input.provider,
        documentId: input.documentId,
        nodeId: input.nodeId,
      };

      await Promise.all([
        mkdir(contentDir, { recursive: true }),
        mkdir(metadataDir, { recursive: true }),
      ]);
      await writeAtomically(
        join(contentDir, contentHash),
        input.bytes,
        contentDir,
      );
      await writeAtomically(
        join(metadataDir, `${artifactId}.json`),
        new TextEncoder().encode(stableStringify(metadata)),
        metadataDir,
      );

      return stored;
    },

    async read(artifactId): Promise<Uint8Array> {
      const metadata = await readMetadata(artifactId);
      const bytes = await readFile(join(contentDir, metadata.sha256));
      return new Uint8Array(bytes);
    },

    describe: readMetadata,
  };

  async function readMetadata(
    artifactId: string,
  ): Promise<StoredSourceArtifact> {
    assertArtifactId(artifactId);
    const metadataPath = join(metadataDir, `${artifactId}.json`);
    const metadata = parseMetadata(await readFile(metadataPath, "utf8"));
    if (metadata.artifactId !== artifactId) {
      throw new ArtifactStoreError(
        "ARTIFACT_METADATA_INVALID",
        `Artifact metadata ID does not match ${artifactId}`,
      );
    }
    return metadata;
  }
}

function assertArtifactId(artifactId: string): void {
  if (!isArtifactId(artifactId)) {
    throw new ArtifactStoreError(
      "ARTIFACT_ID_INVALID",
      `Invalid artifact ID: ${artifactId}`,
    );
  }
}

function parseMetadata(text: string): ArtifactMetadata {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ArtifactStoreError(
      "ARTIFACT_METADATA_INVALID",
      "Artifact metadata is not valid JSON",
    );
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("artifactId" in value) ||
    !("sha256" in value) ||
    !("byteLength" in value) ||
    !("provider" in value) ||
    !("documentId" in value) ||
    !("nodeId" in value) ||
    typeof value.artifactId !== "string" ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.byteLength !== "number" ||
    value.provider !== "pixso" ||
    typeof value.documentId !== "string" ||
    typeof value.nodeId !== "string"
  ) {
    throw new ArtifactStoreError(
      "ARTIFACT_METADATA_INVALID",
      "Artifact metadata has an invalid shape",
    );
  }

  return value as ArtifactMetadata;
}

async function writeAtomically(
  destination: string,
  bytes: Uint8Array,
  parentDir: string,
): Promise<void> {
  const temporaryPath = join(parentDir, `.tmp-${randomUUID()}`);
  await writeFile(temporaryPath, bytes, { flag: "wx" });

  try {
    await rename(temporaryPath, destination);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
