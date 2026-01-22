// AI Service abstraction types

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
