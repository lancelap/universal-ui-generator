import { pathToFileURL } from "node:url";

import {
  createRemotePixsoDslClient,
  PixsoProviderError,
} from "@uig/provider-pixso";

import { createProgram } from "./create-program.js";
import { formatDiagnostic } from "./format-diagnostic.js";

export const cliVersion = "0.1.0";

export async function main(argv = process.argv): Promise<void> {
  const program = createProgram({
    cwd: () => process.cwd(),
    now: () => new Date(),
    createPixsoClient: () => {
      const token = process.env.PIXSO_ACCESS_TOKEN;
      if (!token) {
        throw new PixsoProviderError(
          "PIXSO_TOKEN_MISSING",
          "PIXSO_ACCESS_TOKEN is required for live Pixso commands",
        );
      }
      return createRemotePixsoDslClient({
        endpoint: new URL("https://pixso.net/api/mcp/mcp"),
        token,
      });
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });
  try {
    await program.parseAsync(normalizeCliArgv(argv));
    process.exitCode = program.exitCode ?? 0;
  } catch (error) {
    process.stderr.write(`${formatDiagnostic(error)}\n`);
    process.exitCode = 1;
  }
}

export function normalizeCliArgv(argv: string[]): string[] {
  return argv[2] === "--" ? [...argv.slice(0, 2), ...argv.slice(3)] : [...argv];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}
