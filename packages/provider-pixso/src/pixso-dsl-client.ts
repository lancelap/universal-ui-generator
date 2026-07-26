export interface PixsoDslClient {
  getNodeDsl(input: { fileKey: string; guid: string }): Promise<Uint8Array>;
}

export type PixsoProviderErrorCode =
  | "PIXSO_URL_INVALID"
  | "PIXSO_TOKEN_MISSING"
  | "PIXSO_AUTH_FAILED"
  | "PIXSO_NODE_NOT_FOUND"
  | "PIXSO_REQUEST_FAILED"
  | "PIXSO_RESPONSE_INVALID";

export class PixsoProviderError extends Error {
  readonly name = "PixsoProviderError";

  constructor(
    readonly code: PixsoProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
