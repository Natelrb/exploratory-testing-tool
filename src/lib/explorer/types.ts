// Types for AI-powered exploration

export interface ExplorationConfig {
  url: string;
  username?: string;
  password?: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  maxActions?: number;
  focusAreas?: string[];
  acceptanceCriteria?: AcceptanceCriterion[];
}

// ============================================
// Acceptance Criteria & Oracles
// ============================================

export interface AcceptanceCriterion {
  id: string;            // user-facing identifier (AC-1, AC-2)
  given: string;         // precondition / state to reach
  when: string;          // action(s) to perform
  then: string;          // observable outcome (human readable)
  oracle: Oracle;        // verifiable check
  priority: "must" | "should" | "could";
  tags?: string[];
}

export type Oracle =
  | DOMOracle
  | URLOracle
  | ConsoleOracle
  | NetworkOracle
  | JudgeOracle;

export interface DOMOracle {
  kind: "dom";
  selector: string;
  check: "exists" | "visible" | "hidden" | "text-equals" | "text-contains" | "count-equals" | "count-at-least";
  value?: string | number;
}

export interface URLOracle {
  kind: "url";
  pattern: string;       // RegExp source
  flags?: string;
}

export interface ConsoleOracle {
  kind: "console";
  check: "no-errors" | "no-warnings" | "contains";
  value?: string;        // for "contains"
}

export interface NetworkOracle {
  kind: "network";
  method?: string;
  urlPattern: string;    // RegExp source
  statusRange?: [number, number];   // inclusive, default [200, 299]
}

export interface JudgeOracle {
  kind: "judge";
  rubric: string;        // free-form criteria for LLM verdict
}

export type ACVerdictStatus = "pass" | "fail" | "blocked" | "error";

export interface ACVerdict {
  acId: string;
  status: ACVerdictStatus;
  reason?: string;
  evidence: string[];
  duration?: number;
}

export interface PageElement {
  selector: string;
  tagName: string;
  type?: string; // input type, button type, etc.
  text?: string;
  placeholder?: string;
  ariaLabel?: string;
  href?: string;
  role?: string;
  isVisible: boolean;
  isEnabled: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface PageAnalysis {
  url: string;
  title: string;
  description?: string;
  forms: FormAnalysis[];
  navigation: NavigationItem[];
  interactiveElements: PageElement[];
  links: LinkInfo[];
  headings: { level: number; text: string }[];
  images: {
    src: string;
    alt?: string;
    hasAlt: boolean;
    selector: string;
    dimensions: string;
    context: string;
    width?: number;
    height?: number;
    decorative?: boolean;
  }[];
  issues: PageIssue[];
}

export interface FormAnalysis {
  selector: string;
  action?: string;
  method?: string;
  fields: FormField[];
  submitButton?: PageElement;
}

export interface FormField {
  selector: string;
  name?: string;
  type: string;
  label?: string;
  placeholder?: string;
  required: boolean;
  value?: string;
}

export interface NavigationItem {
  selector: string;
  text: string;
  href?: string;
  isActive: boolean;
  hasSubmenu: boolean;
  children?: NavigationItem[];
}

export interface LinkInfo {
  selector: string;
  text: string;
  href: string;
  isExternal: boolean;
  isNavigation: boolean;
}

export interface PageIssue {
  type: "accessibility" | "security" | "ux" | "performance" | "functional";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  selector?: string;
  recommendation?: string;
}

export interface TestCharter {
  mission: string;
  riskFocus: string;
  scope: string;
  testIdeas: TestIdea[];
  estimatedDepth: "shallow" | "medium" | "deep";
}

export interface TestIdea {
  area: string;
  description: string;
  priority: "high" | "medium" | "low";
  actions: ProposedAction[];
}

export interface ProposedAction {
  type: "click" | "fill" | "select" | "hover" | "scroll" | "navigate" | "wait";
  target?: string; // selector or description
  value?: string; // for fill/select
  description: string;
}

export interface ExplorationPlan {
  area: string;
  objective: string;
  steps: ExplorationStep[];
}

export interface ExplorationStep {
  action: ProposedAction;
  expectedOutcome: string;
  riskLevel: "safe" | "moderate" | "risky";
}

export interface ActionResult {
  action: ProposedAction;
  success: boolean;
  error?: string;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  observations: string[];
  issues: PageIssue[];
  duration: number;
}

export interface ExplorationRun {
  id: string;
  config: ExplorationConfig;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  startTime: Date;
  endTime?: Date;
  charter?: TestCharter;
  currentStep?: string;
  progress: number; // 0-100
  actionResults: ActionResult[];
  evidence: Evidence[];
  findings: Finding[];
  logs: LogEntry[];
}

export interface Evidence {
  type: "screenshot" | "video" | "network" | "console" | "html";
  path: string;
  timestamp: Date;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Finding {
  type: "bug" | "risk" | "observation" | "accessibility" | "security" | "ux";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string[]; // paths to evidence
  location: string; // URL or selector
  stepsToReproduce?: string[];
}

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: Record<string, unknown>;
}

export interface ConsoleMessage {
  type: "log" | "warn" | "error" | "info" | "debug";
  text: string;
  timestamp: Date;
  location?: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: Date;
}

export interface NetworkResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timing?: number;
  timestamp: Date;
}
