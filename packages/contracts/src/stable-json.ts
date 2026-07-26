function canonicalize(
  value: unknown,
  ancestors: ReadonlySet<object>,
  path: string,
): unknown {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(`Unsupported JSON value at ${path}`);
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`Non-finite number at ${path}`);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError(`Circular JSON value at ${path}`);
    }

    const nextAncestors = new Set(ancestors).add(value);
    return value.map((item, index) =>
      canonicalize(item, nextAncestors, `${path}/${index}`),
    );
  }

  if (typeof value === "object") {
    if (ancestors.has(value)) {
      throw new TypeError(`Circular JSON value at ${path}`);
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Unsupported object prototype at ${path}`);
    }

    const nextAncestors = new Set(ancestors).add(value);
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(
        (value as Record<string, unknown>)[key],
        nextAncestors,
        `${path}/${key}`,
      );
    }

    return result;
  }

  throw new TypeError(`Unsupported JSON value at ${path}`);
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(canonicalize(value, new Set(), ""), null, 2)}\n`;
}
