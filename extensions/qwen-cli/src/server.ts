import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { generateFromRun } from "@uig/cli/generate-from-run";
import { runGenerateWorker } from "@uig/cli/generate-from-run-worker";
import { planFromUrl } from "@uig/cli/plan-from-url";
import { createRemotePixsoDslClient } from "@uig/provider-pixso";
import { createProjectContextService } from "@uig/project-context";

import {
  type UigGenerateResult,
  UigGenerateInputSchema,
  UigGenerateResultSchema,
  type UigPlanResult,
  UigPlanInputSchema,
  UigPlanResultSchema,
} from "./results.js";
import {
  ComponentContractInputSchema,
  ComponentContractResultSchema,
  EmptyInputSchema,
  IconPathsInputSchema,
  IconPathsResultSchema,
  MappingMutationInputSchema,
  MappingMutationResultSchema,
  ProjectComponentSearchInputSchema,
  ProjectComponentSearchResultSchema,
  ProjectScanInputSchema,
  ProjectScanResultSchema,
  ProjectStatusResultSchema,
} from "./project-context-results.js";
import { createProjectContextTools } from "./project-context-tools.js";
import {
  createUigTools,
  UigToolError,
  type UigToolDependencies,
} from "./tools.js";

export interface UigMcpToolHandlers extends ReturnType<
  typeof createProjectContextTools
> {
  plan(input: unknown): Promise<UigPlanResult>;
  generate(input: unknown): Promise<UigGenerateResult>;
}

export function createUigMcpServer(input: {
  tools: UigMcpToolHandlers;
}): McpServer {
  const server = new McpServer(
    {
      name: "universal-ui-generator",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.registerTool(
    "uig_plan",
    {
      title: "Plan Pixso UI generation",
      description:
        "Create a durable semantic UI generation plan from one Pixso node",
      inputSchema: UigPlanInputSchema,
      outputSchema: UigPlanResultSchema,
    },
    async (arguments_) => toolResponse(() => input.tools.plan(arguments_)),
  );

  registerProjectContextTools(server, input.tools);

  server.registerTool(
    "uig_generate",
    {
      title: "Generate React from a Uig plan",
      description:
        "Generate deterministic React source from one validated durable run",
      inputSchema: UigGenerateInputSchema,
      outputSchema: UigGenerateResultSchema,
    },
    async (arguments_) => toolResponse(() => input.tools.generate(arguments_)),
  );

  return server;
}

export async function runQwenAdapter(): Promise<void> {
  const adapterModulePath = fileURLToPath(import.meta.url);
  const extensionRoot = resolve(dirname(adapterModulePath), "..");
  const dependencies: UigToolDependencies = {
    workspaceDir: process.cwd(),
    extensionRoot,
    adapterModulePath,
    token: process.env.PIXSO_ACCESS_TOKEN,
    now: () => new Date(),
    createPixsoClient: (token) =>
      createRemotePixsoDslClient({
        endpoint: new URL("https://pixso.net/api/mcp/mcp"),
        token,
      }),
    planFromUrl,
    generateFromRun,
  };
  const tools = createUigTools(dependencies);
  const projectContextTools = createProjectContextTools(
    createProjectContextService({
      workspaceDir: process.cwd(),
      extensionRoot,
    }),
  );
  serveStdio(
    () => createUigMcpServer({ tools: { ...tools, ...projectContextTools } }),
    {
      onerror: () => {
        process.stderr.write("uig adapter protocol error\n");
      },
    },
  );
}

async function toolResponse<T extends object>(action: () => Promise<T>) {
  try {
    const result = await action();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
      structuredContent: result,
    };
  } catch (error) {
    const serialized =
      error instanceof UigToolError
        ? {
            code: error.code,
            message: error.message,
          }
        : {
            code: "UIG_INTERNAL_ERROR",
            message: "Unexpected adapter failure",
          };
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(serialized),
        },
      ],
    };
  }
}

function registerProjectContextTools(
  server: McpServer,
  tools: UigMcpToolHandlers,
): void {
  server.registerTool(
    "scan_project_components",
    {
      title: "Scan project components",
      description: "Discover or refresh the verified project component catalog",
      inputSchema: ProjectScanInputSchema,
      outputSchema: ProjectScanResultSchema,
    },
    async (arguments_) =>
      toolResponse(() => tools.scanProjectComponents(arguments_)),
  );
  server.registerTool(
    "project_component_search",
    {
      title: "Search project components",
      description: "Search the active verified project component catalog",
      inputSchema: ProjectComponentSearchInputSchema,
      outputSchema: ProjectComponentSearchResultSchema,
    },
    async (arguments_) =>
      toolResponse(() => tools.projectComponentSearch(arguments_)),
  );
  server.registerTool(
    "get_component_contract",
    {
      title: "Get component contract",
      description: "Read one exact verified component contract",
      inputSchema: ComponentContractInputSchema,
      outputSchema: ComponentContractResultSchema,
    },
    async (arguments_) =>
      toolResponse(() => tools.getComponentContract(arguments_)),
  );
  server.registerTool(
    "get_icon_paths",
    {
      title: "Get icon paths",
      description: "Resolve exact verified project icon imports",
      inputSchema: IconPathsInputSchema,
      outputSchema: IconPathsResultSchema,
    },
    async (arguments_) => toolResponse(() => tools.getIconPaths(arguments_)),
  );
  server.registerTool(
    "confirm_project_component_mappings",
    {
      title: "Confirm project component mappings",
      description: "Persist explicitly reviewed semantic component mappings",
      inputSchema: MappingMutationInputSchema,
      outputSchema: MappingMutationResultSchema,
    },
    async (arguments_) =>
      toolResponse(() => tools.confirmProjectComponentMappings(arguments_)),
  );
  server.registerTool(
    "remove_project_component_mappings",
    {
      title: "Remove project component mappings",
      description: "Remove explicitly selected semantic component mappings",
      inputSchema: MappingMutationInputSchema,
      outputSchema: MappingMutationResultSchema,
    },
    async (arguments_) =>
      toolResponse(() => tools.removeProjectComponentMappings(arguments_)),
  );
  server.registerTool(
    "get_project_ui_context_status",
    {
      title: "Get project UI context status",
      description: "Read project component catalog readiness without scanning",
      inputSchema: EmptyInputSchema,
      outputSchema: ProjectStatusResultSchema,
    },
    async (arguments_) =>
      toolResponse(() => tools.getProjectUiContextStatus(arguments_)),
  );
}

function isMainModule(): boolean {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  );
}

if (isMainModule()) {
  const workerMode =
    process.argv.length === 3 && process.argv[2] === "--generation-worker";
  if (workerMode) {
    void runGenerateWorker();
  } else {
    void runQwenAdapter().catch(() => {
      process.stderr.write("uig adapter failed to start\n");
      process.exitCode = 1;
    });
  }
}
