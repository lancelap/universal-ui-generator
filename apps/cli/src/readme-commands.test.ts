import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("README commands", () => {
  it("runs every tested help or offline command", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    const commands = [
      ...readme.matchAll(/<!-- tested -->\s*```bash\s*([\s\S]*?)\s*```/g),
    ].map((match) => match[1]!.trim());

    expect(commands.length).toBeGreaterThan(0);
    const scratchDir = await mkdtemp(join(tmpdir(), "uig-readme-"));
    for (const command of commands) {
      expect(command).toMatch(
        /^pnpm (uig -- (--help|pack validate )|verify:fixtures)/,
      );
      const result = await execFileAsync("/bin/zsh", ["-lc", command], {
        cwd: repoRoot,
        env: {
          ...process.env,
          UIG_README_TEST_SCRATCH: scratchDir,
        },
      });
      expect(result.stderr).toBe("");
    }
  });
});
