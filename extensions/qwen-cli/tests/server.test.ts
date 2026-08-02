import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";

import { createUigMcpServer, type UigMcpToolHandlers } from "../src/server.js";
import type { UigGenerateResult, UigPlanResult } from "../src/results.js";
import { UigToolError } from "../src/tools.js";

const sha = "a".repeat(64);

describe("createUigMcpServer", () => {
  const closeActions: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closeActions.splice(0).map((close) => close()));
  });

  it("exposes exactly nine tools with visible schemas", async () => {
    const { client } = await connectedClient(handlers());

    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "confirm_project_component_mappings",
      "get_component_contract",
      "get_icon_paths",
      "get_project_ui_context_status",
      "project_component_search",
      "remove_project_component_mappings",
      "scan_project_components",
      "uig_generate",
      "uig_plan",
    ]);
    for (const tool of listed.tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it("returns project status as identical text and structured content", async () => {
    const { client } = await connectedClient(handlers());
    const result = await client.callTool({
      name: "get_project_ui_context_status",
      arguments: {},
    });
    const expected = { status: "missing", changed: [] };
    expect(result.structuredContent).toEqual(expected);
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify(expected) },
    ]);
  });

  it("returns compact plan and generation results as structured content", async () => {
    const expectedPlan = planResult();
    const expectedGeneration = generateResult();
    const { client } = await connectedClient({
      ...handlers(),
      plan: async () => expectedPlan,
      generate: async () => expectedGeneration,
    });

    const planned = await client.callTool({
      name: "uig_plan",
      arguments: {
        url: "https://pixso.net/app/design/file?item-id=4:314",
        designSystem: "sber-space-ui",
      },
    });
    const generated = await client.callTool({
      name: "uig_generate",
      arguments: {
        runId: "run_test",
      },
    });

    expect(planned.structuredContent).toEqual(expectedPlan);
    expect(planned.content).toEqual([
      { type: "text", text: JSON.stringify(expectedPlan) },
    ]);
    expect(generated.structuredContent).toEqual(expectedGeneration);
    expect(generated.content).toEqual([
      { type: "text", text: JSON.stringify(expectedGeneration) },
    ]);
  });

  it("serializes stable adapter errors without stack traces", async () => {
    const { client } = await connectedClient({
      ...handlers(),
      plan: async () => {
        throw new UigToolError("UIG_INPUT_INVALID", "Invalid plan input");
      },
    });

    const result = await client.callTool({
      name: "uig_plan",
      arguments: {
        url: "https://pixso.net/app/design/file?item-id=4:314",
        designSystem: "sber-space-ui",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          code: "UIG_INPUT_INVALID",
          message: "Invalid plan input",
        }),
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("at ");
  });

  async function connectedClient(tools: UigMcpToolHandlers) {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createUigMcpServer({ tools });
    const client = new Client({
      name: "uig-qwen-server-test",
      version: "0.1.0",
    });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeActions.push(async () => {
      await client.close();
      await server.close();
    });
    return { client, server };
  }
});

function handlers(): UigMcpToolHandlers {
  return {
    plan: async () => planResult(),
    generate: async () => generateResult(),
    scanProjectComponents: unimplemented,
    projectComponentSearch: unimplemented,
    getComponentContract: unimplemented,
    getIconPaths: unimplemented,
    confirmProjectComponentMappings: unimplemented,
    removeProjectComponentMappings: unimplemented,
    getProjectUiContextStatus: async () => ({ status: "missing", changed: [] }),
  };
}

async function unimplemented(): Promise<never> {
  throw new Error("not called");
}

function planResult(): UigPlanResult {
  return {
    schema: "uig-qwen-plan-result/v1",
    status: "ready",
    runId: "run_test",
    runPath: ".uig/runs/run_test",
    source: {
      fileKey: "file",
      nodeId: "4:314",
    },
    target: {
      designSystem: "sber-space-ui",
      designSystemVersion: "1.0.0",
      packSha256: sha,
    },
    summary: {
      reuse: 1,
      compose: 0,
      fallback: 0,
      blocked: 0,
    },
    diagnostics: {
      items: [],
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      artifactPath: ".uig/runs/run_test/diagnostics.json",
    },
  };
}

function generateResult(): UigGenerateResult {
  return {
    schema: "uig-qwen-generate-result/v1",
    status: "generated",
    runId: "run_test",
    outputPath: ".uig/runs/run_test/generated",
    writeStatus: "written",
    files: [
      {
        path: "generation-report.json",
        sha256: sha,
      },
    ],
    imports: [],
    renderOnlyProps: [],
    diagnostics: {
      items: [],
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      artifactPath: ".uig/runs/run_test/generated/generation-report.json",
    },
  };
}
