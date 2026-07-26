import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import { stableStringify, type ReactGenerationBundleV2 } from "@uig/contracts";
import {
  assertReactGenerationBundleIntegrity,
  ReactGenerationError,
} from "@uig/generator-react";

const encoder = new TextEncoder();

export async function writeGeneratedBundleAtomically(input: {
  destination: string;
  bundle: ReactGenerationBundleV2;
  /** @internal Deterministic concurrency coordination for filesystem tests. */
  testHooks?: {
    afterReservationAcquired?: () => Promise<void>;
  };
}): Promise<"written" | "identical"> {
  assertReactGenerationBundleIntegrity(input.bundle);
  const parent = dirname(input.destination);
  const temporary = join(
    parent,
    `${basename(input.destination)}.tmp-${randomUUID()}`,
  );
  const reservation = join(parent, `${basename(input.destination)}.lock`);
  await mkdir(temporary);
  let installed = false;
  let reservationHeld = false;
  try {
    await writeBundleMap(temporary, input.bundle);
    await acquireReservation(reservation);
    reservationHeld = true;
    await input.testHooks?.afterReservationAcquired?.();
    if (await exists(input.destination)) {
      return await compareOrConflict(temporary, input.destination);
    }
    await rename(temporary, input.destination);
    installed = true;
    return "written";
  } finally {
    await Promise.all([
      reservationHeld ? rmdir(reservation) : Promise.resolve(),
      !installed
        ? rm(temporary, { recursive: true, force: true })
        : Promise.resolve(),
    ]);
  }
}

async function acquireReservation(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    try {
      await mkdir(path);
      return;
    } catch (error) {
      if (!hasCode(error, "EEXIST")) {
        throw error;
      }
      if (Date.now() >= deadline) {
        conflict(`Timed out waiting for generated output reservation: ${path}`);
      }
      await waitForRetry();
    }
  }
}

async function waitForRetry(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 5);
  });
}

async function writeBundleMap(
  root: string,
  bundle: ReactGenerationBundleV2,
): Promise<void> {
  const seen = new Set<string>();
  for (const file of bundle.files) {
    const path = safeGeneratedPath(file.path);
    if (path === "generation-report.json" || seen.has(path)) {
      conflict(`Duplicate or reserved generated path ${JSON.stringify(path)}`);
    }
    seen.add(path);
    const destination = join(root, ...path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes, { flag: "wx" });
  }
  await writeFile(
    join(root, "generation-report.json"),
    encoder.encode(stableStringify(bundle.report)),
    { flag: "wx" },
  );
}

function safeGeneratedPath(path: string): string {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "..")
  ) {
    conflict(`Unsafe generated path ${JSON.stringify(path)}`);
  }
  return path;
}

async function compareOrConflict(
  expectedRoot: string,
  destination: string,
): Promise<"identical"> {
  const [expected, actual] = await Promise.all([
    readByteMap(expectedRoot),
    readByteMap(destination),
  ]);
  if (!sameByteMap(expected, actual)) {
    conflict(`Generated output already differs at ${destination}`);
  }
  return "identical";
}

async function readByteMap(root: string): Promise<Map<string, Buffer>> {
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    conflict(`Generated output path is not an ordinary directory: ${root}`);
  }
  const files = new Map<string, Buffer>();
  await visitDirectory(root, root, files);
  return files;
}

async function visitDirectory(
  root: string,
  directory: string,
  files: Map<string, Buffer>,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      conflict(`Generated output contains a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) {
      await visitDirectory(root, path, files);
      continue;
    }
    if (!entry.isFile()) {
      conflict(`Generated output contains a non-file entry: ${path}`);
    }
    files.set(relative(root, path).split(sep).join("/"), await readFile(path));
  }
}

function sameByteMap(
  left: ReadonlyMap<string, Buffer>,
  right: ReadonlyMap<string, Buffer>,
): boolean {
  return (
    left.size === right.size &&
    [...left].every(
      ([path, bytes]) => right.has(path) && bytes.equals(right.get(path)!),
    )
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function conflict(message: string): never {
  throw new ReactGenerationError("GENERATION_OUTPUT_CONFLICT", message);
}
