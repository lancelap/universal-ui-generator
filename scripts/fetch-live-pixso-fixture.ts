import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  createRemotePixsoDslClient,
  parsePixsoUrl,
} from "../packages/provider-pixso/src/index.js";

const [url, destination] = process.argv.slice(2);
if (!url || !destination) {
  throw new Error("Usage: fetch-live-pixso-fixture <url> <destination>");
}

const token = process.env.PIXSO_ACCESS_TOKEN;
if (!token) {
  throw new Error("PIXSO_ACCESS_TOKEN is required");
}

const source = parsePixsoUrl(url);
const client = createRemotePixsoDslClient({
  endpoint: new URL("https://pixso.net/api/mcp/mcp"),
  token,
});
const bytes = await client.getNodeDsl({
  fileKey: source.fileKey,
  guid: source.guid,
});
const parsed = JSON.parse(
  new TextDecoder("utf-8", { fatal: true }).decode(bytes),
);

const actualRootNodeId = parsed?.dsl?.pixTreeDslNodes?.[0]?.guid;
if (
  typeof actualRootNodeId !== "string" ||
  actualRootNodeId.length === 0 ||
  typeof parsed?.dsl?.dslVersion !== "string" ||
  typeof parsed?.dsl?.converterVersion !== "string"
) {
  throw new Error(
    `Pixso fixture identity or DSL versions do not match: ${JSON.stringify({
      expectedRootNodeId: source.guid,
      actualRootNodeId,
      dslVersion: parsed?.dsl?.dslVersion,
      converterVersion: parsed?.dsl?.converterVersion,
    })}`,
  );
}

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, bytes);

console.log(
  JSON.stringify({
    path: destination,
    fileKey: source.fileKey,
    requestedNodeId: source.guid,
    actualRootNodeId,
    dslVersion: parsed.dsl.dslVersion,
    converterVersion: parsed.dsl.converterVersion,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }),
);
