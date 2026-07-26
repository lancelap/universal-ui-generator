import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { stableStringify } from "@uig/contracts";

import {
  type PixsoDslClient,
  PixsoProviderError,
  type PixsoProviderErrorCode,
} from "./pixso-dsl-client.js";

export function createRemotePixsoDslClient(input: {
  endpoint: URL;
  token: string;
}): PixsoDslClient {
  if (input.token.trim().length === 0) {
    throw new PixsoProviderError(
      "PIXSO_TOKEN_MISSING",
      "A Pixso access token is required",
    );
  }

  return {
    async getNodeDsl(node): Promise<Uint8Array> {
      const client = new Client({
        name: "universal-ui-generator",
        version: "0.1.0",
      });
      const transport = new StreamableHTTPClientTransport(input.endpoint, {
        fetch: createTokenFetch(input.token),
      });

      try {
        await client.connect(transport);
        const result = await client.callTool({
          name: "get_node_dsl",
          arguments: {
            file_key: node.fileKey,
            guid: node.guid,
          },
        });

        if (result.isError) {
          throw mapToolError(result);
        }

        return canonicalDslBytes(result);
      } catch (error) {
        if (error instanceof PixsoProviderError) {
          throw error;
        }
        throw mapRequestError(error);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
  };
}

function createTokenFetch(token: string): typeof fetch {
  return async (request, init) => {
    const headers = new Headers(
      request instanceof Request ? request.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    headers.set("Token", token);

    return fetch(request, { ...init, headers });
  };
}

function canonicalDslBytes(result: unknown): Uint8Array {
  const candidate =
    extractStructuredContent(result) ?? extractTextContent(result);

  let parsed: unknown;
  try {
    parsed = typeof candidate === "string" ? JSON.parse(candidate) : candidate;
  } catch (error) {
    throw new PixsoProviderError(
      "PIXSO_RESPONSE_INVALID",
      "Pixso MCP returned invalid JSON content",
      { cause: error },
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("dsl" in parsed) ||
    typeof parsed.dsl !== "object" ||
    parsed.dsl === null
  ) {
    throw new PixsoProviderError(
      "PIXSO_RESPONSE_INVALID",
      "Pixso MCP response does not contain a DSL object",
    );
  }

  return new TextEncoder().encode(stableStringify(parsed));
}

function extractStructuredContent(result: unknown): unknown {
  if (
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result &&
    result.structuredContent !== undefined
  ) {
    return result.structuredContent;
  }
  return undefined;
}

function extractTextContent(result: unknown): string | undefined {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return undefined;
  }

  const texts = result.content.flatMap((block) => {
    if (
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      return [block.text];
    }
    return [];
  });

  return texts.length > 0 ? texts.join("") : undefined;
}

function mapToolError(result: unknown): PixsoProviderError {
  const text = extractTextContent(result) ?? "";
  const code: PixsoProviderErrorCode = /not[\s_-]*found|不存在|未找到/i.test(
    text,
  )
    ? "PIXSO_NODE_NOT_FOUND"
    : "PIXSO_REQUEST_FAILED";

  return new PixsoProviderError(code, "Pixso MCP could not retrieve the node");
}

function mapRequestError(error: unknown): PixsoProviderError {
  const status = readHttpStatus(error);
  if (status === 401 || status === 403) {
    return new PixsoProviderError(
      "PIXSO_AUTH_FAILED",
      "Pixso rejected the access token",
      { cause: error },
    );
  }

  const message = error instanceof Error ? error.message : "";
  if (/not[\s_-]*found|不存在|未找到/i.test(message)) {
    return new PixsoProviderError(
      "PIXSO_NODE_NOT_FOUND",
      "The requested Pixso node was not found",
      { cause: error },
    );
  }

  return new PixsoProviderError(
    "PIXSO_REQUEST_FAILED",
    "Pixso MCP request failed",
    { cause: error },
  );
}

function readHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const record = error as Record<string, unknown>;

  for (const key of ["status", "statusCode"] as const) {
    if (typeof record[key] === "number") {
      return record[key];
    }
  }

  if (
    typeof record.data === "object" &&
    record.data !== null &&
    "status" in record.data &&
    typeof record.data.status === "number"
  ) {
    return record.data.status;
  }

  return undefined;
}
