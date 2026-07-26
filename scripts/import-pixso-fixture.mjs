import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [
  source,
  destination,
  expectedFileKey,
  expectedNodeId,
  allowedPrefix = "",
] = process.argv.slice(2);

if (!source || !destination || !expectedFileKey || !expectedNodeId) {
  throw new Error(
    "Usage: import-pixso-fixture <source> <destination> <file-key> <node-id> [allowed-prefix]",
  );
}

const original = await readFile(source);
const objectOffset = original.indexOf(0x7b);
if (objectOffset < 0) {
  throw new Error("Pixso fixture source does not contain a JSON object");
}
const prefix = original.subarray(0, objectOffset).toString("utf8");
if (prefix.trim() !== "" && prefix !== allowedPrefix) {
  throw new Error(
    `Unexpected non-whitespace Pixso fixture prefix: ${JSON.stringify(prefix)}`,
  );
}

const sanitized = original.subarray(objectOffset);
const parsed = JSON.parse(sanitized.toString("utf8"));
if (
  parsed?.dsl?.dslVersion !== "2.1.15" ||
  parsed?.dsl?.converterVersion !== "2.2.13" ||
  parsed?.dsl?.pixTreeDslNodes?.[0]?.guid !== expectedNodeId
) {
  throw new Error("Pixso fixture identity or DSL versions do not match");
}

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, sanitized);

console.log(
  JSON.stringify({
    fileKey: expectedFileKey,
    nodeId: expectedNodeId,
    strippedPrefix: prefix,
    originalByteLength: original.byteLength,
    originalSha256: sha256(original),
    sanitizedByteLength: sanitized.byteLength,
    sanitizedSha256: sha256(sanitized),
  }),
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
