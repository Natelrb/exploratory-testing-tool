// AI Service abstraction types

import type { AcceptanceCriterion, Oracle } from "@/lib/explorer/types";

export interface AIProvider {
  name: string;
  analyzePageStructure(html: string, url: string): Promise<PageStructureAnalysis>;
  generateTestCharter(analysis: PageStructureAnalysis): Promise<GeneratedCharter>;
  proposeExplorationPlan(
    area: string,
    pageAnalysis: PageStructureAnalysis,
    charter: GeneratedCharter
  ): Promise<ExplorationPlanResult>;
  analyzeScreenshot?(screenshot: Buffer, context: string): Promise<ScreenshotAnalysis>;
  identifyIssues(observations: string[], context: string): Promise<IdentifiedIssue[]>;

  // AC mode: parse free-form text into structured ACs and propose plans per AC.
  // Both methods are optional so existing providers remain interface-compatible
  // until they implement them.
  parseAcceptanceCriteria?(text: string): Promise<ParsedAC[]>;
  proposeACPlan?(
    ac: AcceptanceCriterion,
    pageAnalysis: PageStructureAnalysis
  ): Promise<ExplorationPlanResult>;

  // Exploratory loop: decide ONE next action at a time, given current page
  // state and a history of what's been done. The AI can return:
  //   - "step": take this single next action toward Given+When
  //   - "done": the WHEN is satisfied, run the oracle now
  //   - "blocked": can't proceed; explain why
  // This is what makes the tool actually exploratory — each action is
  // informed by what just happened, not a stale upfront plan.
  decideNextStep?(input: DecideNextStepInput): Promise<DecisionResult>;
}

export interface DecideNextStepInput {
  acId: string;
  given: string;
  when: string;
  then: string;
  pageAnalysis: PageStructureAnalysis;
  history: PriorStepSummary[];
  observations: string[]; // recent observation strings
  stepsRemaining: number;
}

export interface PriorStepSummary {
  action: string;
  target: string;
  description: string;
  succeeded: boolean;
  rationale?: string;
}

export type DecisionResult =
  | {
      kind: "step";
      rationale: string;
      step: PlannedStep;
    }
  | {
      kind: "done";
      rationale: string;
    }
  | {
      kind: "blocked";
      reason: string;
    };

// Result of parsing free-form Given/When/Then text. The oracle is the AI's
// best guess — the user reviews/edits it before running.
export interface ParsedAC {
  externalId: string;
  given: string;
  when: string;
  then: string;
  priority: "must" | "should" | "could";
  oracle: Oracle;
  oracleConfidence: "high" | "medium" | "low"; // hint to UI for review prompts
}

export interface PageStructureAnalysis {
  appType: string; // e.g., "e-commerce", "dashboard", "blog", "form-heavy"
  primaryPurpose: string;
  keyAreas: AreaInfo[];
  navigation: NavigationInfo[];
  forms: FormInfo[];
  interactiveElements: ElementInfo[];
  potentialRisks: string[];
  accessibilityNotes: string[];
}

export interface AreaInfo {
  name: string;
  description: string;
  importance: "high" | "medium" | "low";
  suggestedTests: string[];
}

export interface NavigationInfo {
  label: string;
  selector: string;
  type: "main" | "secondary" | "footer" | "breadcrumb";
  hasSubmenu: boolean;
}

export interface FormInfo {
  purpose: string;
  selector: string;
  fields: FieldInfo[];
  submitSelector?: string;
  validationNotes: string[];
}

export interface FieldInfo {
  name: string;
  type: string;
  selector: string;
  required: boolean;
  validationRules?: string[];
}

export interface ElementInfo {
  description: string;
  selector: string;
  type: "button" | "link" | "input" | "dropdown" | "modal-trigger" | "other";
  importance: "high" | "medium" | "low";
}

export interface GeneratedCharter {
  mission: string;
  riskFocus: string;
  scope: string;
  outOfScope: string[];
  testIdeas: TestIdeaInfo[];
  suggestedDuration: number; // minutes
}

export interface TestIdeaInfo {
  area: string;
  idea: string;
  priority: "high" | "medium" | "low";
  rationale: string;
}

export interface ExplorationPlanResult {
  objective: string;
  steps: PlannedStep[];
  expectedFindings: string[];
  risks: string[];
}

export interface PlannedStep {
  action: "click" | "fill" | "select" | "hover" | "scroll" | "wait" | "assert";
  target: string; // selector or description
  value?: string;
  description: string;
  expectedOutcome: string;
  riskLevel: "safe" | "moderate" | "risky";
}

export interface ScreenshotAnalysis {
  description: string;
  visibleElements: string[];
  potentialIssues: string[];
  suggestedActions: string[];
  accessibility: string[];
}

export interface IdentifiedIssue {
  type: "bug" | "ux" | "accessibility" | "security" | "performance";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  recommendation: string;
}

// Configuration for AI providers
export interface AIConfig {
  provider: "ollama" | "anthropic" | "openai" | "heuristic";
  model?: string;
  baseUrl?: string; // for Ollama
  apiKey?: string; // for cloud providers
  temperature?: number;
  maxTokens?: number;
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "heuristic",
};

export const OLLAMA_CONFIG: AIConfig = {
  provider: "ollama",
  model: "qwen2.5:14b",
  baseUrl: "http://localhost:11434",
  temperature: 0.7,
  maxTokens: 4096,
};
