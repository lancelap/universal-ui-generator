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
  return new Map(
    (root.props as PixsoRecord[]).map((record) => [
      record.pathString as string,
      record,
    ]),
  );
}
