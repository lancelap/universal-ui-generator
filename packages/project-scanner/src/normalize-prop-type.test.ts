import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";
import ts from "typescript";

import { normalizeType } from "./normalize-prop-type.js";

it("normalizes supported structures and bounds unresolved generics", () => {
  const workspace = resolve(
    fileURLToPath(new URL("./__fixtures__/react-public-api", import.meta.url)),
  );
  const source = ts.createSourceFile(
    "types.ts",
    "type Value = [string, number[]];",
    ts.ScriptTarget.Latest,
    true,
  );
  const host = ts.createCompilerHost({ strict: true });
  const original = host.getSourceFile;
  host.getSourceFile = (name, language) =>
    name === "types.ts" ? source : original(name, language);
  const program = ts.createProgram(
    ["types.ts"],
    { strict: true, baseUrl: workspace },
    host,
  );
  const checker = program.getTypeChecker();
  const alias = source.statements[0] as ts.TypeAliasDeclaration;
  expect(
    normalizeType({
      checker,
      type: checker.getTypeAtLocation(alias),
      location: alias,
    }),
  ).toEqual({
    kind: "tuple",
    elements: [
      { kind: "string" },
      { kind: "array", element: { kind: "number" } },
    ],
  });
});
