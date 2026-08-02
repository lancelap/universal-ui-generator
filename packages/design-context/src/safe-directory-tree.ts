import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export async function ensureContainedDirectoryTree(
  baseDirectory: string,
  relativeDirectories: readonly string[],
): Promise<void> {
  const canonicalBase = await realpath(baseDirectory);
  const baseMetadata = await lstat(baseDirectory);
  if (!baseMetadata.isDirectory() || baseMetadata.isSymbolicLink()) {
    throw new Error("Storage base must be an ordinary directory");
  }

  for (const relativeDirectory of relativeDirectories) {
    if (
      relativeDirectory.length === 0 ||
      isAbsolute(relativeDirectory) ||
      relativeDirectory === ".." ||
      relativeDirectory.startsWith(`..${sep}`)
    ) {
      throw new Error("Unsafe storage directory");
    }
    const directory = resolve(baseDirectory, relativeDirectory);
    const relativePath = relative(baseDirectory, directory);
    if (
      relativePath.length === 0 ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error("Storage directory escapes its base");
    }

    await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Storage path must be an ordinary directory");
    }
    const canonicalDirectory = await realpath(directory);
    if (
      canonicalDirectory !== canonicalBase &&
      !canonicalDirectory.startsWith(`${canonicalBase}${sep}`)
    ) {
      throw new Error("Storage directory resolves outside its base");
    }
  }
}

export async function assertContainedOrdinaryPath(input: {
  baseDirectory: string;
  relativePath: string;
  expected: "file" | "directory";
  allowMissingLeaf?: boolean;
}): Promise<string> {
  if (
    input.relativePath.length === 0 ||
    isAbsolute(input.relativePath) ||
    input.relativePath.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Unsafe contained path");
  }
  const canonicalBase = await realpath(input.baseDirectory);
  const target = resolve(input.baseDirectory, input.relativePath);
  const rel = relative(input.baseDirectory, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Contained path escapes its base");
  }
  const parts = input.relativePath.split(/[\\/]/).filter(Boolean);
  let current = input.baseDirectory;
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index]!);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw new Error("Contained path must not contain symbolic links");
      }
      if (index === parts.length - 1) {
        const valid =
          input.expected === "file"
            ? metadata.isFile()
            : metadata.isDirectory();
        if (!valid) throw new Error("Contained path is not ordinary");
      } else if (!metadata.isDirectory()) {
        throw new Error("Contained path parent must be an ordinary directory");
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        code === "ENOENT" &&
        input.allowMissingLeaf &&
        index === parts.length - 1
      ) {
        return target;
      }
      throw error;
    }
  }
  const canonicalTarget = await realpath(target);
  if (
    canonicalTarget !== canonicalBase &&
    !canonicalTarget.startsWith(`${canonicalBase}${sep}`)
  ) {
    throw new Error("Contained path resolves outside its base");
  }
  return target;
}
