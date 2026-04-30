// Heuristic-based AI Provider - works without any external API
// Uses rule-based analysis to provide reasonable test suggestions

import type {
  AIProvider,
  PageStructureAnalysis,
  GeneratedCharter,
  ExplorationPlanResult,
  ScreenshotAnalysis,
  IdentifiedIssue,
  AreaInfo,
  NavigationInfo,
  FormInfo,
  ElementInfo,
  ParsedAC,
} from "./types";
import type { AcceptanceCriterion, Oracle } from "@/lib/explorer/types";

export class HeuristicProvider implements AIProvider {
  name = "heuristic";

  async analyzePageStructure(html: string, url: string): Promise<PageStructureAnalysis> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Detect app type based on common patterns
    const appType = this.detectAppType(html, url);

    // Extract navigation
    const navigation = this.extractNavigation(doc);

    // Extract forms
    const forms = this.extractForms(doc);

    // Extract interactive elements
    const interactiveElements = this.extractInteractiveElements(doc);

    // Identify key areas
    const keyAreas = this.identifyKeyAreas(navigation, forms, interactiveElements, appType);

    // Check for potential risks
    const potentialRisks = this.identifyRisks(doc, forms);

    // Accessibility checks
    const accessibilityNotes = this.checkAccessibility(doc);

