import minimalPixsoDsl from "../../../packages/design-normalizer/src/__fixtures__/minimal-pixso-dsl.json";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PixsoProviderError } from "@uig/provider-pixso";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "./create-program.js";
import { formatDiagnostic } from "./format-diagnostic.js";

const packsRoot = fileURLToPath(
  new URL("../../../design-system-packs", import.meta.url),
);
const url = "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314";

describe("uig CLI", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("fetches, normalizes, inspects, and plans from a snapshot without refetching", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "uig-cli-"));
    roots.push(workspace);
    const createClient = vi.fn(() => ({
      getNodeDsl: async () =>
        new TextEncoder().encode(JSON.stringify(minimalPixsoDsl)),
    }));
    const fetched = output();
    await createProgram({
      cwd: () => workspace,
      now: fixedNow,
      createPixsoClient: createClient,
      stdout: fetched.stream,
      stderr: output().stream,
    }).parseAsync(["fetch", url], { from: "user" });
    const artifactId = fetched.text.trim();
    expect(artifactId).toMatch(/^pixso_/);
    expect(createClient).toHaveBeenCalledOnce();

    const normalized = output();
    await createProgram({
      cwd: () => workspace,
      now: fixedNow,
      createPixsoClient: () => {
        throw new Error("Pixso must not be contacted");
      },
      stdout: normalized.stream,
      stderr: output().stream,
    }).parseAsync(["normalize", artifactId], { from: "user" });
    expect(normalized.text).toBe(".uig/design-ir.json\n");
    expect(
      JSON.parse(
        await readFile(join(workspace, ".uig", "design-ir.json"), "utf8"),
      ).schema,
    ).toBe("design-ir/v1");

    const inspected = output();
    await createProgram({
      cwd: () => workspace,
      now: fixedNow,
      createPixsoClient: () => {
        throw new Error("Pixso must not be contacted");
      },
      stdout: inspected.stream,
      stderr: output().stream,
    }).parseAsync(
      [
        "inspect",
        "--artifact",
        artifactId,
        "--node",
        "4:314",
        "--include",
        "geometry,appearance",
      ],
      { from: "user" },
    );
    expect(JSON.parse(inspected.text)).toMatchObject({
      id: "4:314",
      geometry: { width: 600, height: 400 },
      appearance: expect.any(Object),
    });

    const planned = output();
    const planProgram = createProgram({
      cwd: () => workspace,
      now: fixedNow,
      createPixsoClient: () => {
        throw new Error("Pixso must not be contacted");
      },
      stdout: planned.stream,
      stderr: output().stream,
    });
    await planProgram.parseAsync(
      ["plan", "--snapshot", artifactId, "--design-system", "material-ui"],
      { from: "user" },
    );
    expect(planned.text).toMatch(
      /^\.uig\/runs\/run_20260726T103000000Z_4-314\n$/,
    );
    expect(planProgram.exitCode).toBe(2);
  });

  it("rejects both or neither plan source", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "uig-cli-"));
    roots.push(workspace);
    const make = () =>
      createProgram({
        cwd: () => workspace,
        now: fixedNow,
        createPixsoClient: vi.fn(),
        stdout: output().stream,
        stderr: output().stream,
      });

    await expect(
      make().parseAsync(["plan", "--design-system", "material-ui"], {
        from: "user",
      }),
    ).rejects.toThrow(/Exactly one/);
    await expect(
      make().parseAsync(
        [
          "plan",
          "--url",
          url,
          "--snapshot",
          "artifact",
          "--design-system",
          "material-ui",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow(/Exactly one/);
  });

  it.each([
    {
      result: {
        outputPath: ".uig/runs/run_fixture/generated",
        status: "generated" as const,
        writeStatus: "written" as const,
      },
      exitCode: 0,
    },
    {
      result: {
        outputPath: ".uig/runs/run_fixture/generated",
        status: "generated" as const,
        writeStatus: "identical" as const,
      },
      exitCode: 0,
    },
    {
      result: {
        outputPath: ".uig/runs/run_fixture/generated",
        status: "blocked" as const,
        writeStatus: "written" as const,
      },
      exitCode: 2,
    },
  ])(
    "prints one structured generate line and exits $exitCode for $result.status/$result.writeStatus",
    async ({ result, exitCode }) => {
      const written = output();
      const createClient = vi.fn(() => {
        throw new Error("generate must not construct a Pixso client");
      });
      const program = createProgram({
        cwd: () => "/workspace",
        now: fixedNow,
        createPixsoClient: createClient,
        generateFromRun: async () => result,
        stdout: written.stream,
        stderr: output().stream,
      });

      await program.parseAsync(["generate", "--run", "run_fixture"], {
        from: "user",
      });

      expect(written.text).toBe(
        `${JSON.stringify({
          outputPath: result.outputPath,
          runId: "run_fixture",
          status: result.status,
          writeStatus: result.writeStatus,
        })}\n`,
      );
      expect(program.exitCode).toBe(exitCode);
      expect(createClient).not.toHaveBeenCalled();
    },
  );

  it.each(["sber-space-ui", "material-ui"])(
    "validates the %s pack",
    async (packId) => {
      const written = output();
      await createProgram({
        cwd: () => packsRoot,
        now: fixedNow,
        createPixsoClient: vi.fn(),
        stdout: written.stream,
        stderr: output().stream,
      }).parseAsync(["pack", "validate", join(packsRoot, packId)], {
        from: "user",
      });
      expect(written.text).toContain(`${packId}@2.0.0`);
    },
  );

  it("formats a missing token without exposing a value", () => {
    expect(
      formatDiagnostic(
        new PixsoProviderError(
          "PIXSO_TOKEN_MISSING",
          "PIXSO_ACCESS_TOKEN is required",
        ),
      ),
    ).toBe("PIXSO_TOKEN_MISSING: PIXSO_ACCESS_TOKEN is required");
  });
});

function fixedNow(): Date {
  return new Date("2026-07-26T10:30:00.000Z");
}

function output(): {
  stream: { write: (chunk: string | Uint8Array) => boolean };
  readonly text: string;
} {
  let text = "";
  return {
    stream: {
      write(chunk) {
        text += chunk.toString();
        return true;
      },
    },
    get text() {
      return text;
    },
  };
}
