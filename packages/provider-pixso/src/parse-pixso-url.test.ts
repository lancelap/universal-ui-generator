import { describe, expect, it } from "vitest";

import { parsePixsoUrl } from "./parse-pixso-url.js";

describe("parsePixsoUrl", () => {
  it("extracts a node reference and removes unrelated query parameters", () => {
    expect(
      parsePixsoUrl(
        "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4:314&page-id=1:2",
      ),
    ).toEqual({
      fileKey: "WSLukjrKancvZG0zbaMnyA",
      guid: "4:314",
      canonicalUrl:
        "https://pixso.net/app/design/WSLukjrKancvZG0zbaMnyA?item-id=4%3A314",
    });
  });

  it.each([
    "http://pixso.net/app/design/file?item-id=4:314",
    "https://example.com/app/design/file?item-id=4:314",
    "https://pixso.net/design/file?item-id=4:314",
    "https://pixso.net/app/design/?item-id=4:314",
    "https://pixso.net/app/design/file",
    "https://pixso.net/app/design/file?page-id=1:2",
    "https://pixso.net/app/design/file?item-id=..%2Fsecret",
    "https://pixso.net/app/design/file?item-id=folder%5Csecret",
  ])("rejects invalid input: %s", (input) => {
    expect(() => parsePixsoUrl(input)).toThrowError(
      expect.objectContaining({
        name: "PixsoProviderError",
        code: "PIXSO_URL_INVALID",
      }),
    );
  });

  it("rejects malformed URL text", () => {
    expect(() => parsePixsoUrl("not a URL")).toThrowError(
      expect.objectContaining({ code: "PIXSO_URL_INVALID" }),
    );
  });
});
