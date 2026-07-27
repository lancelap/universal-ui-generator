import {
  mkdir,
  mkdtemp,
  lstat,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDesignSystemPackV2 } from "@uig/component-catalog";
import { resolveUiManifestV2 } from "@uig/component-resolver";
import {
  type DesignIRV2,
  type GenerationRun,
  type ResolutionPlanV2,
  stableStringify,
  type UiManifestV2,
} from "@uig/contracts";
import {
  generateReactBundle,
  type ReactGenerationInput,
  ReactGenerationError,
} from "@uig/generator-react";
import { afterEach, describe, expect, it } from "vitest";

import { generateFromRun } from "./generate-from-run.js";
import { writeGeneratedBundleAtomically } from "./write-generated-bundle.js";

const materialUiPack = fileURLToPath(
  new URL("../../../design-system-packs/material-ui", import.meta.url),
);
const sberPack = fileURLToPath(
  new URL("../../../design-system-packs/sber-space-ui", import.meta.url),
);

describe("generateFromRun", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("loads only v2 run artifacts and writes the generated bundle", async () => {
    const fixture = await runFixture(roots);

    const result = await generateFromRun({
      runId: fixture.run.runId,
      workspaceDir: fixture.workspace,
    });

    expect(result).toEqual({
      outputPath: `.uig/runs/${fixture.run.runId}/generated`,
      status: "generated",
      writeStatus: "written",
    });
    const outputFiles = await relativeFiles(join(fixture.runDir, "generated"));
    expect(outputFiles).toEqual([
      "GeneratedModal.module.css",
      "GeneratedModal.tsx",
      "generation-report.json",
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(fixture.runDir, "generated", "generation-report.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      schema: "react-generation-report/v2",
      sourceRunId: fixture.run.runId,
    });
  });

  it("rejects run traversal before reading or writing outside the chosen run", async () => {
    const fixture = await runFixture(roots);
    const outside = join(fixture.workspace, ".uig", "runs", "generated");

    await expect(
      generateFromRun({
        runId: "../run_fixture",
        workspaceDir: fixture.workspace,
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_INPUT_INVALID",
    });
    await expect(readFile(outside)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects artifact paths that escape the chosen run", async () => {
    const fixture = await runFixture(roots);
    await writeJson(join(fixture.runDir, "run.json"), {
      ...fixture.run,
      artifacts: {
        ...fixture.run.artifacts,
        designIr: "../other-run/design-ir.json",
      },
    });

    await expect(
      generateFromRun({
        runId: fixture.run.runId,
        workspaceDir: fixture.workspace,
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_INPUT_INVALID",
    });
    await expect(
      readFile(join(fixture.runDir, "generated", "generation-report.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stays anchored when the selected run is rebound after worker identity verification", async () => {
    const fixture = await runFixture(roots);
    const originalRun = `${fixture.runDir}.original`;
    const outsideRun = join(fixture.workspace, "outside-run");
    await mkdir(outsideRun);

    await expect(
      generateFromRun({
        runId: fixture.run.runId,
        workspaceDir: fixture.workspace,
        testHooks: {
          beforeInstall: async () => {
            await rename(fixture.runDir, originalRun);
            await symlink(outsideRun, fixture.runDir);
          },
        },
      }),
    ).resolves.toEqual({
      outputPath: `.uig/runs/${fixture.run.runId}/generated`,
      status: "generated",
      writeStatus: "written",
    });
    await expect(
      readFile(join(outsideRun, "generated", "generation-report.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      JSON.parse(
        await readFile(
          join(originalRun, "generated", "generation-report.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      sourceRunId: fixture.run.runId,
    });
  });

  it("requires the exact plan pack ID, version, and hash", async () => {
    const fixture = await runFixture(roots);
    const stalePlan = {
      ...fixture.resolutionPlan,
      target: {
        ...fixture.resolutionPlan.target,
        packSha256: "0".repeat(64),
      },
    };
    await writeJson(
      join(fixture.runDir, fixture.run.artifacts.resolutionPlan),
      stalePlan,
    );

    await expect(
      generateFromRun({
        runId: fixture.run.runId,
        workspaceDir: fixture.workspace,
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_INPUT_INVALID",
    });
    await expect(
      generateFromRun({
        runId: fixture.run.runId,
        workspaceDir: fixture.workspace,
        explicitPackPath: sberPack,
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_INPUT_INVALID",
    });
  });

  it("rejects a stale pre-v2 generation artifact set", async () => {
    const fixture = await runFixture(roots);
    await writeJson(join(fixture.runDir, fixture.run.artifacts.uiManifest), {
      schema: "ui-manifest/v1",
      sourceArtifactId: fixture.uiManifest.sourceArtifactId,
      root: fixture.uiManifest.root,
      diagnostics: [],
    });

    await expect(
      generateFromRun({
        runId: fixture.run.runId,
        workspaceDir: fixture.workspace,
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_INPUT_INVALID",
    });
  });

  it("writes a blocked report and returns blocked status", async () => {
    const fixture = await runFixture(roots, { blocked: true });

    const result = await generateFromRun({
      runId: fixture.run.runId,
      workspaceDir: fixture.workspace,
    });

    expect(result).toEqual({
      outputPath: `.uig/runs/${fixture.run.runId}/generated`,
      status: "blocked",
      writeStatus: "written",
    });
    expect(await relativeFiles(join(fixture.runDir, "generated"))).toEqual([
      "generation-report.json",
    ]);
  });
});

describe("writeGeneratedBundleAtomically", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("returns written then identical without changing installed bytes", async () => {
    const fixture = await runFixture(roots);
    const destination = join(fixture.runDir, "generated");
    const bundle = generateReactBundle(fixture.generationInput);

    await expect(
      writeGeneratedBundleAtomically({ destination, bundle }),
    ).resolves.toBe("written");
    const first = await byteMap(destination);
    await expect(
      writeGeneratedBundleAtomically({ destination, bundle }),
    ).resolves.toBe("identical");
    expect(await byteMap(destination)).toEqual(first);
    expect([...first.keys()].sort()).toEqual([
      "GeneratedModal.module.css",
      "GeneratedModal.tsx",
      "generation-report.json",
    ]);
    expect((await lstat(destination)).isSymbolicLink()).toBe(true);
    const installedTarget = await readlink(destination);
    expect(installedTarget).toMatch(/^generated\.content-[0-9a-f-]{36}$/);
    expect(
      (await lstat(join(fixture.runDir, installedTarget))).isDirectory(),
    ).toBe(true);
    expect(await generatedContentSiblings(fixture.runDir)).toEqual([
      installedTarget,
    ]);
  });

  it("leaves a conflicting destination untouched and cleans its temporary sibling", async () => {
    const fixture = await runFixture(roots);
    const destination = join(fixture.runDir, "generated");
    const bundle = generateReactBundle(fixture.generationInput);
    await writeGeneratedBundleAtomically({ destination, bundle });
    const conflictPath = join(destination, "GeneratedModal.tsx");
    await writeFile(conflictPath, "local bytes\n", "utf8");
    const before = await byteMap(destination);

    await expect(
      writeGeneratedBundleAtomically({ destination, bundle }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ReactGenerationError>>({
        code: "GENERATION_OUTPUT_CONFLICT",
      }),
    );
    expect(await byteMap(destination)).toEqual(before);
    expect(
      (await readdir(fixture.runDir)).filter((name) =>
        name.startsWith("generated.tmp-"),
      ),
    ).toEqual([]);
    expect(await generatedContentSiblings(fixture.runDir)).toHaveLength(1);
  });

  it("rejects a tampered bundle before creating a destination", async () => {
    const fixture = await runFixture(roots);
    const destination = join(fixture.runDir, "generated");
    const bundle = generateReactBundle(fixture.generationInput);
    bundle.files[0]!.bytes = new TextEncoder().encode("tampered\n");

    await expect(
      writeGeneratedBundleAtomically({ destination, bundle }),
    ).rejects.toMatchObject({
      code: "GENERATION_SOURCE_INVALID",
    });
    await expect(readFile(destination)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not replace a concurrently-created empty destination", async () => {
    const fixture = await runFixture(roots);
    const destination = join(fixture.runDir, "generated");
    const bundle = generateReactBundle(fixture.generationInput);

    await expect(
      writeGeneratedBundleAtomically({
        destination,
        bundle,
        testHooks: {
          beforePublish: async () => {
            await mkdir(destination);
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_OUTPUT_CONFLICT",
    });
    expect(await readdir(destination)).toEqual([]);
    expect(await generatedSiblings(fixture.runDir)).toEqual([]);
    expect(await generatedContentSiblings(fixture.runDir)).toEqual([]);
  });

  it("does not replace destination data created in the final publication window", async () => {
    const fixture = await runFixture(roots);
    const destination = join(fixture.runDir, "generated");
    const bundle = generateReactBundle(fixture.generationInput);

    await expect(
      writeGeneratedBundleAtomically({
        destination,
        bundle,
        testHooks: {
          beforePublish: async () => {
            await mkdir(destination);
            await writeFile(join(destination, "owner.txt"), "external\n");
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "GENERATION_OUTPUT_CONFLICT",
    });
    expect(await readFile(join(destination, "owner.txt"), "utf8")).toBe(
      "external\n",
    );
    expect(await generatedSiblings(fixture.runDir)).toEqual([]);
    expect(await generatedContentSiblings(fixture.runDir)).toEqual([]);
  });

  it("never follows an attacker-controlled destination link", async () => {
    const fixture = await runFixture(roots);
    const destination = join(fixture.runDir, "generated");
    const outside = join(fixture.workspace, "outside-generated");
    const bundle = generateReactBundle(fixture.generationInput);
    await mkdir(outside);
    await writeFile(join(outside, "owner.txt"), "external\n");
    await symlink(outside, destination);

    await expect(
      writeGeneratedBundleAtomically({ destination, bundle }),
    ).rejects.toMatchObject({
      code: "GENERATION_OUTPUT_CONFLICT",
    });
    expect(await readFile(join(outside, "owner.txt"), "utf8")).toBe(
      "external\n",
    );
    expect(await generatedSiblings(fixture.runDir)).toEqual([]);
    expect(await generatedContentSiblings(fixture.runDir)).toEqual([]);
  });

  it("serializes concurrent identical writers and converges without clobbering", async () => {
    const fixture = await runFixture(roots);
    const destination = join(fixture.runDir, "generated");
    const bundle = generateReactBundle(fixture.generationInput);
    const acquired = deferred<void>();
    const release = deferred<void>();
    const first = writeGeneratedBundleAtomically({
      destination,
      bundle,
      testHooks: {
        afterReservationAcquired: async () => {
          acquired.resolve();
          await release.promise;
        },
      },
    });
    await withTimeout(acquired.promise, 250);
    const second = writeGeneratedBundleAtomically({ destination, bundle });
    release.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "written",
      "identical",
    ]);
    expect(await generatedSiblings(fixture.runDir)).toEqual([]);
    expect(await generatedContentSiblings(fixture.runDir)).toHaveLength(1);
  });

  it("preserves the winner when a concurrent writer conflicts", async () => {
    const fixture = await runFixture(roots);
    const blockedFixture = await runFixture(roots, { blocked: true });
    const destination = join(fixture.runDir, "generated");
    const generatedBundle = generateReactBundle(fixture.generationInput);
    const blockedBundle = generateReactBundle(blockedFixture.generationInput);
    const acquired = deferred<void>();
    const release = deferred<void>();
    const first = writeGeneratedBundleAtomically({
      destination,
      bundle: generatedBundle,
      testHooks: {
        afterReservationAcquired: async () => {
          acquired.resolve();
          await release.promise;
        },
      },
    });
    await withTimeout(acquired.promise, 250);
    const second = writeGeneratedBundleAtomically({
      destination,
      bundle: blockedBundle,
    });
    release.resolve();

    await expect(first).resolves.toBe("written");
    await expect(second).rejects.toMatchObject({
      code: "GENERATION_OUTPUT_CONFLICT",
    });
    expect(await relativeFiles(destination)).toEqual([
      "GeneratedModal.module.css",
      "GeneratedModal.tsx",
      "generation-report.json",
    ]);
    expect(await generatedSiblings(fixture.runDir)).toEqual([]);
    expect(await generatedContentSiblings(fixture.runDir)).toHaveLength(1);
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Timed out waiting for writer reservation")),
        milliseconds,
      );
    }),
  ]);
}

async function generatedSiblings(runDir: string): Promise<string[]> {
  return (await readdir(runDir))
    .filter(
      (name) => name.startsWith("generated.tmp-") || name === "generated.lock",
    )
    .sort();
}

async function generatedContentSiblings(runDir: string): Promise<string[]> {
  return (await readdir(runDir))
    .filter((name) => name.startsWith("generated.content-"))
    .sort();
}

async function runFixture(
  roots: string[],
  options: { blocked?: boolean } = {},
): Promise<{
  workspace: string;
  runDir: string;
  run: GenerationRun;
  designIr: DesignIRV2;
  uiManifest: UiManifestV2;
  resolutionPlan: ResolutionPlanV2;
  generationInput: ReactGenerationInput;
}> {
  const workspace = await mkdtemp(join(tmpdir(), "uig-generate-"));
  roots.push(workspace);
  const runId = "run_20260726T103000000Z_4-314";
  const runDir = join(workspace, ".uig", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const pack = await loadDesignSystemPackV2(materialUiPack);
  const designIr: DesignIRV2 = {
    schema: "design-ir/v2",
    sourceArtifactId: "pixso_fixture",
    dslVersion: "2.1.15",
    rootNodeId: "4:314",
    nodes: {
      "4:314": designNode("4:314"),
    },
    diagnostics: [],
  };
  const uiManifest: UiManifestV2 = {
    schema: "ui-manifest/v2",
    sourceArtifactId: "pixso_fixture",
    root: {
      id: "ui_actions",
      kind: "group",
      role: "actionGroup",
      sourceNodeIds: ["4:314"],
      layoutSourceNodeId: "4:314",
      confidence: 1,
      evidence: [{ kind: "semantic-role", value: "actionGroup" }],
      children: [],
    },
    diagnostics: [],
  };
  if (options.blocked) {
    uiManifest.root.requiredCapabilities = ["unsupported-capability"];
  }
  const resolutionPlan = resolveUiManifestV2({
    manifest: uiManifest,
    designIr,
    pack,
  });
  const run: GenerationRun = {
    schema: "generation-run/v1",
    runId,
    status: options.blocked ? "blocked" : "completed-with-warnings",
    stages: {
      fetch: "skipped",
      normalize: "completed",
      summarize: "completed",
      plan: "completed",
      resolve: options.blocked ? "blocked" : "completed",
    },
    artifacts: {
      snapshot: "snapshot.json",
      designIr: "design-ir.json",
      designSummary: "design-summary.json",
      uiManifest: "ui-manifest.json",
      resolutionPlan: "resolution-plan.material-ui.json",
      diagnostics: "diagnostics.json",
    },
  };
  await Promise.all([
    writeJson(join(runDir, "run.json"), run),
    writeJson(join(runDir, run.artifacts.designIr), designIr),
    writeJson(join(runDir, run.artifacts.uiManifest), uiManifest),
    writeJson(join(runDir, run.artifacts.resolutionPlan), resolutionPlan),
  ]);
  return {
    workspace,
    runDir,
    run,
    designIr,
    uiManifest,
    resolutionPlan,
    generationInput: {
      sourceRunId: runId,
      designIr,
      uiManifest,
      resolutionPlan,
      pack,
    },
  };
}

function designNode(id: string): DesignIRV2["nodes"][string] {
  return {
    id,
    type: "frame",
    name: id,
    visible: true,
    children: [],
    geometry: { x: 0, y: 0, width: 100, height: 40 },
    appearance: {
      fills: [],
      borders: [],
      radii: {
        topLeft: 0,
        topRight: 0,
        bottomRight: 0,
        bottomLeft: 0,
      },
      shadows: [],
      opacity: 1,
    },
    source: { provider: "pixso", nodeId: id },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, stableStringify(value), "utf8");
}

async function relativeFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relative = prefix ? join(prefix, entry.name) : entry.name;
      return entry.isDirectory() ? relativeFiles(root, relative) : [relative];
    }),
  );
  return files.flat().sort();
}

async function byteMap(root: string): Promise<Map<string, Uint8Array>> {
  return new Map(
    await Promise.all(
      (await relativeFiles(root)).map(
        async (path) =>
          [path, new Uint8Array(await readFile(join(root, path)))] as const,
      ),
    ),
  );
}
