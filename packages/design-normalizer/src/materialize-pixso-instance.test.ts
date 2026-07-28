import { describe, expect, it } from "vitest";

import type { PixsoRecord } from "./pixso-types.js";
import { materializePixsoRoot } from "./materialize-pixso-instance.js";

describe("materializePixsoRoot", () => {
  it("inherits a missing component default and preserves an explicit instance override", () => {
    const definition = componentDefinition();
    const instance = actionGroupInstance();
    const original = structuredClone({ definition, instance });

    const result = materializePixsoRoot({
      root: instance,
      componentDefinitions: [definition],
    });
    const records = flatProperties(result.root);
    const secondary = records.get("secondary/secondary-label")!;
    const primary = records.get("primary/primary-label")!;

    expect(secondary.nodeText).toBe("Cancel default");
    expect(primary.nodeText).toBe("Confirm override");
    expect(result.origins.get(secondary)?.get("nodeText")).toMatchObject({
      kind: "component-default",
      sourceNodeId: "secondary-label",
      componentKey: "ActionGroup",
      componentDefinitionNodeId: "definition",
      sourcePropertyPath: "secondary/secondary-label",
    });
    expect(result.origins.get(primary)?.get("nodeText")).toMatchObject({
      kind: "instance-override",
      sourceNodeId: "primary-label",
      componentKey: "ActionGroup",
      componentDefinitionNodeId: "definition",
      sourcePropertyPath: "primary/primary-label",
    });
    expect({ definition, instance }).toEqual(original);
  });

  it("treats false, zero, empty string, empty array, and null as explicit overrides", () => {
    const definition = componentDefinition();
    const defaultPrimary = (
      (definition.childNode as PixsoRecord[])[1]!.props as PixsoRecord[]
    )[0]!;
    Object.assign(defaultPrimary, {
      enabled: true,
      count: 10,
      description: "Default",
      choices: ["default"],
      optional: "present",
    });
    const instance = actionGroupInstance();
    const instancePrimary = (instance.props as PixsoRecord[])[1]!;
    Object.assign(instancePrimary, {
      enabled: false,
      count: 0,
      description: "",
      choices: [],
      optional: null,
    });

    const result = materializePixsoRoot({
      root: instance,
      componentDefinitions: [definition],
    });
    const primary = flatProperties(result.root).get("primary/primary-label")!;

    expect(primary).toMatchObject({
      enabled: false,
      count: 0,
      description: "",
      choices: [],
      optional: null,
    });
    for (const field of [
      "enabled",
      "count",
      "description",
      "choices",
      "optional",
    ]) {
      expect(result.origins.get(primary)?.get(field)?.kind).toBe(
        "instance-override",
      );
    }
  });

  it("recursively merges plain objects and atomically replaces arrays", () => {
    const definition = componentDefinition();
    const defaultPrimary = (
      (definition.childNode as PixsoRecord[])[1]!.props as PixsoRecord[]
    )[0]!;
    defaultPrimary.configuration = {
      presentation: { size: "large", tone: "accent" },
      values: ["default"],
    };
    const instance = actionGroupInstance();
    const instancePrimary = (instance.props as PixsoRecord[])[1]!;
    instancePrimary.configuration = {
      presentation: { tone: "neutral" },
      values: [],
    };

    const result = materializePixsoRoot({
      root: instance,
      componentDefinitions: [definition],
    });
    const primary = flatProperties(result.root).get("primary/primary-label")!;

    expect(primary.configuration).toEqual({
      presentation: { size: "large", tone: "neutral" },
      values: [],
    });
  });

  it("reconstructs flattened properties into a stable visual hierarchy", () => {
    const properties = [
      visual("secondary/label", "secondary-label", 16, 12, 80, 16),
      visual("primary", "primary-symbol", 329, 0, 231, 40),
      visual("secondary", "secondary-symbol", 207, 0, 114, 40),
      visual("primary/label", "primary-label", 48, 12, 167, 16),
    ];
    const outputs = permutations(properties).map(
      (props) =>
        materializePixsoRoot({
          root: {
            guid: "actions",
            type: "INSTANCE",
            props,
          },
          componentDefinitions: [],
        }).root,
    );

    for (const root of outputs) {
      expect(root.props).toBeUndefined();
      const children = root.childNode as PixsoRecord[];
      expect(children.map((node) => node.pathString)).toEqual([
        "secondary",
        "primary",
      ]);
      expect((children[0]!.childNode as PixsoRecord[])[0]!.pathString).toBe(
        "secondary/label",
      );
      expect((children[1]!.childNode as PixsoRecord[])[0]!.pathString).toBe(
        "primary/label",
      );
    }
    expect(outputs).toEqual(outputs.map(() => outputs[0]));
  });

  it.each(["", "secondary//label", "secondary/./label", "../label"])(
    "rejects invalid property path %j",
    (pathString) => {
      expect(() =>
        materializePixsoRoot({
          root: {
            guid: "actions",
            type: "INSTANCE",
            props: [visual(pathString, "label", 0, 0, 80, 16)],
          },
          componentDefinitions: [],
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "PIXSO_PROPERTY_PATH_INVALID",
        }),
      );
    },
  );

  it("rejects incompatible records at one canonical property path", () => {
    expect(() =>
      materializePixsoRoot({
        root: {
          guid: "actions",
          type: "INSTANCE",
          props: [
            visual("button", "first", 0, 0, 80, 40),
            visual("button", "second", 0, 0, 80, 40),
          ],
        },
        componentDefinitions: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "PIXSO_PROPERTY_IDENTITY_CONFLICT",
      }),
    );
  });

  it("rejects ambiguous top-level component definitions", () => {
    expect(() =>
      materializePixsoRoot({
        root: { guid: "instance", componentKey: "Button", type: "INSTANCE" },
        componentDefinitions: [
          { guid: "first", componentKey: "Button", type: "SYMBOL" },
          { guid: "second", componentKey: "Button", type: "SYMBOL" },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
      }),
    );
  });

  it("rejects a component-definition inheritance cycle", () => {
    const definitions = [
      {
        guid: "definition-a",
        componentKey: "A",
        type: "SYMBOL",
        childNode: [
          {
            guid: "instance-b",
            componentKey: "B",
            type: "INSTANCE",
            childNode: [],
          },
        ],
      },
      {
        guid: "definition-b",
        componentKey: "B",
        type: "SYMBOL",
        childNode: [
          {
            guid: "instance-a",
            componentKey: "A",
            type: "INSTANCE",
            childNode: [],
          },
        ],
      },
    ];

    expect(() =>
      materializePixsoRoot({
        root: {
          guid: "root-a",
          componentKey: "A",
          type: "INSTANCE",
          childNode: [],
        },
        componentDefinitions: definitions,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "PIXSO_COMPONENT_INHERITANCE_CYCLE",
      }),
    );
  });
});

function componentDefinition(): PixsoRecord {
  return {
    guid: "definition",
    componentKey: "ActionGroup",
    type: "SYMBOL",
    childNode: [
      {
        guid: "secondary",
        type: "INSTANCE",
        props: [
          {
            componentId: "secondary-label",
            pathString: "secondary-label",
            type: "TEXT",
            nodeText: "Cancel default",
            visible: true,
            left: 16,
            top: 12,
            width: 80,
            height: 16,
          },
        ],
      },
      {
        guid: "primary",
        type: "INSTANCE",
        props: [
          {
            componentId: "primary-label",
            pathString: "primary-label",
            type: "TEXT",
            nodeText: "Save default",
            visible: true,
            left: 16,
            top: 12,
            width: 80,
            height: 16,
          },
        ],
      },
    ],
  };
}

function actionGroupInstance(): PixsoRecord {
  return {
    guid: "actions",
    componentKey: "ActionGroup",
    type: "INSTANCE",
    props: [
      {
        componentId: "secondary-label",
        pathString: "secondary/secondary-label",
        type: "TEXT",
        visible: true,
        left: 16,
        top: 12,
        width: 80,
        height: 16,
      },
      {
        componentId: "primary-label",
        pathString: "primary/primary-label",
        type: "TEXT",
        nodeText: "Confirm override",
        visible: true,
        left: 16,
        top: 12,
        width: 120,
        height: 16,
      },
    ],
  };
}

function flatProperties(root: PixsoRecord): Map<string, PixsoRecord> {
  const records = new Map<string, PixsoRecord>();
  const visit = (node: PixsoRecord): void => {
    if (typeof node.pathString === "string") {
      records.set(node.pathString, node);
    }
    if (Array.isArray(node.props)) {
      node.props.filter(isRecord).forEach(visit);
    }
    if (Array.isArray(node.childNode)) {
      node.childNode.filter(isRecord).forEach(visit);
    }
  };
  visit(root);
  return records;
}

function visual(
  pathString: string,
  componentId: string,
  left: number,
  top: number,
  width: number,
  height: number,
): PixsoRecord {
  return {
    componentId,
    pathString,
    type: "SYMBOL",
    visible: true,
    left,
    top,
    width,
    height,
  };
}

function permutations<T>(values: T[]): T[][] {
  if (values.length <= 1) {
    return [values];
  }
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map(
      (rest) => [value, ...rest],
    ),
  );
}

function isRecord(value: unknown): value is PixsoRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
