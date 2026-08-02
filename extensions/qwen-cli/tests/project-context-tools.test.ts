import { describe, expect, it, vi } from "vitest";

import type { ProjectContextService } from "@uig/project-context";
import { ProjectContextError } from "@uig/project-context";

import { createProjectContextTools } from "../src/project-context-tools.js";

describe("createProjectContextTools", () => {
  it("delegates bounded search input exactly", async () => {
    const search = vi.fn().mockResolvedValue({
      catalogFingerprint: "a".repeat(64),
      catalogPath: ".ui-context/generated/effective-component-catalog.json",
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      results: [],
    });
    const tools = createProjectContextTools({
      ...service(),
      search,
    });
    await tools.projectComponentSearch({ query: "Radio", limit: 10 });
    expect(search).toHaveBeenCalledWith({ query: "Radio", limit: 10 });
  });

  it("preserves safe domain error codes without local paths", async () => {
    const tools = createProjectContextTools({
      ...service(),
      status: vi
        .fn()
        .mockRejectedValue(
          new ProjectContextError(
            "PROJECT_COMPONENT_CATALOG_STALE",
            "stale at /Users/private/project",
          ),
        ),
    });
    await expect(tools.getProjectUiContextStatus({})).rejects.toMatchObject({
      code: "PROJECT_COMPONENT_CATALOG_STALE",
    });
    await expect(
      tools.getProjectUiContextStatus({}),
    ).rejects.not.toHaveProperty("message", expect.stringContaining("/Users/"));
  });
});

function service(): ProjectContextService {
  return {
    scan: vi.fn(),
    status: vi.fn(),
    search: vi.fn(),
    getComponentContract: vi.fn(),
    getIconPaths: vi.fn(),
    confirmMappings: vi.fn(),
    removeMappings: vi.fn(),
  };
}
