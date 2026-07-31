import { describe, expect, it } from "vitest";

import {
  ContractValidationError,
  DesignSystemPackV2Schema,
  type ReactRenderRecipes,
  ReactRenderRecipesSchema,
  ReactRenderRecipesV2Schema,
  ReactStylePolicySchema,
  validateWithSchema,
} from "./index.js";

function staticPropsFromV2ReadUnion(
  recipes: ReactRenderRecipes,
): { target: string }[] {
  if (recipes.schema !== "react-render-recipes/v2") {
    return [];
  }
  return recipes.components[0]?.staticProps ?? [];
}

const provenance = {
  kind: "verified-public-api",
  source: "test fixture declaration",
};

const componentRecipe = {
  componentId: "base.Button",
  content: { source: "content.label", target: "children" },
  stateProps: [
    {
      source: "state.disabled",
      target: "disabled",
      valueType: "boolean",
    },
  ],
  eventProps: [{ source: "activate", target: "onClick" }],
  classNameProp: "className",
  semanticChildrenPolicy: "forbidden",
  wrapper: "allowed",
  provenance,
} as const;

const recipesFixture = {
  schema: "react-render-recipes/v1",
  components: [componentRecipe],
  compositions: [
    {
      compositionId: "base-dialog",
      rootComponentId: "base.Dialog",
      slots: [
        {
          name: "body",
          componentId: "base.DialogBody",
          acceptsRemaining: true,
          cardinality: "many",
        },
      ],
      provenance,
    },
  ],
} as const;

const recipesV2Fixture = {
  schema: "react-render-recipes/v2",
  components: [
    {
      componentId: "base.Autocomplete",
      staticProps: [
        {
          target: "options",
          value: { kind: "empty-array" },
          reason: "render-only",
        },
        {
          target: "onChange",
          value: { kind: "noop" },
          reason: "render-only",
        },
      ],
      stateProps: [],
      eventProps: [{ source: "change", target: "onChange" }],
      semanticChildrenPolicy: "forbidden",
      wrapper: "allowed",
      provenance: { kind: "canonical-library-doc", source: "Autocomplete.md" },
    },
  ],
  compositions: [],
} as const;

const singleSelectionCollectionRecipe = {
  kind: "single-selection-collection",
  semanticRole: "choicePanel",
  rootComponentId: "base.RadioGroup",
  optionComponentId: "base.RadioButton",
  layoutComponentId: "base.Stack",
  titleComponentId: "base.Typography",
  descriptionComponentId: "base.FormDescription",
  leadingAssetComponentId: "icon.DocumentText",
  trailingAssetComponentId: "icon.Info",
  sources: {
    title: "content.title",
    sections: "content.sections",
    selectedValue: "state.selectedOptionId",
  },
  rootProps: {
    valueTarget: "value",
    emptyValue: "",
    onChangeTarget: "onChange",
    onChangeValue: "noop",
    directionTarget: "direction",
    directionValue: "column",
    groupNameTarget: "groupName",
    groupNameSource: "content.title",
  },
  optionProps: {
    valueTarget: "value",
    valueSource: "option.id",
  },
  provenance,
} as const;

const stylePolicyFixture = {
  schema: "react-style-policy/v1",
  defaults: {
    layout: { allowed: ["display", "flexDirection", "gap", "padding"] },
    appearance: { allowed: [] },
    internalSelectors: false,
    inlineStyles: false,
  },
  components: [
    {
      componentId: "base.Button",
      layout: { allowed: ["width"] },
      appearance: { allowed: [] },
      wrapper: "allowed",
    },
  ],
  fallback: {
    layout: "all-supported",
    appearance: "all-supported",
  },
  provenance: {
    kind: "approved-pack-policy",
    source: "test style policy review",
  },
} as const;

