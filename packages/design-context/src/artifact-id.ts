import { createHash } from "node:crypto";

export const ARTIFACT_ID_PATTERN =
  /^pixso_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+_[a-f0-9]{12}$/;

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createArtifactId(input: {
  provider: "pixso";
  documentId: string;
  nodeId: string;
  sha256: string;
}): string {
  const documentId = sanitizeIdPart(input.documentId);
  const nodeId = sanitizeIdPart(input.nodeId);

  return `${input.provider}_${documentId}_${nodeId}_${input.sha256.slice(0, 12)}`;
}

export function isArtifactId(value: string): boolean {
  return ARTIFACT_ID_PATTERN.test(value);
}

function sanitizeIdPart(value: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (sanitized.length === 0) {
    throw new ArtifactIdInputError(value);
  }

  return sanitized;
}

export class ArtifactIdInputError extends Error {
  readonly name = "ArtifactIdInputError";
  readonly code = "ARTIFACT_ID_INPUT_INVALID";

  constructor(value: string) {
    super(`Artifact ID input cannot be sanitized: ${JSON.stringify(value)}`);
  }
}
