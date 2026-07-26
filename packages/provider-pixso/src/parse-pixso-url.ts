import {
  PixsoProviderError,
  type PixsoProviderErrorCode,
} from "./pixso-dsl-client.js";

export interface PixsoNodeRef {
  fileKey: string;
  guid: string;
  canonicalUrl: string;
}

export function parsePixsoUrl(input: string): PixsoNodeRef {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw invalidUrl("Pixso URL is malformed", error);
  }

  const pathMatch = /^\/app\/design\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  const guid = url.searchParams.get("item-id");

  if (
    url.protocol !== "https:" ||
    url.hostname !== "pixso.net" ||
    !pathMatch ||
    !guid ||
    !/^[A-Za-z0-9:_-]+$/.test(guid)
  ) {
    throw invalidUrl(
      "Expected an HTTPS pixso.net design URL with a valid item-id",
    );
  }

  const fileKey = pathMatch[1];
  if (!fileKey) {
    throw invalidUrl("Pixso design URL does not contain a file key");
  }

  const canonical = new URL(
    `https://pixso.net/app/design/${encodeURIComponent(fileKey)}`,
  );
  canonical.searchParams.set("item-id", guid);

  return {
    fileKey,
    guid,
    canonicalUrl: canonical.toString(),
  };
}

function invalidUrl(message: string, cause?: unknown): PixsoProviderError {
  const code: PixsoProviderErrorCode = "PIXSO_URL_INVALID";
  return new PixsoProviderError(code, message, { cause });
}
