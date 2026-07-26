import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  rmdir,
  rm,
  symlink,
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
    beforePublish?: () => Promise<void>;
  };
}): Promise<"written" | "identical"> {
  assertReactGenerationBundleIntegrity(input.bundle);
  const parent = dirname(input.destination);
  const contentName = `${basename(input.destination)}.content-${randomUUID()}`;
  const content = join(parent, contentName);
  const reservation = join(parent, `${basename(input.destination)}.lock`);
  await mkdir(content);
  let installed = false;
  let reservationHeld = false;
  try {
    await writeBundleMap(content, input.bundle);
    await acquireReservation(reservation);
    reservationHeld = true;
    await input.testHooks?.afterReservationAcquired?.();
    await input.testHooks?.beforePublish?.();
    try {
      await symlink(contentName, input.destination, "dir");
    } catch (error) {
      if (!hasCode(error, "EEXIST")) {
        throw error;
      }
      return await compareOrConflict(content, input.destination);
    }
    installed = true;
    return "written";
  } finally {
    await Promise.all([
      reservationHeld ? rmdir(reservation) : Promise.resolve(),
      !installed
        ? rm(content, { recursive: true, force: true })
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
  const installedRoot = await resolveInstalledRoot(destination);
  const [expected, actual] = await Promise.all([
    readByteMap(expectedRoot),
    readByteMap(installedRoot),
  ]);
  if (!sameByteMap(expected, actual)) {
    conflict(`Generated output already differs at ${destination}`);
  }
  return "identical";
}

async function resolveInstalledRoot(destination: string): Promise<string> {
  const metadata = await lstat(destination);
  if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
    return destination;
  }
  if (!metadata.isSymbolicLink()) {
    conflict(`Generated output path is not a directory link: ${destination}`);
  }
  const target = await readlink(destination);
  const expectedPrefix = `${basename(destination)}.content-`;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (
    !target.startsWith(expectedPrefix) ||
    !uuidPattern.test(target.slice(expectedPrefix.length)) ||
    basename(target) !== target
  ) {
    conflict(`Generated output link has an unsafe target: ${destination}`);
  }
  const content = join(dirname(destination), target);
  const contentMetadata = await lstat(content);
  if (!contentMetadata.isDirectory() || contentMetadata.isSymbolicLink()) {
    conflict(`Generated output link target is not an ordinary directory`);
  }
  return content;
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
