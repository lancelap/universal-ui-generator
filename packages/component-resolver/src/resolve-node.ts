import type { LoadedDesignSystemPack } from "@uig/component-catalog";
import type {
  ComponentBinding,
  ComponentCatalogEntry,
  Diagnostic,
  ResolutionNode,
  UiNode,
} from "@uig/contracts";

export interface NodeResolutionResult {
  resolution: ResolutionNode;
  diagnostics: Diagnostic[];
}

export function resolveNode(input: {
  node: UiNode;
  pack: LoadedDesignSystemPack;
}): NodeResolutionResult {
  const policy = input.pack.semanticPolicy.roles[input.node.role];
  if (!policy) {
    return blocked(
      input.node,
      "SEMANTIC_POLICY_MISSING",
      `Pack ${input.pack.manifest.id} has no policy for ${input.node.role}`,
    );
  }

  const declaredCandidates =
    input.pack.candidatesByRole.get(input.node.role) ?? [];
  const candidates = declaredCandidates.filter((candidate) =>
    satisfiesNode(candidate, input.node),
  );
  if (declaredCandidates.length > 0 && candidates.length === 0) {
    return blocked(
      input.node,
      "COMPONENT_CAPABILITY_MISSING",
      `No ${input.node.role} candidate satisfies capabilities or form adapter`,
    );
  }

  const selected = candidates[0];
  if (selected) {
    if (!isVerified(selected, input.pack)) {
      return blocked(
        input.node,
        "COMPONENT_EXPORT_UNVERIFIED",
        `Component ${selected.id} is not verified`,
      );
    }

    const composition = input.pack.compositionRules.rules.find(
      (rule) =>
        rule.semanticRole === input.node.role &&
        rule.rootComponentId === selected.id,
    );
    const requiresComposition =
      selected.requiredComponentIds.length > 0 || composition !== undefined;
    if (requiresComposition) {
      if (!policy.allowedDecisions.includes("compose")) {
        return blocked(
          input.node,
          "COMPONENT_COMPOSITION_INCOMPLETE",
          `Role ${input.node.role} requires a forbidden composition`,
        );
      }
      const components = expandComposition(
        selected,
        input.pack,
        composition ? Object.values(composition.slots) : [],
      );
      const unverified = components.find(
        (component) => !isVerified(component, input.pack),
      );
      if (unverified) {
        return blocked(
          input.node,
          "COMPONENT_EXPORT_UNVERIFIED",
          `Composition component ${unverified.id} is not verified`,
        );
      }
      return {
        resolution: {
          ...base(input.node),
          decision: "compose",
          bindings: components.map(binding),
          props: selected.defaultProps,
        },
        diagnostics: [],
      };
    }

    if (policy.allowedDecisions.includes("reuse")) {
      return {
        resolution: {
          ...base(input.node),
          decision: "reuse",
          binding: binding(selected),
          props: selected.defaultProps,
        },
        diagnostics: [],
      };
    }
  }

  if (policy.nativeFallback && policy.allowedDecisions.includes("fallback")) {
    return {
      resolution: {
        ...base(input.node),
        decision: "fallback",
        localComponentName: `Generated${pascal(input.node.role)}`,
        styleStrategy: "css-module",
      },
      diagnostics: [],
    };
  }

  return blocked(
    input.node,
    policy.nativeFallback ? policy.unresolvedCode : "NATIVE_FALLBACK_FORBIDDEN",
    `No permitted component decision exists for ${input.node.role}`,
  );
}

function base(node: UiNode) {
  return {
    manifestNodeId: node.id,
    semanticRole: node.role,
    confidence: node.confidence,
    evidence: [...node.evidence, { kind: "semantic-role", value: node.role }],
    diagnosticCodes: [] as string[],
  };
}

function blocked(
  node: UiNode,
  code: string,
  message: string,
): NodeResolutionResult {
  return {
    resolution: {
      ...base(node),
      decision: "blocked",
      diagnosticCodes: [code],
    },
    diagnostics: [
      {
        severity: "error",
        blocking: true,
        stage: "component-resolution",
        code,
        message,
        source: { manifestNodeId: node.id },
        evidence: { semanticRole: node.role },
      },
    ],
  };
}

function satisfiesNode(
  candidate: ComponentCatalogEntry,
  node: UiNode,
): boolean {
  return (
    (node.requiredCapabilities ?? []).every((capability) =>
      candidate.capabilities.includes(capability),
    ) &&
    (node.formAdapter === undefined ||
      candidate.formAdapters.includes(node.formAdapter))
  );
}

function isVerified(
  component: ComponentCatalogEntry,
  pack: LoadedDesignSystemPack,
): boolean {
  return (
    component.verified &&
    pack.verification.components.some(
      (entry) =>
        entry.componentId === component.id && entry.status === "verified",
    )
  );
}

function expandComposition(
  root: ComponentCatalogEntry,
  pack: LoadedDesignSystemPack,
  slotComponentIds: string[],
): ComponentCatalogEntry[] {
  const result: ComponentCatalogEntry[] = [];
  const visited = new Set<string>();
  const visit = (component: ComponentCatalogEntry): void => {
    if (visited.has(component.id)) {
      return;
    }
    visited.add(component.id);
    result.push(component);
    component.requiredComponentIds.forEach((id) => {
      const required = pack.componentsById.get(id);
      if (required) {
        visit(required);
      }
    });
  };
  visit(root);
  slotComponentIds.forEach((id) => {
    const slot = pack.componentsById.get(id);
    if (slot) {
      visit(slot);
    }
  });
  return result;
}

function binding(component: ComponentCatalogEntry): ComponentBinding {
  return {
    componentId: component.id,
    package: component.package,
    export: component.export,
    exportKind: component.exportKind,
  };
}

function pascal(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}
