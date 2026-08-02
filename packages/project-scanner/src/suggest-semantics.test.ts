import { describe, expect, it } from "vitest";

import type { VerifiedProjectComponent } from "@uig/contracts";

import { suggestProjectSemantics } from "./suggest-semantics.js";

function component(name = "AppRadioGroup"): VerifiedProjectComponent {
  return {
    id: `project:@/shared/ui#${name}`,
    kind: "react-component",
    framework: "react",
    availability: "verified",
    import: { source: "@/shared/ui", export: name, style: "named" },
    contract: {
      propsType: `${name}Props`,
      acceptsChildren: false,
      props: ["onChange", "options", "value"].map((prop) => ({
        name: prop,
        required: true,
        type: { kind: "string" as const },
        deprecated: false,
      })),
    },
    semantics: [],
    capabilities: [],
    formAdapters: [],
    evidence: [
      { kind: "public-export", path: "src/shared/ui/index.ts", export: name },
    ],
  };
}

const vocabulary = {
  roles: new Set(["choicePanel"]),
  capabilities: new Set(["single-selection", "value", "change"]),
  formAdapters: new Set(["controlled"]),
};

describe("suggestProjectSemantics", () => {
  it("suggests choicePanel for a verified controlled radio group", () => {
    const result = suggestProjectSemantics({
      component: component(),
      vocabulary,
    });
    expect(result.semanticRoles).toContainEqual({
      role: "choicePanel",
      status: "suggested",
      confidence: 0.86,
      evidence: [
        { kind: "component-name", value: "AppRadioGroup" },
        { kind: "prop-shape", value: "options,value,onChange" },
      ],
    });
    expect(result.semanticRoles).not.toContainEqual(
      expect.objectContaining({ role: "single-selection-collection" }),
    );
    expect(result.capabilities.map((entry) => entry.name)).toEqual([
      "change",
      "single-selection",
      "value",
    ]);
    expect(result.formAdapters.map((entry) => entry.name)).toEqual([
      "controlled",
    ]);
  });

  it("omits every term that is absent from selected-pack vocabulary", () => {
    const result = suggestProjectSemantics({
      component: component(),
      vocabulary: {
        roles: new Set(),
        capabilities: new Set(),
        formAdapters: new Set(),
      },
    });
    expect(result).toEqual({
      semanticRoles: [],
      capabilities: [],
      formAdapters: [],
      diagnostics: [],
    });
  });

  it("is stable when prop declaration order changes", () => {
    const first = component();
    const second = structuredClone(first);
    second.contract.props.reverse();
    expect(suggestProjectSemantics({ component: second, vocabulary })).toEqual(
      suggestProjectSemantics({ component: first, vocabulary }),
    );
  });

  it("does not invent action semantics for an Upload component", () => {
    const result = suggestProjectSemantics({
      component: component("Upload"),
      vocabulary,
    });
    expect(result.semanticRoles).toEqual([]);
  });
});
