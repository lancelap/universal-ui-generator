import { describe, expect, it } from "vitest";

import { createRemotePixsoDslClient } from "./remote-mcp-client.js";

describe.skipIf(process.env.PIXSO_LIVE_TEST !== "1")(
  "Pixso Remote MCP live smoke test",
  () => {
    it("retrieves a known node DSL", async () => {
      const token = process.env.PIXSO_ACCESS_TOKEN;
      if (!token) {
        throw new Error(
          "PIXSO_ACCESS_TOKEN is required when PIXSO_LIVE_TEST=1",
        );
      }

      const client = createRemotePixsoDslClient({
        endpoint: new URL("https://pixso.net/api/mcp/mcp"),
        token,
      });
      const bytes = await client.getNodeDsl({
        fileKey: "WSLukjrKancvZG0zbaMnyA",
        guid: "4:314",
      });
      const value = JSON.parse(new TextDecoder().decode(bytes)) as {
        dsl?: { dslVersion?: unknown };
      };

      expect(value.dsl?.dslVersion).toEqual(expect.any(String));
      expect((value.dsl?.dslVersion as string).length).toBeGreaterThan(0);
    });
  },
);
