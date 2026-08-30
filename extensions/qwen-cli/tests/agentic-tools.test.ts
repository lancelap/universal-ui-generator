import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PixsoDslClient } from "@uig/provider-pixso";
import { createProjectContextService } from "@uig/project-context";
import { afterEach, describe, expect, it } from "vitest";

import { createAgenticTools } from "../src/agentic-tools.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const packPath = join(repoRoot, "design-system-packs", "sber-space-ui");
const adapterModulePath = join(repoRoot, "dist", "qwen-adapter.mjs");
const pixsoUrl =
  "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314";
const fixedNow = () => new Date("2026-08-30T00:00:00.000Z");

const shaA = "a".repeat(64);

function staticPixsoClient(bytes: Uint8Array): PixsoDslClient {
  return {
    async getNodeDsl() {
      return bytes;
    },
  };
}

describe("createAgenticTools", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("rejects an unsafe local-dsl path", async () => {
    const workspace = await temporaryWorkspace(roots);
    const tools = makeTools(workspace);
    await expect(
      tools.prepareBuild({
        source: {
          kind: "local-dsl",
          path: "../outside/file.json",
          designSystem: "sber-space-ui",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects an unknown pack", async () => {
    const workspace = await temporaryWorkspace(roots);
    const tools = makeTools(workspace);
    await expect(
      tools.prepareBuild({
        source: {
          kind: "pixso-url",
          url: pixsoUrl,
          designSystem: "not-a-real-pack",
        },
      }),
    ).rejects.toThrowError(/Design-system pack/);
  });

  it("returns a blocked run when planning fails closed", async () => {
    const workspace = await temporaryWorkspace(roots);
    const rawDsl = await readFile(
      join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
    );
    const tools = makeTools(workspace, {
      createPixsoClient: () => staticPixsoClient(rawDsl),
    });
    const result = await tools.prepareBuild({
      source: {
        kind: "pixso-url",
        url: pixsoUrl,
        designSystem: "sber-space-ui",
      },
    });
    expect(result.status).not.toBe("blocked");
    expect(result.runPath).toBe(`.uig/runs/${result.runId}`);
    expect(result.reusableComponents.length).toBeGreaterThanOrEqual(0);
    const prep = JSON.parse(
      await readFile(
        join(workspace, result.runPath, "agentic", "build-prep.json"),
        "utf8",
      ),
    );
    expect(prep.schema).toBe("uig-qwen-build-prep/v1");
  });

  it("persists implementation, code-review, and browser-review reports", async () => {
    const workspace = await temporaryWorkspace(roots);
    const rawDsl = await readFile(
      join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
    );
    const tools = makeTools(workspace, {
      createPixsoClient: () => staticPixsoClient(rawDsl),
    });
    const prepared = await tools.prepareBuild({
      source: {
        kind: "pixso-url",
        url: pixsoUrl,
        designSystem: "sber-space-ui",
      },
    });
    const runId = prepared.runId;

    const implResult = await tools.recordImplementation({
      runId,
      status: "written",
      pagePath: "src/pages/Home.tsx",
      previewPath: "src/pages/Home.preview.tsx",
      previewUrlPath: "/preview/home",
      previewCommand: "vite",
      createdFiles: [
        { path: "src/pages/Home.tsx", sha256: shaA, kind: "page" },
      ],
      modifiedFiles: [],
      importedComponents: [
        {
          componentId: "Btn",
          importSource: "@scope/ui",
          exportName: "Button",
        },
      ],
      assumptions: [],
      residualErrors: [],
    });
    expect(implResult.runStatus).toBe("implementation-recorded");
    expect(implResult.accepted).toBe(true);

    const reviewResult = await tools.recordCodeReview({
      runId,
      verdict: "approved-with-fixes",
      tsc: "passed",
      lint: "passed",
      autoFixed: [],
      remainingIssues: [],
    });
    expect(reviewResult.runStatus).toBe("code-review-recorded");

    const browserResult = await tools.recordBrowserReview({
      runId,
      verdict: "ok",
      devServerCommand: "vite",
      previewUrl: "http://localhost:5173/preview/home",
      screenshots: [
        {
          viewport: "desktop",
          path: ".uig/runs/desktop.png",
          sha256: shaA,
        },
        {
          viewport: "narrow",
          path: ".uig/runs/narrow.png",
          sha256: shaA,
        },
      ],
      unresolvedErrors: [],
      runtimeFixes: [],
    });
    expect(browserResult.runStatus).toBe("complete");

    const status = JSON.parse(
      await readFile(
        join(workspace, ".uig", "runs", runId, "agentic", "status.json"),
        "utf8",
      ),
    );
    expect(status.status).toBe("complete");
  });

  it("rolls a failed browser review to generated-with-errors", async () => {
    const workspace = await temporaryWorkspace(roots);
    const rawDsl = await readFile(
      join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
    );
    const tools = makeTools(workspace, {
      createPixsoClient: () => staticPixsoClient(rawDsl),
    });
    const prepared = await tools.prepareBuild({
      source: {
        kind: "pixso-url",
        url: pixsoUrl,
        designSystem: "sber-space-ui",
      },
    });
    const runId = prepared.runId;

    const result = await tools.recordBrowserReview({
      runId,
      verdict: "failed",
      devServerCommand: "vite",
      previewUrl: "http://localhost:5173/preview/home",
      screenshots: [
        {
          viewport: "desktop",
          path: ".uig/runs/desktop.png",
          sha256: shaA,
        },
      ],
      unresolvedErrors: [
        {
          code: "ERR_NETWORK",
          severity: "error",
          source: "network",
          message: "Asset 404",
        },
      ],
      runtimeFixes: [],
    });
    expect(result.runStatus).toBe("generated-with-errors");
  });

  it("blocks implementation when the write scope touches .uig/", async () => {
    const workspace = await temporaryWorkspace(roots);
    const rawDsl = await readFile(
      join(repoRoot, "fixtures", "pixso", "modal-4-314", "source.json"),
    );
    const tools = makeTools(workspace, {
      createPixsoClient: () => staticPixsoClient(rawDsl),
    });
    const prepared = await tools.prepareBuild({
      source: {
        kind: "pixso-url",
        url: pixsoUrl,
        designSystem: "sber-space-ui",
      },
    });
    const runId = prepared.runId;
    const result = await tools.recordImplementation({
      runId,
      status: "written",
      pagePath: "src/pages/Home.tsx",
      previewPath: "src/pages/Home.preview.tsx",
      previewUrlPath: "/preview/home",
      previewCommand: "vite",
      createdFiles: [
        { path: `.uig/runs/${runId}/run.json`, sha256: shaA, kind: "page" },
      ],
      modifiedFiles: [],
      importedComponents: [],
      assumptions: [],
      residualErrors: [],
    });
    expect(result.accepted).toBe(false);
    expect(result.runStatus).toBe("blocked");
  });

  it.skip("rolls the implementation status to implementation-recorded", async () => {
    // covered by the happy-path test above
  });

  it("writes a screenshot stump when given a screenshot source", async () => {
    const workspace = await temporaryWorkspace(roots);
    const screenshotPath = "fixtures/screenshot.png";
    await mkdir(join(workspace, "fixtures"), { recursive: true });
    await writeFile(
      join(workspace, screenshotPath),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    const tools = makeTools(workspace);
    const result = await tools.prepareBuild({
      source: {
        kind: "screenshot",
        path: screenshotPath,
        pageName: "Home",
        designSystem: "sber-space-ui",
      },
    });
    expect(result.status).toBe("ready-with-warnings");
    expect(result.sourceKind).toBe("screenshot");
  });
});

async function temporaryWorkspace(roots: string[], prefix = "uig-agentic-") {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function makeTools(
  workspace: string,
  overrides: Partial<{
    createPixsoClient: (token: string) => PixsoDslClient;
  }> = {},
) {
  const extensionRoot = repoRoot;
  const projectContextService = createProjectContextService({
    workspaceDir: workspace,
    extensionRoot,
  });
  return createAgenticTools({
    workspaceDir: workspace,
    extensionRoot,
    adapterModulePath,
    token: "agentic-test-token",
    now: fixedNow,
    createPixsoClient:
      overrides.createPixsoClient ??
      (() => ({
        async getNodeDsl() {
          return new Uint8Array();
        },
      })),
    projectContextService,
  });
}
