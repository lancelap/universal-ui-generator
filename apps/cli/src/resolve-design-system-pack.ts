import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const packsRoot = fileURLToPath(
  new URL("../../../design-system-packs", import.meta.url),
);

export function resolveDesignSystemPackPath(value: string): string {
  if (
    isAbsolute(value) ||
    value.startsWith(".") ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    return value;
  }
  return join(packsRoot, value);
}
