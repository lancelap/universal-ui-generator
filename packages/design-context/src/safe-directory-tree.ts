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
