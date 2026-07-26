import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  connect: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
  transport: vi.fn(),
}));

vi.mock("@modelcontextprotocol/client", () => ({
  Client: class {
    connect = sdk.connect;
    callTool = sdk.callTool;
    close = sdk.close;
  },
  StreamableHTTPClientTransport: class {
    constructor(endpoint: URL, options: unknown) {
      sdk.transport(endpoint, options);
    }
  },
}));

import { createRemotePixsoDslClient } from "./remote-mcp-client.js";

describe("Remote Pixso MCP adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.connect.mockResolvedValue(undefined);
    sdk.close.mockResolvedValue(undefined);
  });

  it("adds the Token header and calls get_node_dsl with exact arguments", async () => {
    sdk.callTool.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"dsl":{"dslVersion":"2.1.15","pixTreeDslNodes":[]}}',
        },
      ],
    });
    const client = createRemotePixsoDslClient({
      endpoint: new URL("https://pixso.net/api/mcp/mcp"),
      token: "secret-value",
    });

    const bytes = await client.getNodeDsl({
      fileKey: "WSLukjrKancvZG0zbaMnyA",
      guid: "4:314",
    });

    expect(sdk.callTool).toHaveBeenCalledExactlyOnceWith({
      name: "get_node_dsl",
      arguments: {
        file_key: "WSLukjrKancvZG0zbaMnyA",
        guid: "4:314",
      },
    });
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({
      dsl: { dslVersion: "2.1.15", pixTreeDslNodes: [] },
    });
    expect(sdk.close).toHaveBeenCalledOnce();

    const transportOptions = sdk.transport.mock.calls[0]?.[1] as {
      fetch: typeof fetch;
    };
    const networkFetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", networkFetch);
    await transportOptions.fetch("https://pixso.net/api/mcp/mcp", {
      headers: { Accept: "application/json" },
    });

    const sentInit = (networkFetch.mock.calls as unknown[][])[0]?.[1] as
      RequestInit | undefined;
    if (!sentInit) {
      throw new Error("Expected the custom fetch to forward request init");
    }
    expect(new Headers(sentInit.headers).get("Token")).toBe("secret-value");
    expect(new Headers(sentInit.headers).get("Accept")).toBe(
      "application/json",
    );
    vi.unstubAllGlobals();
  });

  it("rejects an empty token without opening a connection", () => {
    expect(() =>
      createRemotePixsoDslClient({
        endpoint: new URL("https://pixso.net/api/mcp/mcp"),
        token: " ",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "PIXSO_TOKEN_MISSING",
      }),
    );
    expect(sdk.transport).not.toHaveBeenCalled();
  });

  it("maps an MCP missing-node result and still closes the client", async () => {
    sdk.callTool.mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "node not found" }],
    });
    const client = createRemotePixsoDslClient({
      endpoint: new URL("https://pixso.net/api/mcp/mcp"),
      token: "secret-value",
    });

    await expect(
      client.getNodeDsl({ fileKey: "file", guid: "missing" }),
    ).rejects.toMatchObject({
      code: "PIXSO_NODE_NOT_FOUND",
    });
    expect(sdk.close).toHaveBeenCalledOnce();
  });
});