const packFixture = {
  schema: "design-system-pack/v2",
  id: "test-ui",
  name: "Test UI",
  version: "2.0.0",
  framework: "react",
  files: {
    catalog: "catalog.json",
    semanticPolicy: "semantic-policy.json",
    pixsoMap: "pixso-map.json",
    compositionRules: "composition-rules.json",
    tokens: "tokens.json",
    verification: "verification.json",
    reactRenderRecipes: "react-render-recipes.json",
    reactStylePolicy: "react-style-policy.json",
  },
} as const;

describe("React pack contracts", () => {
  it("accepts minimal recipes, style policy, and pack v2", () => {
    expect(
      validateWithSchema(ReactRenderRecipesSchema, recipesFixture),
    ).toEqual(recipesFixture);
    expect(
      validateWithSchema(ReactStylePolicySchema, stylePolicyFixture),
    ).toEqual(stylePolicyFixture);
    expect(validateWithSchema(DesignSystemPackV2Schema, packFixture)).toEqual(
      packFixture,
    );
  });

  it("accepts render-only recipe v2 and preserves the v1 fixture", () => {
    expect(
      validateWithSchema(ReactRenderRecipesV2Schema, recipesV2Fixture),
    ).toEqual(recipesV2Fixture);
    expect(
      validateWithSchema(ReactRenderRecipesSchema, recipesV2Fixture),
    ).toEqual(recipesV2Fixture);
    expect(
      validateWithSchema(ReactRenderRecipesSchema, recipesFixture),
    ).toEqual(recipesFixture);
  });

  it("accepts an optional semantic content mapping in recipe v2", () => {
    expect(
      validateWithSchema(ReactRenderRecipesV2Schema, {
        ...recipesV2Fixture,
        components: [
          {
            ...recipesV2Fixture.components[0],
            content: {
              source: "content.label",
              target: "placeholder",
              required: false,
            },
          },
        ],
      }),
    ).toMatchObject({
      components: [
        {
          content: {
            source: "content.label",
            target: "placeholder",
            required: false,
          },
        },
      ],
    });
  });

  it("accepts the bounded single-selection collection recipe", () => {
    expect(
      validateWithSchema(ReactRenderRecipesV2Schema, {
        ...recipesV2Fixture,
        singleSelectionCollections: [singleSelectionCollectionRecipe],
      }),
    ).toMatchObject({
      singleSelectionCollections: [singleSelectionCollectionRecipe],
    });
  });

  it.each([
    ["unknown recipe field", { executableTemplate: "options.map(render)" }],
    ["unknown recipe kind", { kind: "collection-template" }],
    ["unsupported semantic role", { semanticRole: "radioList" }],
    [
      "arbitrary title source",
      {
        sources: {
          ...singleSelectionCollectionRecipe.sources,
          title: "content.jsonPath",
        },
      },
    ],
    [
      "arbitrary selected source",
      {
        sources: {
          ...singleSelectionCollectionRecipe.sources,
          selectedValue: "state.value",
        },
      },
    ],
    [
      "executable option source",
      {
        optionProps: {
          ...singleSelectionCollectionRecipe.optionProps,
          valueSource: "eval(option.id)",
        },
      },
    ],
  ] as const)("rejects %s in a structured recipe", (_label, change) => {
    expect(() =>
      validateWithSchema(ReactRenderRecipesV2Schema, {
        ...recipesV2Fixture,
        singleSelectionCollections: [
          { ...singleSelectionCollectionRecipe, ...change },
        ],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("narrows the read union to v2 static props", () => {
    const recipes: ReactRenderRecipes = validateWithSchema(
      ReactRenderRecipesSchema,
      recipesV2Fixture,
    );

    expect(staticPropsFromV2ReadUnion(recipes)).toEqual(
      recipesV2Fixture.components[0].staticProps,
    );
  });

  it.each([
    ["source", { source: "state.options" }],
    ["expression", { expression: "options.map(toOption)" }],
    ["non-empty array", { value: { kind: "literal", value: ["one"] } }],
    ["object", { value: { kind: "literal", value: { nested: true } } }],
    [
      "unknown kind",
      { value: { kind: "expression", value: "options.map(toOption)" } },
    ],
  ] as const)("rejects render-only static prop %s values", (_label, change) => {
    expect(() =>
      validateWithSchema(ReactRenderRecipesV2Schema, {
        ...recipesV2Fixture,
        components: [
          {
            ...recipesV2Fixture.components[0],
            staticProps: [
              {
                ...recipesV2Fixture.components[0].staticProps[0],
                ...change,
              },
            ],
          },
        ],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("rejects an arbitrary content source", () => {
    expect(() =>
      validateWithSchema(ReactRenderRecipesSchema, {
        ...recipesFixture,
        components: [
          {
            ...componentRecipe,
            content: {
              ...componentRecipe.content,
              source: "content.jsonPath",
            },
          },
        ],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("rejects executable JSX fields", () => {
    expect(() =>
      validateWithSchema(ReactRenderRecipesSchema, {
        ...recipesFixture,
        components: [{ ...componentRecipe, jsx: "<Button />" }],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("requires component and composition provenance", () => {
    const { provenance: _componentProvenance, ...withoutProvenance } =
      componentRecipe;
    const { provenance: _compositionProvenance, ...composition } =
      recipesFixture.compositions[0];

    expect(() =>
      validateWithSchema(ReactRenderRecipesSchema, {
        ...recipesFixture,
        components: [withoutProvenance],
      }),
    ).toThrowError(ContractValidationError);
    expect(() =>
      validateWithSchema(ReactRenderRecipesSchema, {
        ...recipesFixture,
        compositions: [composition],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("requires every composition slot to declare exactly one routing rule", () => {
    const slot = recipesFixture.compositions[0].slots[0];
    const { acceptsRemaining: _removed, ...withoutRouting } = slot;

    expect(() =>
      validateWithSchema(ReactRenderRecipesSchema, {
        ...recipesFixture,
        compositions: [
          {
            ...recipesFixture.compositions[0],
            slots: [withoutRouting],
          },
        ],
      }),
    ).toThrowError(ContractValidationError);

    expect(() =>
      validateWithSchema(ReactRenderRecipesSchema, {
        ...recipesFixture,
        compositions: [
          {
            ...recipesFixture.compositions[0],
            slots: [{ ...slot, acceptsRoles: ["content"] }],
          },
        ],
      }),
    ).toThrowError(ContractValidationError);
  });

  it("rejects unsupported CSS properties", () => {
    expect(() =>
      validateWithSchema(ReactStylePolicySchema, {
        ...stylePolicyFixture,
        defaults: {
          ...stylePolicyFixture.defaults,
          appearance: { allowed: ["filter"] },
        },
      }),
    ).toThrowError(ContractValidationError);
  });

  it.each([
    ["internalSelectors", true],
    ["inlineStyles", true],
  ] as const)("rejects %s", (field, value) => {
    expect(() =>
      validateWithSchema(ReactStylePolicySchema, {
        ...stylePolicyFixture,
        defaults: {
          ...stylePolicyFixture.defaults,
          [field]: value,
        },
      }),
    ).toThrowError(ContractValidationError);
  });

  it("rejects an unknown semantic children policy", () => {
    expect(() =>
      validateWithSchema(ReactRenderRecipesSchema, {
        ...recipesFixture,
        components: [{ ...componentRecipe, semanticChildrenPolicy: "guess" }],
      }),
    ).toThrowError(ContractValidationError);
  });

  it.each(["reactRenderRecipes", "reactStylePolicy"] as const)(
    "rejects an absolute %s path",
    (field) => {
      expect(() =>
        validateWithSchema(DesignSystemPackV2Schema, {
          ...packFixture,
          files: {
            ...packFixture.files,
            [field]: "/private/pack/file.json",
          },
        }),
      ).toThrowError(ContractValidationError);
    },
  );
});
