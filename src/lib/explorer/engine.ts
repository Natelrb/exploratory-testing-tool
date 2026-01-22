// Exploration Engine - orchestrates browser automation and AI analysis

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { createAIProvider, detectBestProvider, type AIConfig, type AIProvider } from "@/lib/ai";
import type {
  ExplorationConfig,
  PageAnalysis,
  ConsoleMessage,
  NetworkRequest,
  NetworkResponse,
} from "./types";
import { prisma } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export interface ExplorationCallbacks {
  onLog?: (level: string, message: string, data?: object) => void;
  onProgress?: (progress: number, step: string) => void;
  onAction?: (action: { type: string; description: string; status: string }) => void;
  onFinding?: (finding: { type: string; severity: string; title: string }) => void;
  onEvidence?: (evidence: { type: string; path: string }) => void;
}

export class ExplorationEngine {
  private runId: string;
  private config: ExplorationConfig;
  private aiConfig: AIConfig;
  private aiProvider: AIProvider;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private callbacks: ExplorationCallbacks;
  private evidenceDir: string;
  private consoleMessages: ConsoleMessage[] = [];
  private networkRequests: NetworkRequest[] = [];
  private networkResponses: NetworkResponse[] = [];
  private actionSequence = 0;

  constructor(
    runId: string,
    config: ExplorationConfig,
    aiConfig: AIConfig,
    callbacks: ExplorationCallbacks = {}
  ) {
    this.runId = runId;
    this.config = {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      maxActions: 20,
      ...config,
    };
    this.aiConfig = aiConfig;
    this.aiProvider = createAIProvider(aiConfig);
    this.callbacks = callbacks;
    this.evidenceDir = path.join(process.cwd(), "public", "evidence", runId);
  }

  private log(level: string, message: string, data?: object) {
    this.callbacks.onLog?.(level, message, data);
    // Also save to database
    prisma.explorationLog.create({
      data: { runId: this.runId, level, message, data: data ? JSON.stringify(data) : null },
    }).catch(console.error);
  }

