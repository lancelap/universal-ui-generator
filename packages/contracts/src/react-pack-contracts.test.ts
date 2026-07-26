import { describe, expect, it } from "vitest";

import {
  ContractValidationError,
  DesignSystemPackV2Schema,
  ReactRenderRecipesSchema,
  ReactStylePolicySchema,
  validateWithSchema,
} from "./index.js";

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
    expect(validateWithSchema(ReactRenderRecipesSchema, recipesFixture)).toEqual(
      recipesFixture,
    );
    expect(validateWithSchema(ReactStylePolicySchema, stylePolicyFixture)).toEqual(
      stylePolicyFixture,
    );
    expect(validateWithSchema(DesignSystemPackV2Schema, packFixture)).toEqual(
      packFixture,
    );
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
        components: [
          { ...componentRecipe, semanticChildrenPolicy: "guess" },
        ],
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
