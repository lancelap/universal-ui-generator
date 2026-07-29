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

  it("indexes nested Pixso variant definitions before resolving instance defaults", () => {
    const variant = componentDefinition();
    const variantChildren = variant.childNode;
    const componentSet = {
      guid: "component-set",
      componentKey: "ModalAction",
      type: "SYMBOL",
      childNode: [
        {
          ...variant,
          guid: "variant-default",
          componentNormName: "VariantDefault",
          childNode: [
            {
              guid: "container",
              type: "FRAME",
              childNode: [
                {
                  guid: "right-content",
                  type: "FRAME",
                  childNode: variantChildren,
                },
              ],
            },
          ],
        },
      ],
    };
    const instance = {
      ...actionGroupInstance(),
      componentNormName: "VariantDefault",
    };

    const result = materializePixsoRoot({
      root: instance,
      componentDefinitions: [componentSet],
    });
    const records = flatProperties(result.root);

    expect(records.get("secondary/secondary-label")?.nodeText).toBe(
      "Cancel default",
    );
    expect(
      result.origins
        .get(records.get("secondary/secondary-label")!)
        ?.get("nodeText"),
    ).toMatchObject({
      kind: "component-default",
      componentDefinitionNodeId: "variant-default",
    });
    expect(
      result.origins
        .get(records.get("primary/primary-label")!)
        ?.get("nodeText"),
    ).toMatchObject({
      kind: "instance-override",
      componentDefinitionNodeId: "variant-default",
    });
  });

  it("resolves one exact keyless SYMBOL definition and preserves field origins", () => {
    const definition = keylessDefinition({
      guid: "31:100831",
      normName: "Component_31_100831",
      props: [
        textProperty({
          path: "27:101325/4:63130",
          text: "Default copy",
          left: 0,
          top: 20,
          width: 561,
          height: 32,
        }),
      ],
    });
    const instance = keylessInstance({
      guid: "70:118899",
      normName: "Component_31_100831",
      props: [
        textProperty({
          path: "27:101325/4:63130",
          text: "Instance copy",
        }),
      ],
    });
    const original = structuredClone({ definition, instance });

    const result = materializePixsoRoot({
      root: instance,
      componentDefinitions: [definition],
    });
    const property = flatProperties(result.root).get("27:101325/4:63130")!;

    expect(property).toMatchObject({
      nodeText: "Instance copy",
      left: 0,
      top: 20,
      width: 561,
      height: 32,
    });
    expect(result.origins.get(property)?.get("nodeText")).toMatchObject({
      kind: "instance-override",
      sourceNodeId: "4:63130",
      sourcePropertyPath: "27:101325/4:63130",
      componentDefinitionNodeId: "31:100831",
    });
    expect(result.origins.get(property)?.get("width")).toMatchObject({
      kind: "component-default",
      sourceNodeId: "4:63130",
      sourcePropertyPath: "27:101325/4:63130",
      componentDefinitionNodeId: "31:100831",
    });
    expect(result.origins.get(property)?.get("nodeText")).not.toHaveProperty(
      "componentKey",
    );
    expect(result.origins.get(property)?.get("width")).not.toHaveProperty(
      "componentKey",
    );
    expect({ definition, instance }).toEqual(original);
  });

  it("keeps a non-empty componentKey authoritative over a norm-only candidate", () => {
    const keyed = {
      ...keylessDefinition({
        guid: "keyed-definition",
        normName: "DifferentVariant",
        props: [textProperty({ path: "label", text: "Keyed default" })],
      }),
      componentKey: "authoritative-key",
    };
    const normOnly = keylessDefinition({
      guid: "norm-definition",
      normName: "SharedNorm",
      props: [textProperty({ path: "label", text: "Norm default" })],
    });
    const instance = keylessInstance({
      guid: "instance",
      componentKey: "authoritative-key",
      normName: "SharedNorm",
      props: [textProperty({ path: "label" })],
    });

    const result = materializePixsoRoot({
      root: instance,
      componentDefinitions: [normOnly, keyed],
    });

    expect(flatProperties(result.root).get("label")?.nodeText).toBe(
      "Keyed default",
    );
  });

  it("does not use keyed or non-SYMBOL records as norm-only definitions", () => {
    const keyedSymbol = {
      ...keylessDefinition({
        guid: "keyed",
        normName: "SharedNorm",
        props: [textProperty({ path: "label", text: "Wrong keyed" })],
      }),
      componentKey: "another-key",
    };
    const keylessInstanceRecord = {
      ...keylessDefinition({
        guid: "not-a-symbol",
        normName: "SharedNorm",
        props: [textProperty({ path: "label", text: "Wrong type" })],
      }),
      type: "INSTANCE",
    };
    const root = keylessInstance({
      guid: "root",
      normName: "SharedNorm",
      props: [textProperty({ path: "label" })],
    });

    const result = materializePixsoRoot({
      root,
      componentDefinitions: [keyedSymbol, keylessInstanceRecord],
    });

    expect(flatProperties(result.root).get("label")).not.toHaveProperty(
      "nodeText",
    );
  });

  it("does not use a keyed non-SYMBOL record as a keyed definition", () => {
    const root = keylessInstance({
      guid: "root",
      componentKey: "SharedKey",
      props: [textProperty({ path: "label" })],
    });
    const notASymbol = {
      ...keylessDefinition({
        guid: "not-a-symbol",
        normName: "SharedNorm",
        props: [textProperty({ path: "label", text: "Wrong default" })],
      }),
      componentKey: "SharedKey",
      type: "INSTANCE",
    };

    const result = materializePixsoRoot({
      root,
      componentDefinitions: [notASymbol],
    });

    expect(flatProperties(result.root).get("label")).not.toHaveProperty(
      "nodeText",
    );
  });

  it.each([
    { componentNormName: undefined },
    { componentNormName: null },
    { componentNormName: "" },
    { componentNormName: "DifferentNorm" },
  ])(
    "does not fall back without an exact non-empty norm: $componentNormName",
    ({ componentNormName }) => {
      const root = {
        ...keylessInstance({
          guid: "root",
          props: [textProperty({ path: "label" })],
        }),
        componentNormName,
      };
      const result = materializePixsoRoot({
        root,
        componentDefinitions: [
          keylessDefinition({
            guid: "definition",
            normName: "SharedNorm",
            props: [textProperty({ path: "label", text: "Wrong default" })],
          }),
        ],
      });

      expect(flatProperties(result.root).get("label")).not.toHaveProperty(
        "nodeText",
      );
    },
  );

  it("keeps falsy and null values as overrides after keyless resolution", () => {
    const fields = {
      enabled: false,
      count: 0,
      description: "",
      choices: [],
      optional: null,
    };
    const definition = keylessDefinition({
      guid: "definition",
      normName: "SharedNorm",
      props: [
        {
          ...textProperty({ path: "label", text: "Default" }),
          enabled: true,
          count: 10,
          description: "Default",
          choices: ["default"],
          optional: "default",
        },
      ],
    });
    const instance = keylessInstance({
      guid: "root",
      normName: "SharedNorm",
      props: [{ ...textProperty({ path: "label" }), ...fields }],
    });

    const result = materializePixsoRoot({
      root: instance,
      componentDefinitions: [definition],
    });
    const property = flatProperties(result.root).get("label")!;

    expect(property).toMatchObject(fields);
    for (const field of Object.keys(fields)) {
      expect(result.origins.get(property)?.get(field)?.kind).toBe(
        "instance-override",
      );
    }
  });

  it("blocks ambiguous keyless norm definitions with stable candidate evidence", () => {
    const definitions = [
      keylessDefinition({
        guid: "definition-b",
        normName: "SharedNorm",
      }),
      keylessDefinition({
        guid: "definition-a",
        normName: "SharedNorm",
      }),
    ];
    const root = keylessInstance({
      guid: "root",
      normName: "SharedNorm",
    });

    const errors = permutations(definitions).map((componentDefinitions) => {
      try {
        materializePixsoRoot({ root, componentDefinitions });
        throw new Error("expected ambiguity");
      } catch (error) {
        expect(error).toMatchObject({
          code: "PIXSO_COMPONENT_DEFINITION_AMBIGUOUS",
        });
        return (error as Error).message;
      }
    });

    expect(new Set(errors)).toEqual(
      new Set([
        "Pixso componentNormName SharedNorm has 2 keyless SYMBOL definitions: definition-a, definition-b",
      ]),
    );
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

  it("rejects a keyless component-definition inheritance cycle", () => {
    const definitionA = keylessDefinition({
      guid: "definition-a",
      normName: "NormA",
      childNode: [
        keylessInstance({
          guid: "nested-b",
          normName: "NormB",
        }),
      ],
    });
    const definitionB = keylessDefinition({
      guid: "definition-b",
      normName: "NormB",
      childNode: [
        keylessInstance({
          guid: "nested-a",
          normName: "NormA",
        }),
      ],
    });
    const root = keylessInstance({
      guid: "root",
      normName: "NormA",
    });

    let caught: unknown;
    try {
      materializePixsoRoot({
        root,
        componentDefinitions: [definitionB, definitionA],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "PIXSO_COMPONENT_INHERITANCE_CYCLE",
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(
      "norm:NormA -> norm:NormB -> norm:NormA",
    );
  });

  it("keeps key and norm cycle identities in separate namespaces", () => {
    const keyedDefinition = {
      ...keylessDefinition({
        guid: "keyed-definition",
        normName: "Variant",
        childNode: [
          keylessInstance({
            guid: "nested-norm",
            normName: "shared",
          }),
        ],
      }),
      componentKey: "shared",
    };
    const normDefinition = keylessDefinition({
      guid: "norm-definition",
      normName: "shared",
    });
    const root = keylessInstance({
      guid: "root",
      componentKey: "shared",
      normName: "Variant",
    });

    expect(() =>
      materializePixsoRoot({
        root,
        componentDefinitions: [keyedDefinition, normDefinition],
      }),
    ).not.toThrow();
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

function keylessDefinition(input: {
  guid: string;
  normName: string;
  props?: PixsoRecord[];
  childNode?: PixsoRecord[];
}): PixsoRecord {
  return {
    guid: input.guid,
    name: input.guid,
    type: "SYMBOL",
    componentKey: null,
    componentNormName: input.normName,
    ...(input.props ? { props: input.props } : {}),
    ...(input.childNode ? { childNode: input.childNode } : {}),
  };
}

function keylessInstance(input: {
  guid: string;
  normName?: string;
  componentKey?: string | null;
  props?: PixsoRecord[];
}): PixsoRecord {
  return {
    guid: input.guid,
    name: input.guid,
    type: "INSTANCE",
    componentKey: input.componentKey ?? null,
    ...(input.normName
      ? { componentNormName: input.normName }
      : { componentNormName: null }),
    props: input.props ?? [],
  };
}

function textProperty(input: {
  path: string;
  text?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}): PixsoRecord {
  return {
    componentId: input.path.split("/").at(-1),
    pathString: input.path,
    type: "TEXT",
    ...(input.text === undefined ? {} : { nodeText: input.text }),
    ...(input.left === undefined ? {} : { left: input.left }),
    ...(input.top === undefined ? {} : { top: input.top }),
    ...(input.width === undefined ? {} : { width: input.width }),
    ...(input.height === undefined ? {} : { height: input.height }),
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