  private async updateProgress(progress: number, step: string) {
    this.callbacks.onProgress?.(progress, step);
    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { progress, currentStep: step },
    }).catch(console.error);
  }

  async run(): Promise<void> {
    try {
      await this.setup();
      await this.updateProgress(10, "Navigating to URL");

      await this.navigate();
      await this.updateProgress(20, "Analyzing page structure");

      const pageAnalysis = await this.analyzePage();

      // Save initial findings from page analysis
      await this.saveInitialFindings(pageAnalysis);
      await this.updateProgress(30, "Generating test charter");

      const charter = await this.generateCharter(pageAnalysis);
      await this.saveCharter(charter);
      await this.updateProgress(40, "Planning exploration");

      const plan = await this.planExploration(pageAnalysis, charter);
      await this.updateProgress(50, "Executing exploration");

      await this.executeExploration(plan);
      await this.updateProgress(90, "Collecting final evidence");

      await this.collectFinalEvidence();

      // Generate exploration summary finding
      await this.generateSummaryFinding(plan);
      await this.updateProgress(100, "Completed");

      await this.complete("completed");
    } catch (error) {
      this.log("error", `Exploration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      await this.complete("failed");
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async setup(): Promise<void> {
    this.log("info", "Setting up browser");

    // Create evidence directory
    await fs.mkdir(this.evidenceDir, { recursive: true });
    await fs.mkdir(path.join(this.evidenceDir, "screenshots"), { recursive: true });

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      ignoreHTTPSErrors: true,
    });

    this.page = await this.context.newPage();

    // Set up event listeners
    this.page.on("console", (msg) => {
      this.consoleMessages.push({
        type: msg.type() as ConsoleMessage["type"],
        text: msg.text(),
        timestamp: new Date(),
        location: msg.location().url,
      });
    });

    this.page.on("request", (request) => {
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData() || undefined,
        timestamp: new Date(),
      });
    });

    this.page.on("response", (response) => {
      this.networkResponses.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        timestamp: new Date(),
      });
    });

    // Mark run as running
    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { status: "running", startTime: new Date() },
    });
  }

  private async navigate(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    this.log("info", `Navigating to ${this.config.url}`);

    await this.page.goto(this.config.url, {
      waitUntil: "networkidle",
      timeout: this.config.timeout,
    });

    // Take initial screenshot
    const screenshotPath = await this.takeScreenshot("01-initial-page", "Initial page load");
    this.log("info", "Initial page loaded", { screenshot: screenshotPath });

    // Handle authentication if credentials provided
    if (this.config.username && this.config.password) {
      await this.attemptLogin();
    }
  }

  private async attemptLogin(): Promise<void> {
    if (!this.page) return;

    this.log("info", "Attempting authentication");

    // Common selectors for login forms - ordered by specificity
    const usernameSelectors = [
      // Test IDs (most reliable)
      '[data-testid="login-username"]',
      '[data-test="username"]',
      // Standard attributes
      'input[name="username"]',
      'input[id="username"]',
      'input[name="email"]',
      'input[id="email"]',
      'input[type="email"]',
      'input[type="text"][name*="user"]',
      'input[type="text"][placeholder*="user" i]',
      'input[type="text"][placeholder*="email" i]',
    ];

    const passwordSelectors = [
      '[data-testid="password-input"]',
      '[data-test="password"]',
      'input[type="password"]',
      'input[name="password"]',
      'input[id="password"]',
    ];

    // Continue/Next buttons for multi-step flows
    const continueSelectors = [
      '[data-testid="next-button"]',
      'button:has-text("Continue")',
      'button:has-text("Next")',
      'button[type="submit"]',
    ];

    // Final submit buttons
    const submitSelectors = [
      '[data-testid="next-button"]',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Submit")',
    ];

    try {
      // Step 1: Find and fill username field
      let usernameFilled = false;
      for (const selector of usernameSelectors) {
        try {
          const field = await this.page.$(selector);
          if (field && await field.isVisible()) {
            await field.fill(this.config.username!);
            this.log("info", `Filled username using ${selector}`);
            usernameFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!usernameFilled) {
        this.log("warn", "Could not find username field");
        return;
      }

      // Check if password field is visible (single-step) or needs continue (multi-step)
      let passwordVisible = false;
      for (const selector of passwordSelectors) {
        try {
          const field = await this.page.$(selector);
          if (field && await field.isVisible()) {
            passwordVisible = true;
            break;
          }
        } catch {
          continue;
        }
      }

      // Step 2: If password not visible, click continue/next for multi-step flow
      if (!passwordVisible) {
        this.log("info", "Multi-step login detected, clicking continue...");
        for (const selector of continueSelectors) {
          try {
            const button = await this.page.$(selector);
            if (button && await button.isVisible()) {
              await button.click();
              this.log("info", `Clicked continue using ${selector}`);
              // Wait for password field to appear
              await this.page.waitForTimeout(1000);
              await this.page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
              break;
            }
          } catch {
            continue;
          }
        }
        await this.takeScreenshot("02-login-after-username", "After entering username (multi-step login)");
      }

      // Step 3: Fill password
      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const field = await this.page.$(selector);
          if (field && await field.isVisible()) {
            await field.fill(this.config.password!);
            this.log("info", `Filled password using ${selector}`);
            passwordFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!passwordFilled) {
        this.log("warn", "Could not find password field");
        await this.takeScreenshot("02-login-password-not-found", "Login failed - password field not found");
        return;
      }

      // Step 4: Submit the form
      for (const selector of submitSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button && await button.isVisible()) {
            await button.click();
            this.log("info", `Clicked submit using ${selector}`);
            await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            break;
          }
        } catch {
          continue;
        }
      }

      // Wait for potential redirects
      await this.page.waitForTimeout(2000);
      await this.takeScreenshot("03-after-login", "After login completed");

      this.log("info", `Login completed, current URL: ${this.page.url()}`);
    } catch (error) {
      this.log("warn", `Login attempt failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      await this.takeScreenshot("02-login-failed", "Login attempt failed");
    }
  }

  private async analyzePage(): Promise<PageAnalysis> {
    if (!this.page) throw new Error("Page not initialized");

    this.log("info", "Analyzing page structure");

    const html = await this.page.content();
    const url = this.page.url();
    const title = await this.page.title();

    // Use AI to analyze the page
    const analysis = await this.aiProvider.analyzePageStructure(html, url);

    // Enrich with actual page data
    const pageAnalysis: PageAnalysis = {
      url,
      title,
      description: analysis.primaryPurpose,
      forms: await this.extractForms(),
      navigation: await this.extractNavigation(),
      interactiveElements: await this.extractInteractiveElements(),
      links: await this.extractLinks(),
      headings: await this.extractHeadings(),
      images: await this.extractImages(),
      issues: this.identifyInitialIssues(analysis),
    };

    this.log("info", "Page analysis complete", {
      forms: pageAnalysis.forms.length,
      navigation: pageAnalysis.navigation.length,
      elements: pageAnalysis.interactiveElements.length,
    });

    return pageAnalysis;
  }

  private async extractForms() {
    if (!this.page) return [];

    return this.page.evaluate(() => {
      const forms: Array<{
        selector: string;
        action?: string;
        method?: string;
        fields: Array<{
          selector: string;
          name?: string;
          type: string;
          label?: string;
          placeholder?: string;
          required: boolean;
        }>;
        submitButton?: { selector: string; tagName: string; text?: string; isVisible: boolean; isEnabled: boolean };
      }> = [];

      document.querySelectorAll("form").forEach((form, formIndex) => {
        const fields = Array.from(form.querySelectorAll("input, select, textarea")).map(
          (field, fieldIndex) => {
            const input = field as HTMLInputElement;
            const label = form.querySelector(`label[for="${input.id}"]`)?.textContent?.trim();
            return {
              selector: input.id ? `#${input.id}` : `form:nth-of-type(${formIndex + 1}) *:nth-of-type(${fieldIndex + 1})`,
              name: input.name || undefined,
              type: input.type || "text",
              label,
              placeholder: input.placeholder || undefined,
              required: input.required,
            };
          }
        );

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null;

        forms.push({
          selector: form.id ? `#${form.id}` : `form:nth-of-type(${formIndex + 1})`,
          action: form.action || undefined,
          method: form.method || undefined,
          fields,
          submitButton: submitBtn ? {
            selector: submitBtn.id ? `#${submitBtn.id}` : `form:nth-of-type(${formIndex + 1}) button[type="submit"]`,
            tagName: submitBtn.tagName,
            text: submitBtn.textContent?.trim(),
            isVisible: submitBtn.offsetParent !== null,
            isEnabled: !(submitBtn as HTMLButtonElement).disabled,
          } : undefined,
        });
      });

      return forms;
    });
  }

  private async extractNavigation() {
    if (!this.page) return [];

    return this.page.evaluate(() => {
      const navItems: Array<{
        selector: string;
        text: string;
        href?: string;
        isActive: boolean;
        hasSubmenu: boolean;
      }> = [];

      const navSelectors = ["nav a", "header a", '[role="navigation"] a'];

      for (const selector of navSelectors) {
        document.querySelectorAll(selector).forEach((el, index) => {
          const anchor = el as HTMLAnchorElement;
          const text = anchor.textContent?.trim() || "";
          if (text && text.length < 50) {
            navItems.push({
              selector: `${selector}:nth-of-type(${index + 1})`,
              text,
              href: anchor.href || undefined,
              isActive: anchor.classList.contains("active") || anchor.getAttribute("aria-current") === "page",
              hasSubmenu: !!anchor.querySelector("ul, .submenu"),
            });
          }
        });
      }

      return navItems.slice(0, 30);
    });
  }

  private async extractInteractiveElements() {
    if (!this.page) return [];

    return this.page.evaluate(() => {
      const elements: Array<{
        selector: string;
        tagName: string;
        type?: string;
        text?: string;
        ariaLabel?: string;
        isVisible: boolean;
        isEnabled: boolean;
      }> = [];

      const selectors = ["button", 'a[href]', 'input[type="submit"]', "[onclick]", "[data-toggle]"];

      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el, index) => {
          const htmlEl = el as HTMLElement;
          const text = htmlEl.textContent?.trim() || "";
          if (text.length < 100) {
            elements.push({
              selector: `${selector}:nth-of-type(${index + 1})`,
              tagName: htmlEl.tagName,
              type: (htmlEl as HTMLInputElement).type || undefined,
              text: text || undefined,
              ariaLabel: htmlEl.getAttribute("aria-label") || undefined,
              isVisible: htmlEl.offsetParent !== null,
              isEnabled: !(htmlEl as HTMLButtonElement).disabled,
            });
          }
        });
      }

      return elements.slice(0, 50);
    });
  }

  private async extractLinks() {
    if (!this.page) return [];

    const currentHost = new URL(this.config.url).hostname;

    return this.page.evaluate((host) => {
      const links: Array<{
        selector: string;
        text: string;
        href: string;
        isExternal: boolean;
        isNavigation: boolean;
      }> = [];

      document.querySelectorAll("a[href]").forEach((el, index) => {
        const anchor = el as HTMLAnchorElement;
        const text = anchor.textContent?.trim() || "";
        const href = anchor.href;
        const isNav = !!anchor.closest("nav, header, footer");

        try {
          const linkHost = new URL(href).hostname;
          links.push({
            selector: `a[href]:nth-of-type(${index + 1})`,
            text,
            href,
            isExternal: linkHost !== host,
            isNavigation: isNav,
          });
        } catch {
          // Invalid URL, skip
        }
      });

      return links.slice(0, 100);
    }, currentHost);
  }

  private async extractHeadings() {
    if (!this.page) return [];

    return this.page.evaluate(() => {
      const headings: Array<{ level: number; text: string }> = [];

      document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
        const level = parseInt(el.tagName.substring(1));
        const text = el.textContent?.trim() || "";
        if (text) {
          headings.push({ level, text });
        }
      });

      return headings;
    });
  }

  private async extractImages() {
    if (!this.page) return [];

    return this.page.evaluate(() => {
      const images: Array<{ src: string; alt?: string; hasAlt: boolean }> = [];

      document.querySelectorAll("img").forEach((img) => {
        images.push({
          src: img.src,
          alt: img.alt || undefined,
          hasAlt: !!img.alt,
        });
      });

      return images;
    });
  }

  private identifyInitialIssues(analysis: ReturnType<AIProvider["analyzePageStructure"]> extends Promise<infer T> ? T : never) {
    const issues: PageAnalysis["issues"] = [];

    // Add accessibility issues
    for (const note of analysis.accessibilityNotes || []) {
      issues.push({
        type: "accessibility",
        severity: "medium",
        title: "Accessibility concern",
        description: note,
      });
    }

    // Add potential risks as issues
    for (const risk of analysis.potentialRisks || []) {
      issues.push({
        type: "functional",
        severity: "info",
        title: "Potential risk area",
        description: risk,
      });
    }

    return issues;
  }

  private async saveInitialFindings(pageAnalysis: PageAnalysis) {
    // Save any issues identified during initial page analysis
    for (const issue of pageAnalysis.issues) {
      await this.recordFinding({
        type: issue.type,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        recommendation: issue.type === "accessibility"
          ? "Review and fix accessibility issues per WCAG guidelines"
          : "Investigate and address this potential issue",
      });
    }

    // Check for common issues that weren't explicitly flagged
    // Images without alt text
    const imagesWithoutAlt = pageAnalysis.images.filter(img => !img.hasAlt);
    if (imagesWithoutAlt.length > 0) {
      await this.recordFinding({
        type: "accessibility",
        severity: "medium",
        title: `${imagesWithoutAlt.length} image(s) missing alt text`,
        description: `Found ${imagesWithoutAlt.length} images without alt attributes, which affects screen reader users.`,
        recommendation: "Add descriptive alt text to all images for better accessibility.",
      });
    }

    // Forms without proper labels
    const formsWithUnlabeledFields = pageAnalysis.forms.filter(form =>
      form.fields.some(field => !field.label && field.type !== "hidden")
    );
    if (formsWithUnlabeledFields.length > 0) {
      await this.recordFinding({
        type: "accessibility",
        severity: "medium",
        title: "Form fields missing labels",
        description: `Some form fields are missing associated labels, which affects accessibility.`,
        recommendation: "Add proper <label> elements or aria-label attributes to all form fields.",
      });
    }
  }

  private async generateCharter(pageAnalysis: PageAnalysis) {
    this.log("info", "Generating test charter with AI");

    // Create a simplified analysis for the AI
    const simplifiedAnalysis = {
      appType: "web application",
      primaryPurpose: pageAnalysis.description || "Unknown",
      keyAreas: pageAnalysis.navigation.map((n) => ({
        name: n.text,
        description: `Navigation item: ${n.text}`,
        importance: "medium" as const,
        suggestedTests: [`Navigate to ${n.text}`, `Verify ${n.text} functionality`],
      })),
      navigation: pageAnalysis.navigation.map((n) => ({
        label: n.text,
        selector: n.selector,
        type: "main" as const,
        hasSubmenu: n.hasSubmenu,
      })),
      forms: pageAnalysis.forms.map((f) => ({
        purpose: f.action || "Form",
        selector: f.selector,
        fields: f.fields.map((field) => ({
          name: field.name || "field",
          type: field.type,
          selector: field.selector,
          required: field.required,
        })),
        submitSelector: f.submitButton?.selector,
        validationNotes: [],
      })),
      interactiveElements: pageAnalysis.interactiveElements.map((e) => ({
        description: e.text || e.ariaLabel || "Element",
        selector: e.selector,
        type: "button" as const,
        importance: "medium" as const,
      })),
      potentialRisks: pageAnalysis.issues.map((i) => i.description),
      accessibilityNotes: pageAnalysis.issues
        .filter((i) => i.type === "accessibility")
        .map((i) => i.description),
    };

    const charter = await this.aiProvider.generateTestCharter(simplifiedAnalysis);
    this.log("info", "Charter generated", { mission: charter.mission });

    return charter;
  }

  private async saveCharter(charter: Awaited<ReturnType<AIProvider["generateTestCharter"]>>) {
    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { charter: JSON.stringify(charter) },
    });
  }

  private async planExploration(
    pageAnalysis: PageAnalysis,
    charter: Awaited<ReturnType<AIProvider["generateTestCharter"]>>
  ) {
    this.log("info", "Planning exploration steps");

    const plans = [];

    // Plan exploration for each high-priority test idea
    const highPriorityIdeas = charter.testIdeas
      .filter((t) => t.priority === "high")
      .slice(0, 3);

    // Create simplified analysis for the AI
    const simplifiedAnalysis = {
      appType: "web application",
      primaryPurpose: pageAnalysis.description || "Unknown",
      keyAreas: pageAnalysis.navigation.map((n) => ({
        name: n.text,
        description: `Navigation item: ${n.text}`,
        importance: "medium" as const,
        suggestedTests: [`Test ${n.text} functionality`],
      })),
      navigation: [],
      forms: pageAnalysis.forms.map((f) => ({
        purpose: f.action || "Form",
        selector: f.selector,
        fields: f.fields.map((field) => ({
          name: field.name || "field",
          type: field.type,
          selector: field.selector,
          required: field.required,
        })),
        submitSelector: f.submitButton?.selector,
        validationNotes: [],
      })),
      interactiveElements: pageAnalysis.interactiveElements.map((e) => ({
        description: e.text || e.ariaLabel || "Element",
        selector: e.selector,
        type: "button" as const,
        importance: "medium" as const,
      })),
      potentialRisks: [],
      accessibilityNotes: [],
    };

    for (const idea of highPriorityIdeas) {
      try {
        const plan = await this.aiProvider.proposeExplorationPlan(
          idea.area,
          simplifiedAnalysis,
          charter
        );
        plans.push({ area: idea.area, ...plan });
      } catch (error) {
        this.log("warn", `Failed to plan for area ${idea.area}: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    // Also add basic exploration of forms
    for (const form of pageAnalysis.forms.slice(0, 2)) {
      plans.push({
        area: "Form Testing",
        objective: `Test form at ${form.selector}`,
        steps: form.fields.slice(0, 3).map((field) => ({
          action: "fill" as const,
          target: field.selector,
          value: this.generateTestValue(field.type),
          description: `Fill ${field.name || "field"} with test data`,
          expectedOutcome: "Field accepts input",
          riskLevel: "safe" as const,
        })),
        expectedFindings: ["Validation behavior"],
        risks: [],
      });
    }

    // Save total actions
    const totalActions = plans.reduce((sum, p) => sum + p.steps.length, 0);
    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { totalActions: Math.min(totalActions, this.config.maxActions!) },
    });

    return plans;
  }

  private generateTestValue(type: string): string {
    switch (type) {
      case "email":
        return "test@example.com";
      case "password":
        return "TestPassword123!";
      case "number":
        return "42";
      case "tel":
        return "+1234567890";
      case "url":
        return "https://example.com";
      default:
        return "Test input";
    }
  }

  private async executeExploration(plans: Array<{ area: string; steps: Array<{ action: string; target: string; value?: string; description: string; expectedOutcome: string; riskLevel: string }> }>) {
    if (!this.page) return;

    let actionsExecuted = 0;
    const maxActions = this.config.maxActions!;

    for (const plan of plans) {
      if (actionsExecuted >= maxActions) break;

      this.log("info", `Exploring area: ${plan.area}`);

      for (const step of plan.steps) {
        if (actionsExecuted >= maxActions) break;

        try {
          await this.executeStep(step);
          actionsExecuted++;

          // Update progress
          const progress = 50 + Math.floor((actionsExecuted / maxActions) * 40);
          await this.updateProgress(progress, `Executing: ${step.description}`);
        } catch (error) {
          this.log("warn", `Step failed: ${step.description} - ${error instanceof Error ? error.message : "Unknown"}`);
        }
      }
    }

    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { completedActions: actionsExecuted },
    });
  }

  private async executeStep(step: { action: string; target: string; value?: string; description: string; expectedOutcome: string; riskLevel: string }) {
    if (!this.page) return;

    const startTime = Date.now();
    this.actionSequence++;

    // Create action record
    const action = await prisma.explorationAction.create({
      data: {
        runId: this.runId,
        sequence: this.actionSequence,
        actionType: step.action,
        target: step.target,
        value: step.value,
        description: step.description,
        status: "running",
      },
    });

    this.callbacks.onAction?.({
      type: step.action,
      description: step.description,
      status: "running",
    });

    // Create a sanitized description for the filename (outside try so it's accessible in catch)
    const sanitizedDesc = this.sanitizeFilename(step.description);
    const actionName = `${step.action}-${sanitizedDesc}`;

    // Take before screenshot with human-readable description
    const beforeDesc = `Before ${step.action}: ${step.description}`;
    const beforePath = await this.takeScreenshot(`action-${this.actionSequence}-${actionName}-before`, beforeDesc);

    try {

      // Execute the action
      switch (step.action) {
        case "click":
          await this.page.click(step.target, { timeout: 5000 });
          await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          break;

        case "fill":
          await this.page.fill(step.target, step.value || "", { timeout: 5000 });
          break;

        case "select":
          await this.page.selectOption(step.target, step.value || "", { timeout: 5000 });
          break;

        case "hover":
          await this.page.hover(step.target, { timeout: 5000 });
          break;

        case "scroll":
          await this.page.evaluate((selector) => {
            document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
          }, step.target);
          break;

        case "wait":
          await this.page.waitForTimeout(parseInt(step.value || "1000"));
          break;

        case "assert":
        case "check":
        case "verify":
          // These are observation steps - just log the current state
          this.log("info", `Assertion: ${step.description}`);
          break;

        case "navigate":
          // Navigate to a URL or use keyboard navigation
          if (step.target.startsWith("http")) {
            await this.page.goto(step.target, { timeout: 10000 });
          }
          break;

        case "press":
        case "keyboard":
          // Handle keyboard actions
          await this.page.keyboard.press(step.value || "Enter");
          break;

        default:
          this.log("warn", `Unknown action type: ${step.action}, skipping`);
          break;
      }

      // Take after screenshot with human-readable description
      const afterDesc = `After ${step.action}: ${step.description}`;
      const afterPath = await this.takeScreenshot(`action-${this.actionSequence}-${actionName}-after`, afterDesc);

      // Collect observations
      const observations = await this.collectObservations();

      // Update action as success
      const duration = Date.now() - startTime;
      await prisma.explorationAction.update({
        where: { id: action.id },
        data: {
          status: "success",
          duration,
          beforeScreenshot: beforePath,
          afterScreenshot: afterPath,
          observations: JSON.stringify(observations),
        },
      });

      this.callbacks.onAction?.({
        type: step.action,
        description: step.description,
        status: "success",
      });

      // Check for issues
      if (observations.length > 0) {
        const issues = await this.aiProvider.identifyIssues(observations, step.description);
        for (const issue of issues) {
          await this.recordFinding(issue, afterPath);
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      // Take error screenshot to capture the state when failure occurred
      const errorDesc = `Error during ${step.action}: ${step.description}`;
      const errorPath = await this.takeScreenshot(`action-${this.actionSequence}-${actionName}-error`, errorDesc).catch(() => "");

      await prisma.explorationAction.update({
        where: { id: action.id },
        data: {
          status: "failed",
          duration,
          error: error instanceof Error ? error.message : "Unknown error",
          beforeScreenshot: beforePath,
          afterScreenshot: errorPath || null,
        },
      });

      this.callbacks.onAction?.({
        type: step.action,
        description: step.description,
        status: "failed",
      });

      throw error;
    }
  }

  private sanitizeFilename(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric chars with hyphens
      .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
      .substring(0, 50); // Limit length
  }

  private async collectObservations(): Promise<string[]> {
    const observations: string[] = [];

    // Check for console errors
    const recentErrors = this.consoleMessages
      .filter((m) => m.type === "error")
      .slice(-5)
      .map((m) => `Console error: ${m.text}`);
    observations.push(...recentErrors);

    // Check for failed network requests
    const failedRequests = this.networkResponses
      .filter((r) => r.status >= 400)
      .slice(-5)
      .map((r) => `HTTP ${r.status} on ${r.url}`);
    observations.push(...failedRequests);

    // Check for visible error messages on page
    if (this.page) {
      const errorTexts = await this.page.evaluate(() => {
        const errorSelectors = [
          ".error",
          ".alert-danger",
          ".alert-error",
          '[role="alert"]',
          ".validation-error",
        ];
        const errors: string[] = [];
        for (const selector of errorSelectors) {
          document.querySelectorAll(selector).forEach((el) => {
            const text = el.textContent?.trim();
            if (text && text.length < 200) {
              errors.push(`Visible error: ${text}`);
            }
          });
        }
        return errors;
      });
      observations.push(...errorTexts);
    }

    return observations;
  }

  private async recordFinding(
    issue: { type: string; severity: string; title: string; description: string; recommendation: string },
    evidencePath?: string
  ) {
    const finding = await prisma.explorationFinding.create({
      data: {
        runId: this.runId,
        type: issue.type,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        recommendation: issue.recommendation,
        location: this.page?.url(),
        evidence: evidencePath ? JSON.stringify([evidencePath]) : null,
      },
    });

    this.callbacks.onFinding?.({
      type: issue.type,
      severity: issue.severity,
      title: issue.title,
    });

    this.log("info", `Finding recorded: ${issue.title}`, { severity: issue.severity });

    return finding;
  }

  private async takeScreenshot(name: string, description?: string): Promise<string> {
    if (!this.page) return "";

    // Sanitize filename
    const sanitizedName = this.sanitizeFilename(name);
    const filename = `${sanitizedName}.png`;
    const filepath = path.join(this.evidenceDir, "screenshots", filename);
    const relativePath = `/evidence/${this.runId}/screenshots/${filename}`;

    try {
      // Use viewport screenshot with timeout (faster than fullPage)
      await this.page.screenshot({
        path: filepath,
        fullPage: false,  // Just viewport - much faster
        timeout: 10000,   // 10 second timeout
      });

      // Save to database with human-readable description
      await prisma.explorationEvidence.create({
        data: {
          runId: this.runId,
          type: "screenshot",
          path: relativePath,
          description: description || name,
        },
      });

      this.callbacks.onEvidence?.({ type: "screenshot", path: relativePath });

      return relativePath;
    } catch (error) {
      this.log("warn", `Failed to take screenshot: ${name}`, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return "";  // Return empty string on failure - don't block the action
    }
  }

  private async collectFinalEvidence() {
    // Save console log
    const consoleLogPath = path.join(this.evidenceDir, "console-log.json");
    await fs.writeFile(consoleLogPath, JSON.stringify(this.consoleMessages, null, 2));
    await prisma.explorationEvidence.create({
      data: {
        runId: this.runId,
        type: "console",
        path: `/evidence/${this.runId}/console-log.json`,
        description: "Console messages",
        metadata: JSON.stringify({ count: this.consoleMessages.length }),
      },
    });

    // Save network log
    const networkLogPath = path.join(this.evidenceDir, "network-log.json");
    await fs.writeFile(
      networkLogPath,
      JSON.stringify(
        {
          requests: this.networkRequests,
          responses: this.networkResponses,
        },
        null,
        2
      )
    );
    await prisma.explorationEvidence.create({
      data: {
        runId: this.runId,
        type: "network",
        path: `/evidence/${this.runId}/network-log.json`,
        description: "Network traffic",
        metadata: JSON.stringify({
          requests: this.networkRequests.length,
          responses: this.networkResponses.length,
        }),
      },
    });

    // Save final page HTML
    if (this.page) {
      const htmlPath = path.join(this.evidenceDir, "final-page.html");
      const html = await this.page.content();
      await fs.writeFile(htmlPath, html);
      await prisma.explorationEvidence.create({
        data: {
          runId: this.runId,
          type: "html",
          path: `/evidence/${this.runId}/final-page.html`,
          description: "Final page HTML",
        },
      });
    }
  }

  private async generateSummaryFinding(plans: Array<{ area: string; steps: Array<unknown> }>) {
    // Count various metrics
    const consoleErrors = this.consoleMessages.filter(m => m.type === "error").length;
    const consoleWarnings = this.consoleMessages.filter(m => m.type === "warning").length;
    const failedRequests = this.networkResponses.filter(r => r.status >= 400).length;
    const totalAreas = plans.length;
    const totalPlannedSteps = plans.reduce((sum, p) => sum + p.steps.length, 0);

    // Build summary description
    const summaryParts: string[] = [];
    summaryParts.push(`Explored ${totalAreas} area(s) with ${totalPlannedSteps} planned actions.`);

    if (consoleErrors > 0) {
      summaryParts.push(`Detected ${consoleErrors} console error(s).`);
    }
    if (consoleWarnings > 0) {
      summaryParts.push(`Detected ${consoleWarnings} console warning(s).`);
    }
    if (failedRequests > 0) {
      summaryParts.push(`${failedRequests} network request(s) returned errors.`);
    }
    if (consoleErrors === 0 && failedRequests === 0) {
      summaryParts.push("No critical errors detected during exploration.");
    }

    await this.recordFinding({
      type: "summary",
      severity: consoleErrors > 0 || failedRequests > 0 ? "medium" : "info",
      title: "Exploration Summary",
      description: summaryParts.join(" "),
      recommendation: consoleErrors > 0 || failedRequests > 0
        ? "Review the console logs and network traffic for details on the detected issues."
        : "Review the evidence collected for any subtle issues not automatically detected.",
    });
  }

  private async complete(status: "completed" | "failed") {
    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { status, endTime: new Date() },
    });

    this.log("info", `Exploration ${status}`);
  }

  private async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // Static method to start exploration (can be called from API route)
  static async start(
    runId: string,
    config: ExplorationConfig,
    aiConfig?: AIConfig
  ): Promise<void> {
    const finalAiConfig = aiConfig || (await detectBestProvider());
    const engine = new ExplorationEngine(runId, config, finalAiConfig);
    await engine.run();
  }
}
