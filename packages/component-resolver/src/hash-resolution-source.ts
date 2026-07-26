import { stableStringify } from "@uig/contracts";
import { sha256 } from "@uig/design-context";

export function hashResolutionSource(value: unknown): string {
  return sha256(stableStringify(value));
}
