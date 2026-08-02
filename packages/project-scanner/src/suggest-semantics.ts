import type {
  CapabilitySuggestion,
  FormAdapterSuggestion,
  ProjectScanDiagnostic,
  SemanticSuggestion,
  VerifiedProjectComponent,
} from "@uig/contracts";

export interface SemanticVocabulary {
  roles: ReadonlySet<string>;
  capabilities: ReadonlySet<string>;
  formAdapters: ReadonlySet<string>;
}

interface SuggestionRule {
  role: string;
  namePattern: RegExp;
  requiredProps: readonly string[];
  confidence: number;
  capabilities: readonly string[];
  formAdapters: readonly string[];
}

const RULES: readonly SuggestionRule[] = [
  {
    role: "choicePanel",
    namePattern: /(?:RadioGroup|ChoicePanel)$/,
    requiredProps: ["options", "value", "onChange"],
    confidence: 0.86,
    capabilities: ["single-selection", "value", "change"],
    formAdapters: ["controlled"],
  },
  {
    role: "filtersForm",
    namePattern: /Filter(?:s)?(?:Form|Panel)$/,
    requiredProps: ["filters", "onChange"],
    confidence: 0.81,
    capabilities: ["filtering"],
    formAdapters: ["controlled"],
  },
];

export function suggestProjectSemantics(input: {
  component: VerifiedProjectComponent;
  vocabulary: SemanticVocabulary;
}): {
  semanticRoles: SemanticSuggestion[];
  capabilities: CapabilitySuggestion[];
  formAdapters: FormAdapterSuggestion[];
  diagnostics: ProjectScanDiagnostic[];
} {
  const propNames = new Set(
    input.component.contract.props.map((prop) => prop.name),
  );
  const semanticRoles: SemanticSuggestion[] = [];
  const capabilities = new Map<string, CapabilitySuggestion>();
  const formAdapters = new Map<string, FormAdapterSuggestion>();

  for (const rule of RULES) {
    if (
      !rule.namePattern.test(input.component.import.export) ||
      !rule.requiredProps.every((prop) => propNames.has(prop)) ||
      !input.vocabulary.roles.has(rule.role)
    ) {
      continue;
    }
    const evidence = [
      { kind: "component-name", value: input.component.import.export },
      { kind: "prop-shape", value: rule.requiredProps.join(",") },
    ];
    semanticRoles.push({
      role: rule.role,
      status: "suggested",
      confidence: rule.confidence,
      evidence,
    });
    for (const name of rule.capabilities) {
      if (input.vocabulary.capabilities.has(name)) {
        capabilities.set(name, {
          name,
          status: "suggested",
          confidence: rule.confidence,
          evidence,
        });
      }
    }
    for (const name of rule.formAdapters) {
      if (input.vocabulary.formAdapters.has(name)) {
        formAdapters.set(name, {
          name,
          status: "suggested",
          confidence: rule.confidence,
          evidence,
        });
      }
    }
  }

  return {
    semanticRoles: semanticRoles.sort((a, b) => a.role.localeCompare(b.role)),
    capabilities: [...capabilities.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    formAdapters: [...formAdapters.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    diagnostics: [],
  };
}
