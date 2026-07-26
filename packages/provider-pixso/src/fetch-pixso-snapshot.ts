import type { DesignSnapshot } from "@uig/contracts";
import type { ArtifactStore } from "@uig/design-context";

import { type PixsoDslClient, PixsoProviderError } from "./pixso-dsl-client.js";
import { parsePixsoUrl } from "./parse-pixso-url.js";

export async function fetchPixsoSnapshot(input: {
  url: string;
  client: PixsoDslClient;
  store: ArtifactStore;
  now: () => Date;
}): Promise<DesignSnapshot> {
  const source = parsePixsoUrl(input.url);
  const bytes = await input.client.getNodeDsl({
    fileKey: source.fileKey,
    guid: source.guid,
  });
  const dslVersion = readDslVersion(bytes);
  const stored = await input.store.put({
    provider: "pixso",
    documentId: source.fileKey,
    nodeId: source.guid,
    bytes,
  });

  return {
    schema: "design-snapshot/v1",
    artifactId: stored.artifactId,
    provider: "pixso",
    source: {
      documentId: source.fileKey,
      nodeId: source.guid,
      url: source.canonicalUrl,
    },
    retrievedAt: input.now().toISOString(),
    content: {
      format: "pixso-node-dsl",
      version: dslVersion,
      sha256: stored.sha256,
      byteLength: stored.byteLength,
    },
  };
}

function readDslVersion(bytes: Uint8Array): string {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new PixsoProviderError(
      "PIXSO_RESPONSE_INVALID",
      "Pixso response is not valid UTF-8 JSON",
      { cause: error },
    );
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("dsl" in value) ||
    typeof value.dsl !== "object" ||
    value.dsl === null ||
    !("dslVersion" in value.dsl) ||
    typeof value.dsl.dslVersion !== "string" ||
    value.dsl.dslVersion.length === 0
  ) {
    throw new PixsoProviderError(
      "PIXSO_RESPONSE_INVALID",
      "Pixso response does not contain dsl.dslVersion",
    );
  }

  return value.dsl.dslVersion;
}