    return {
      appType,
      primaryPurpose: this.inferPurpose(appType, keyAreas),
      keyAreas,
      navigation,
      forms,
      interactiveElements,
      potentialRisks,
      accessibilityNotes,
    };
  }

  async generateTestCharter(analysis: PageStructureAnalysis): Promise<GeneratedCharter> {
    const highPriorityAreas = analysis.keyAreas.filter((a) => a.importance === "high");
    const hasAuth = analysis.forms.some((f) => this.isAuthForm(f));
    const hasDataEntry = analysis.forms.length > 0;

    const testIdeas = this.generateTestIdeas(analysis);

    return {
      mission: `Explore the ${analysis.appType} application to discover potential issues with ${
        hasAuth ? "authentication, " : ""
      }${hasDataEntry ? "data validation, " : ""}navigation and core functionality`,
      riskFocus: analysis.potentialRisks[0] || "General functionality and user experience",
      scope: `Testing ${highPriorityAreas.map((a) => a.name).join(", ")} areas`,
      outOfScope: ["Third-party integrations", "Backend performance", "Database integrity"],
      testIdeas,
      suggestedDuration: Math.max(15, testIdeas.length * 5),
    };
  }

  async proposeExplorationPlan(
    area: string,
    pageAnalysis: PageStructureAnalysis,
    _charter: GeneratedCharter
  ): Promise<ExplorationPlanResult> {
    const areaInfo = pageAnalysis.keyAreas.find((a) => a.name === area);
    const relevantForms = pageAnalysis.forms.filter(
      (f) => f.purpose.toLowerCase().includes(area.toLowerCase())
    );
    const relevantElements = pageAnalysis.interactiveElements.filter(
      (e) => e.description.toLowerCase().includes(area.toLowerCase())
    );

    const steps = this.generateExplorationSteps(area, areaInfo, relevantForms, relevantElements);

    return {
      objective: `Explore ${area} functionality to identify issues with user flows and edge cases`,
      steps,
      expectedFindings: [
        "Validation behavior for invalid inputs",
        "Error message clarity",
        "Navigation flow issues",
        "Missing or broken functionality",
      ],
      risks: [
        "Some actions may alter application state",
        "May encounter authentication requirements",
      ],
    };
  }

  async analyzeScreenshot(
    _screenshot: Buffer,
    context: string
  ): Promise<ScreenshotAnalysis> {
    // Heuristic provider can't analyze images
    return {
      description: `Screenshot captured during: ${context}`,
      visibleElements: ["Unable to analyze - heuristic mode"],
      potentialIssues: [],
      suggestedActions: ["Review screenshot manually"],
      accessibility: [],
    };
  }

  async identifyIssues(observations: string[], context: string): Promise<IdentifiedIssue[]> {
    const issues: IdentifiedIssue[] = [];

    for (const obs of observations) {
      const obsLower = obs.toLowerCase();

      // Check for error patterns
      if (obsLower.includes("error") || obsLower.includes("failed") || obsLower.includes("exception")) {
        issues.push({
          type: "bug",
          severity: obsLower.includes("critical") ? "critical" : "high",
          title: "Error detected",
          description: obs,
          recommendation: "Investigate the error and check error handling",
        });
      }

      // Check for accessibility patterns
      if (obsLower.includes("missing alt") || obsLower.includes("no label") || obsLower.includes("contrast")) {
        issues.push({
          type: "accessibility",
          severity: "medium",
          title: "Accessibility issue",
          description: obs,
          recommendation: "Review accessibility guidelines and fix the issue",
        });
      }

      // Check for security patterns
      if (obsLower.includes("password") && obsLower.includes("visible")) {
        issues.push({
          type: "security",
          severity: "high",
          title: "Potential security issue",
          description: obs,
          recommendation: "Ensure sensitive data is properly masked",
        });
      }

      // Check for UX patterns
      if (
        obsLower.includes("slow") ||
        obsLower.includes("confusing") ||
        obsLower.includes("unclear")
      ) {
        issues.push({
          type: "ux",
          severity: "medium",
          title: "UX concern",
          description: obs,
          recommendation: "Review user experience and consider improvements",
        });
      }
    }

    // Add context-based observation if no issues found
    if (issues.length === 0 && observations.length > 0) {
      issues.push({
        type: "bug",
        severity: "info",
        title: `Observations during ${context}`,
        description: observations.join("; "),
        recommendation: "Review observations for potential issues",
      });
    }

    return issues;
  }

  // Helper methods

  private detectAppType(html: string, url: string): string {
    const htmlLower = html.toLowerCase();
    const urlLower = url.toLowerCase();

    if (htmlLower.includes("cart") || htmlLower.includes("checkout") || htmlLower.includes("product")) {
      return "e-commerce";
    }
    if (htmlLower.includes("dashboard") || htmlLower.includes("analytics") || htmlLower.includes("metrics")) {
      return "dashboard";
    }
    if (htmlLower.includes("login") || htmlLower.includes("sign in") || htmlLower.includes("register")) {
      return "authentication";
    }
    if (htmlLower.includes("article") || htmlLower.includes("blog") || htmlLower.includes("post")) {
      return "content/blog";
    }
    if (urlLower.includes("admin")) {
      return "admin panel";
    }
    if (htmlLower.includes("search")) {
      return "search application";
    }

    return "web application";
  }

  private extractNavigation(doc: Document): NavigationInfo[] {
    const navItems: NavigationInfo[] = [];
    const navSelectors = ["nav a", "header a", "[role='navigation'] a", ".nav-link", ".menu-item a"];

    for (const selector of navSelectors) {
      const elements = doc.querySelectorAll(selector);
      elements.forEach((el, index) => {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
          navItems.push({
            label: text,
            selector: `${selector}:nth-of-type(${index + 1})`,
            type: selector.includes("header") ? "main" : "secondary",
            hasSubmenu: el.querySelector("ul, .submenu, .dropdown") !== null,
          });
        }
      });
    }

    return navItems.slice(0, 20); // Limit to 20 items
  }

  private extractForms(doc: Document): FormInfo[] {
    const forms: FormInfo[] = [];
    const formElements = doc.querySelectorAll("form");

    formElements.forEach((form, formIndex) => {
      const fields = Array.from(form.querySelectorAll("input, select, textarea")).map(
        (field, fieldIndex) => {
          const input = field as HTMLInputElement;
          return {
            name: input.name || input.id || `field-${fieldIndex}`,
            type: input.type || "text",
            selector: input.id ? `#${input.id}` : `form:nth-of-type(${formIndex + 1}) input:nth-of-type(${fieldIndex + 1})`,
            required: input.required || input.hasAttribute("required"),
          };
        }
      );

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');

      forms.push({
        purpose: this.inferFormPurpose(form, fields),
        selector: form.id ? `#${form.id}` : `form:nth-of-type(${formIndex + 1})`,
        fields,
        submitSelector: submitBtn
          ? submitBtn.id
            ? `#${submitBtn.id}`
            : `form:nth-of-type(${formIndex + 1}) button[type="submit"]`
          : undefined,
        validationNotes: this.inferValidationRules(fields),
      });
    });

    return forms;
  }

  private extractInteractiveElements(doc: Document): ElementInfo[] {
    const elements: ElementInfo[] = [];
    const selectors = [
      { sel: "button:not([type='submit'])", type: "button" as const },
      { sel: "a[href]:not(nav a):not(header a)", type: "link" as const },
      { sel: "select", type: "dropdown" as const },
      { sel: "[onclick]", type: "button" as const },
      { sel: "[data-toggle]", type: "modal-trigger" as const },
    ];

    for (const { sel, type } of selectors) {
      const els = doc.querySelectorAll(sel);
      els.forEach((el, index) => {
        const text = el.textContent?.trim() || el.getAttribute("aria-label") || "";
        if (text && text.length > 0 && text.length < 100) {
          elements.push({
            description: text,
            selector: `${sel}:nth-of-type(${index + 1})`,
            type,
            importance: this.assessElementImportance(el, text),
          });
        }
      });
    }

    return elements.slice(0, 30);
  }

  private identifyKeyAreas(
    navigation: NavigationInfo[],
    forms: FormInfo[],
    _elements: ElementInfo[],
    appType: string
  ): AreaInfo[] {
    const areas: AreaInfo[] = [];

    // Add areas from navigation
    for (const nav of navigation.filter((n) => n.type === "main").slice(0, 5)) {
      areas.push({
        name: nav.label,
        description: `Navigation area: ${nav.label}`,
        importance: "medium",
        suggestedTests: [
          `Verify ${nav.label} page loads correctly`,
          `Check navigation flow to and from ${nav.label}`,
        ],
      });
    }

    // Add areas from forms
    for (const form of forms) {
      const importance = this.isAuthForm(form) ? "high" : "medium";
      areas.push({
        name: form.purpose,
        description: `Form: ${form.purpose} with ${form.fields.length} fields`,
        importance,
        suggestedTests: [
          `Test form validation with empty fields`,
          `Test form with invalid data`,
          `Test successful form submission`,
          `Test error message display`,
        ],
      });
    }

    // Add default areas based on app type
    if (appType === "e-commerce") {
      areas.push({
        name: "Product Search",
        description: "Search functionality for products",
        importance: "high",
        suggestedTests: ["Search with valid terms", "Search with invalid/empty terms", "Filter results"],
      });
    }

    return areas;
  }

  private identifyRisks(doc: Document, forms: FormInfo[]): string[] {
    const risks: string[] = [];

    // Check for authentication forms
    if (forms.some((f) => this.isAuthForm(f))) {
      risks.push("Authentication handling - verify secure credential handling");
    }

    // Check for payment forms
    if (forms.some((f) => f.fields.some((field) => field.name.toLowerCase().includes("card")))) {
      risks.push("Payment processing - sensitive financial data handling");
    }

    // Check for external links
    const externalLinks = doc.querySelectorAll('a[href^="http"]:not([href*="' + doc.location?.hostname + '"])');
    if (externalLinks.length > 0) {
      risks.push("External links - verify they open correctly and securely");
    }

    // Check for file uploads
    if (doc.querySelector('input[type="file"]')) {
      risks.push("File upload - verify file type validation and size limits");
    }

    // Default risks
    risks.push("Data validation - ensure proper input handling");
    risks.push("Error handling - verify graceful error recovery");

    return risks;
  }

  private checkAccessibility(doc: Document): string[] {
    const notes: string[] = [];

    // Check images without alt text
    const imagesWithoutAlt = doc.querySelectorAll("img:not([alt])");
    if (imagesWithoutAlt.length > 0) {
      notes.push(`${imagesWithoutAlt.length} images missing alt text`);
    }

    // Check form inputs without labels
    const inputsWithoutLabels = doc.querySelectorAll("input:not([aria-label]):not([id])");
    if (inputsWithoutLabels.length > 0) {
      notes.push(`${inputsWithoutLabels.length} form inputs may be missing labels`);
    }

    // Check for skip links
    if (!doc.querySelector('a[href="#main"], a[href="#content"], .skip-link')) {
      notes.push("No skip navigation link detected");
    }

    // Check heading hierarchy
    const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
    if (headings.length === 0) {
      notes.push("No heading elements found - may affect screen reader navigation");
    }

    return notes;
  }

  private inferPurpose(appType: string, areas: AreaInfo[]): string {
    const areaNames = areas.slice(0, 3).map((a) => a.name).join(", ");
    return `${appType} application with ${areaNames} functionality`;
  }

  private isAuthForm(form: FormInfo): boolean {
    const authKeywords = ["login", "sign in", "password", "auth", "register", "signup"];
    const purposeLower = form.purpose.toLowerCase();
    return (
      authKeywords.some((k) => purposeLower.includes(k)) ||
      form.fields.some((f) => f.type === "password")
    );
  }

  private inferFormPurpose(form: Element, fields: { name: string; type: string }[]): string {
    const formId = form.id?.toLowerCase() || "";
    const formClass = form.className?.toLowerCase() || "";
    const formAction = form.getAttribute("action")?.toLowerCase() || "";

    if (fields.some((f) => f.type === "password")) {
      if (fields.some((f) => f.name.includes("confirm"))) {
        return "Registration Form";
      }
      return "Login Form";
    }

    if (formId.includes("search") || formClass.includes("search") || formAction.includes("search")) {
      return "Search Form";
    }

    if (fields.some((f) => f.name.includes("email")) && fields.length <= 3) {
      return "Newsletter/Subscribe Form";
    }

    if (fields.some((f) => f.name.includes("message") || f.name.includes("comment"))) {
      return "Contact/Feedback Form";
    }

    return "Data Entry Form";
  }

  private inferValidationRules(fields: { name: string; type: string; required: boolean }[]): string[] {
    const rules: string[] = [];

    for (const field of fields) {
      if (field.required) {
        rules.push(`${field.name} is required`);
      }
      if (field.type === "email") {
        rules.push(`${field.name} requires valid email format`);
      }
      if (field.type === "number") {
        rules.push(`${field.name} requires numeric input`);
      }
    }

    return rules;
  }

  private assessElementImportance(el: Element, text: string): "high" | "medium" | "low" {
    const textLower = text.toLowerCase();
    const highPriorityKeywords = ["submit", "save", "delete", "remove", "buy", "checkout", "login", "register"];
    const lowPriorityKeywords = ["learn more", "read more", "see all", "view"];

    if (highPriorityKeywords.some((k) => textLower.includes(k))) {
      return "high";
    }
    if (lowPriorityKeywords.some((k) => textLower.includes(k))) {
      return "low";
    }
    return "medium";
  }

  private generateTestIdeas(analysis: PageStructureAnalysis): GeneratedCharter["testIdeas"] {
    const ideas: GeneratedCharter["testIdeas"] = [];

    // Add ideas for each key area
    for (const area of analysis.keyAreas) {
      for (const test of area.suggestedTests) {
        ideas.push({
          area: area.name,
          idea: test,
          priority: area.importance,
          rationale: `Testing ${area.name} functionality`,
        });
      }
    }

    // Add accessibility testing
    if (analysis.accessibilityNotes.length > 0) {
      ideas.push({
        area: "Accessibility",
        idea: "Verify keyboard navigation and screen reader compatibility",
        priority: "medium",
        rationale: "Accessibility issues detected: " + analysis.accessibilityNotes[0],
      });
    }

    // Add risk-based testing
    for (const risk of analysis.potentialRisks.slice(0, 2)) {
      ideas.push({
        area: "Risk Mitigation",
        idea: `Test: ${risk}`,
        priority: "high",
        rationale: "Identified as potential risk area",
      });
    }

    return ideas;
  }

  private generateExplorationSteps(
    area: string,
    areaInfo: AreaInfo | undefined,
    forms: FormInfo[],
    elements: ElementInfo[]
  ): ExplorationPlanResult["steps"] {
    const steps: ExplorationPlanResult["steps"] = [];

    // If there's a form in this area, add form testing steps
    for (const form of forms) {
      // Test empty submission
      steps.push({
        action: "click",
        target: form.submitSelector || `${form.selector} button[type="submit"]`,
        description: "Submit form with empty fields",
        expectedOutcome: "Validation errors should appear",
        riskLevel: "safe",
      });

      // Fill with invalid data
      for (const field of form.fields.slice(0, 3)) {
        steps.push({
          action: "fill",
          target: field.selector,
          value: this.generateInvalidValue(field.type),
          description: `Enter invalid ${field.type} in ${field.name}`,
          expectedOutcome: "Field should show validation error",
          riskLevel: "safe",
        });
      }

      // Fill with valid data
      for (const field of form.fields.slice(0, 3)) {
        steps.push({
          action: "fill",
          target: field.selector,
          value: this.generateValidValue(field.type, field.name),
          description: `Enter valid ${field.type} in ${field.name}`,
          expectedOutcome: "Field should accept the value",
          riskLevel: "safe",
        });
      }
    }

    // Add element interaction steps
    for (const element of elements.filter((e) => e.importance === "high").slice(0, 3)) {
      steps.push({
        action: "click",
        target: element.selector,
        description: `Click on "${element.description}"`,
        expectedOutcome: "Element should respond to interaction",
        riskLevel: element.type === "modal-trigger" ? "safe" : "moderate",
      });
    }

    // Add area-specific suggested tests
    if (areaInfo) {
      for (const test of areaInfo.suggestedTests.slice(0, 2)) {
        steps.push({
          action: "assert",
          target: "page",
          description: test,
          expectedOutcome: "Test condition should pass",
          riskLevel: "safe",
        });
      }
    }

    return steps;
  }

  private generateInvalidValue(type: string): string {
    switch (type) {
      case "email":
        return "not-an-email";
      case "number":
        return "abc";
      case "tel":
        return "invalid-phone";
      case "url":
        return "not-a-url";
      case "password":
        return "123"; // Too short
      default:
        return "<script>alert('xss')</script>";
    }
  }

  private generateValidValue(type: string, name: string): string {
    switch (type) {
      case "email":
        return "test@example.com";
      case "number":
        return "42";
      case "tel":
        return "+1234567890";
      case "url":
        return "https://example.com";
      case "password":
        return "SecureP@ss123!";
      case "text":
        if (name.toLowerCase().includes("name")) return "Test User";
        if (name.toLowerCase().includes("address")) return "123 Test Street";
        return "Test input value";
      default:
        return "Test value";
    }
  }

  // ============================================
  // Acceptance Criteria mode (heuristic parsing)
  // ============================================

  // Best-effort split of free-form Gherkin into structured ACs. This handles
  // the common shapes: line-prefixed Given/When/Then, blank-line separated
  // blocks, or numbered "Scenario" / "AC-N" headings. Without an LLM we can't
  // infer a useful oracle, so we always emit a "judge" oracle with the THEN
  // clause as the rubric — the user is expected to refine before running.
  async parseAcceptanceCriteria(text: string): Promise<ParsedAC[]> {
    const out: ParsedAC[] = [];
    if (!text.trim()) return out;

    // Split into blocks. First try blank-line separation; if there's only one
    // block, fall back to splitting on each "Given" keyword.
    const blockSplits = text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    const blocks =
      blockSplits.length > 1
        ? blockSplits
        : text
            .split(/(?=^\s*(?:Scenario|AC[\s-]*\d+|Given)\b)/im)
            .map((b) => b.trim())
            .filter(Boolean);

    let counter = 0;
    for (const block of blocks) {
      counter += 1;
      const given = matchClause(block, "given");
      const when = matchClause(block, "when");
      const then = matchClause(block, "then");

      if (!given && !when && !then) continue;

      const oracle: Oracle = { kind: "judge", rubric: then || block };
      out.push({
        externalId: `AC-${counter}`,
        given: given || "",
        when: when || "",
        then: then || "",
        priority: /\bmust\b/i.test(block)
          ? "must"
          : /\bshould\b/i.test(block)
          ? "should"
          : "should",
        oracle,
        oracleConfidence: "low",
      });
    }
    return out;
  }

  // Without an LLM we cannot translate AC text into selector-driven steps
  // safely. Return an empty plan so the engine records a "blocked: no plan"
  // verdict — preferable to emitting random clicks.
  async proposeACPlan(
    ac: AcceptanceCriterion,
    _pageAnalysis: PageStructureAnalysis
  ): Promise<ExplorationPlanResult> {
    return {
      objective: `Verify ${ac.id}: ${ac.then}`,
      steps: [],
      expectedFindings: [],
      risks: ["Heuristic provider cannot generate AC plans — switch to an LLM provider."],
    };
  }
}

function matchClause(block: string, keyword: string): string | null {
  // Match "Given <text>" up to the next clause keyword or end of block.
  const re = new RegExp(
    `\\b${keyword}\\b\\s+(.+?)(?=\\b(?:given|when|then|and|but)\\b|$)`,
    "is"
  );
  const m = block.match(re);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}
