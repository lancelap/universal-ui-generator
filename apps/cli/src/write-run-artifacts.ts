import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stableStringify } from "@uig/contracts";

import type { RunLayout } from "./run-layout.js";

export async function writeRunArtifacts(input: {
  layout: RunLayout;
  artifacts: Record<string, unknown>;
}): Promise<void> {
  await mkdir(input.layout.runDir, { recursive: true });
  for (const [file, value] of Object.entries(input.artifacts)) {
    await atomicJson(join(input.layout.runDir, file), value);
  }
}

export async function atomicJson(
  destination: string,
  value: unknown,
): Promise<void> {
  const temporary = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temporary, stableStringify(value), "utf8");
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
