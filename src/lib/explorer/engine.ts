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
import { explorationManager } from "./manager";
import { config as appConfig } from "@/config";
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
  private savedPlan?: Array<{ area: string; steps: Array<{ action: string; target: string; value?: string; description: string; expectedOutcome: string; riskLevel: string }> }>;

  constructor(
    runId: string,
    explorationConfig: ExplorationConfig,
    aiConfig: AIConfig,
    callbacks: ExplorationCallbacks = {},
    savedPlan?: Array<{ area: string; steps: Array<{ action: string; target: string; value?: string; description: string; expectedOutcome: string; riskLevel: string }> }>
  ) {
    this.runId = runId;
    this.config = {
      headless: true,
      viewport: appConfig.exploration.defaultViewport,
      timeout: appConfig.exploration.defaultTimeout,
      maxActions: appConfig.exploration.defaultMaxActions,
      ...explorationConfig,
    };
    this.aiConfig = aiConfig;
    this.aiProvider = createAIProvider(aiConfig);
    this.callbacks = callbacks;
    this.evidenceDir = path.join(process.cwd(), "public", "evidence", runId);
    this.savedPlan = savedPlan;
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
      await this.updateProgress(2, "Setting up browser");
      await this.setup();

      if (this.shouldStop()) throw new Error("Exploration stopped by user");

      await this.updateProgress(5, "Navigating to URL");
      await this.navigate();

      if (this.shouldStop()) throw new Error("Exploration stopped by user");

      await this.updateProgress(15, "Analyzing page structure");
      const pageAnalysis = await this.analyzePage();

      if (this.shouldStop()) throw new Error("Exploration stopped by user");

      await this.updateProgress(22, "Checking for accessibility issues");
      await this.saveInitialFindings(pageAnalysis);

      let plan;

      // Check if we have a saved plan (for reruns)
      if (this.savedPlan) {
        this.log("info", "Using saved plan from previous run (rerun mode)");
        await this.updateProgress(30, "Loading saved test plan");
        plan = this.savedPlan;

        // Save total actions for the saved plan
        const totalActions = plan.reduce((sum, p) => sum + p.steps.length, 0);
        const maxActions = this.config.maxActions ?? 50;
        const totalActionsValue = Math.min(totalActions, maxActions);
        const safeTotal = Number.isInteger(totalActionsValue) ? totalActionsValue : 0;

        this.log("info", `Rerun: Saving ${totalActions} total actions (capped at ${safeTotal})`);

        // WORKAROUND: Use raw SQL to bypass Prisma client bug
        await prisma.$executeRaw`
          UPDATE exploration_runs
          SET totalActions = ${safeTotal}
          WHERE id = ${this.runId}
        `;
      } else {
        // Generate new plan
        await this.updateProgress(25, "Generating test charter");
        const charter = await this.generateCharter(pageAnalysis);
        await this.saveCharter(charter);

        if (this.shouldStop()) throw new Error("Exploration stopped by user");

        await this.updateProgress(35, "Planning exploration strategy");
        plan = await this.planExploration(pageAnalysis, charter);
      }

      if (this.shouldStop()) throw new Error("Exploration stopped by user");

      await this.updateProgress(40, "Starting exploration");
      await this.executeExploration(plan);

      if (this.shouldStop()) throw new Error("Exploration stopped by user");

      await this.updateProgress(92, "Collecting console logs");
      await this.collectFinalEvidence();

      await this.updateProgress(96, "Generating summary report");
      await this.generateSummaryFinding(plan);

      await this.updateProgress(100, "Exploration complete");

      await this.complete("completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const isStopped = message.includes("stopped by user");
      this.log(isStopped ? "info" : "error", `Exploration ${isStopped ? "stopped" : "failed"}: ${message}`);

      // Create a finding for navigation/connection errors to make them visible in UI
      if (!isStopped && (message.includes("Cannot connect") || message.includes("Network error") || message.includes("certificate error"))) {
        await prisma.explorationFinding.create({
          data: {
            runId: this.runId,
            type: "observation",
            severity: "high",
            title: "Failed to Access Application",
            description: message,
            location: this.config.url,
            recommendation: "Ensure the application is running and accessible before starting exploration.",
          },
        }).catch(console.error);
      }

      await this.complete("failed");
      if (!isStopped) throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async setup(): Promise<void> {
    this.log("info", "Setting up browser");

    // Register with exploration manager
    explorationManager.register(this.runId);

    // Create evidence directory
    await fs.mkdir(this.evidenceDir, { recursive: true });
    await fs.mkdir(path.join(this.evidenceDir, "screenshots"), { recursive: true });

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    // Register browser with manager so it can be force-closed on stop
    explorationManager.setBrowser(this.runId, this.browser);

    // Configure browser context with optional video recording
    const contextOptions: Parameters<typeof this.browser.newContext>[0] = {
      viewport: this.config.viewport,
      ignoreHTTPSErrors: true,
    };

    // Add video recording if enabled
    if (appConfig.exploration.recordVideo) {
      contextOptions.recordVideo = {
        dir: this.evidenceDir,
        size: appConfig.exploration.videoSize,
      };
    }

    this.context = await this.browser.newContext(contextOptions);

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
    await this.updateProgress(6, "Loading page");

    try {
      await this.page.goto(this.config.url, {
        waitUntil: "networkidle",
        timeout: this.config.timeout,
      });
    } catch (error) {
      // Provide user-friendly error messages for common navigation issues
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("ERR_CONNECTION_REFUSED")) {
        const url = new URL(this.config.url);
        await this.updateProgress(8, "Connection refused - server not running");
        throw new Error(
          `Cannot connect to ${url.origin} - the server is not running or not accepting connections. ` +
          `Please ensure the application is started and accessible at ${this.config.url}`
        );
      } else if (errorMessage.includes("ERR_NAME_NOT_RESOLVED")) {
        await this.updateProgress(8, "DNS error - cannot resolve hostname");
        throw new Error(
          `Cannot resolve hostname for ${this.config.url}. ` +
          `Please check that the URL is correct and the server is accessible.`
        );
      } else if (errorMessage.includes("ERR_CERT_")) {
        await this.updateProgress(8, "SSL certificate error");
        throw new Error(
          `SSL/TLS certificate error when connecting to ${this.config.url}. ` +
          `The site may have an invalid or expired certificate.`
        );
      } else if (errorMessage.includes("Timeout") || errorMessage.includes("timeout")) {
        await this.updateProgress(8, "Navigation timeout - page took too long to load");
        throw new Error(
          `Timeout while loading ${this.config.url} (waited ${this.config.timeout}ms). ` +
          `The page took too long to load. Try increasing the timeout or check if the server is responding slowly.`
        );
      } else if (errorMessage.includes("net::ERR_")) {
        // Generic network error
        const errCode = errorMessage.match(/net::(ERR_[A-Z_]+)/)?.[1] || "UNKNOWN";
        await this.updateProgress(8, `Network error: ${errCode}`);
        throw new Error(
          `Network error (${errCode}) when connecting to ${this.config.url}. ` +
          `Please check your network connection and that the URL is accessible.`
        );
      } else {
        // Re-throw other errors with more context
        await this.updateProgress(8, "Navigation failed");
        throw new Error(
          `Failed to navigate to ${this.config.url}: ${errorMessage}`
        );
      }
    }

    await this.updateProgress(10, "Taking initial screenshot");
    await this.waitForPageStability();
    const screenshotPath = await this.takeScreenshot("01-initial-page", "Initial page load");
    this.log("info", "Initial page loaded", { screenshot: screenshotPath });

    // Handle authentication if credentials provided
    if (this.config.username && this.config.password) {
      await this.updateProgress(11, "Attempting login");
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
        await this.waitForPageStability();
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

      // Wait for potential redirects and page to stabilize
      await this.page.waitForTimeout(2000);
      await this.waitForPageStability();
      await this.takeScreenshot("03-after-login", "After login completed");

      // Verify login was successful by checking if we're still on auth page
      const currentUrl = this.page.url();
      const stillHasPassword = await this.page.$('input[type="password"]').then(el => !!el);

      if (stillHasPassword) {
        this.log("warn", `Login may have failed - still on authentication page: ${currentUrl}`);
      } else {
        this.log("info", `Login appears successful, current URL: ${currentUrl}`);
      }
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

    await this.updateProgress(16, "AI analyzing page content");
    const analysis = await this.aiProvider.analyzePageStructure(html, url);

    await this.updateProgress(17, "Extracting forms");
    const forms = await this.extractForms();

    await this.updateProgress(18, "Extracting navigation");
    const navigation = await this.extractNavigation();

    await this.updateProgress(19, "Extracting interactive elements");
    const interactiveElements = await this.extractInteractiveElements();

    await this.updateProgress(20, "Extracting links and images");
    const links = await this.extractLinks();
    const headings = await this.extractHeadings();
    const images = await this.extractImages();

    const pageAnalysis: PageAnalysis = {
      url,
      title,
      description: analysis.primaryPurpose,
      forms,
      navigation,
      interactiveElements,
      links,
      headings,
      images,
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
        // Generate better form selector
        const generateFormSelector = (formEl: HTMLFormElement, idx: number): string => {
          if (formEl.id) return `#${formEl.id}`;
          if (formEl.name) return `form[name="${formEl.name}"]`;
          if (formEl.className) {
            const classes = formEl.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              return 'form.' + classes.join('.');
            }
          }
          return `form:nth-of-type(${idx + 1})`;
        };

        const formSelector = generateFormSelector(form, formIndex);

        const fields = Array.from(form.querySelectorAll("input, select, textarea")).map(
          (field) => {
            const input = field as HTMLInputElement;
            const label = form.querySelector(`label[for="${input.id}"]`)?.textContent?.trim();

            // Generate better field selector - priority order
            let fieldSelector: string;
            if (input.id) {
              fieldSelector = `#${input.id}`;
            } else if (input.name) {
              // Use name attribute - very common and reliable for forms
              fieldSelector = `${formSelector} [name="${input.name}"]`;
            } else if (input.placeholder) {
              // Use placeholder as selector
              fieldSelector = `${formSelector} [placeholder="${input.placeholder}"]`;
            } else if (input.type) {
              // Use type within the form
              const typeInputs = form.querySelectorAll(`[type="${input.type}"]`);
              const typeIndex = Array.from(typeInputs).indexOf(input);
              fieldSelector = `${formSelector} [type="${input.type}"]:nth-of-type(${typeIndex + 1})`;
            } else {
              // Last resort: use tag name with index
              const tagInputs = form.querySelectorAll(input.tagName.toLowerCase());
              const tagIndex = Array.from(tagInputs).indexOf(input);
              fieldSelector = `${formSelector} ${input.tagName.toLowerCase()}:nth-of-type(${tagIndex + 1})`;
            }

            return {
              selector: fieldSelector,
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
          selector: formSelector,
          action: form.action || undefined,
          method: form.method || undefined,
          fields,
          submitButton: submitBtn ? {
            selector: submitBtn.id ? `#${submitBtn.id}` : `${formSelector} button[type="submit"]`,
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

      // Helper function to generate a unique, robust selector for an element
      const generateSelector = (el: HTMLElement): string => {
        // Priority 1: Use ID if available (most reliable)
        if (el.id) {
          return `#${el.id}`;
        }

        // Priority 2: Use data-testid or data-test attributes if available
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
        if (testId) {
          return `[data-testid="${testId}"]`;
        }

        // Priority 3: Use unique class combination if available
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            const classSelector = '.' + classes.join('.');
            // Check if this class combination is unique
            if (document.querySelectorAll(classSelector).length === 1) {
              return classSelector;
            }
          }
        }

        // Priority 4: Build a path using tag + text content for buttons/links
        const text = el.textContent?.trim() || '';
        if (text && text.length < 50 && (el.tagName === 'BUTTON' || el.tagName === 'A')) {
          const escapedText = text.replace(/"/g, '\\"');
          const textSelector = `${el.tagName.toLowerCase()}:has-text("${escapedText}")`;
          return textSelector;
        }

        // Priority 5: Use aria-label if available
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
          return `[aria-label="${ariaLabel}"]`;
        }

        // Fallback: Build a more specific nth-child selector with parent context
        let path = el.tagName.toLowerCase();
        let current: Element | null = el;
        let parent = current.parentElement;

        if (parent) {
          const siblings = Array.from(parent.children).filter(
            child => child.tagName === current!.tagName
          );
          const index = siblings.indexOf(current);
          if (index >= 0) {
            path = `${parent.tagName.toLowerCase()} > ${path}:nth-of-type(${index + 1})`;
          }
        }

        return path;
      };

      // Extract clickable elements (buttons, links)
      const clickableSelectors = ["button", 'a[href]', 'input[type="submit"]', 'input[type="button"]', "[onclick]", "[data-toggle]"];

      for (const selector of clickableSelectors) {
        document.querySelectorAll(selector).forEach((el) => {
          const htmlEl = el as HTMLElement;
          const text = htmlEl.textContent?.trim() || "";
          if (text.length < 100) {
            elements.push({
              selector: generateSelector(htmlEl),
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

      // Extract fillable inputs (text, email, etc.) that are NOT in forms
      // (form inputs are handled separately in extractForms)
      const fillableSelectors = [
        'input[type="text"]',
        'input[type="email"]',
        'input[type="password"]',
        'input[type="search"]',
        'input[type="tel"]',
        'input[type="url"]',
        'input[type="number"]',
        'input:not([type])', // inputs without type default to text
        'textarea',
      ];

      for (const selector of fillableSelectors) {
        document.querySelectorAll(selector).forEach((el) => {
          const htmlEl = el as HTMLInputElement | HTMLTextAreaElement;
          // Skip if this input is part of a form (those are handled separately)
          if (htmlEl.closest('form')) return;

          const placeholder = htmlEl.placeholder || '';
          const name = htmlEl.getAttribute('name') || '';

          elements.push({
            selector: generateSelector(htmlEl),
            tagName: htmlEl.tagName,
            type: htmlEl.type || 'text',
            text: placeholder || name || `${htmlEl.tagName.toLowerCase()} field`,
            ariaLabel: htmlEl.getAttribute("aria-label") || undefined,
            isVisible: htmlEl.offsetParent !== null,
            isEnabled: !htmlEl.disabled,
          });
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
      const images: Array<{
        src: string;
        alt?: string;
        hasAlt: boolean;
        selector: string;
        dimensions: string;
        context: string;
      }> = [];

      document.querySelectorAll("img").forEach((img, index) => {
        // Build a useful selector
        let selector = "img";
        if (img.id) {
          selector = `#${img.id}`;
        } else if (img.className) {
          selector = `img.${img.className.split(' ')[0]}`;
        } else {
          selector = `img:nth-of-type(${index + 1})`;
        }

        // Get parent context
        const parent = img.parentElement;
        const context = parent
          ? `inside ${parent.tagName.toLowerCase()}${parent.className ? '.' + parent.className.split(' ')[0] : ''}`
          : '';

        images.push({
          src: img.src,
          alt: img.alt || undefined,
          hasAlt: !!img.alt,
          selector,
          dimensions: `${img.naturalWidth || img.width}x${img.naturalHeight || img.height}`,
          context,
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
    // Take a screenshot for initial findings evidence
    await this.waitForPageStability();
    const initialScreenshot = await this.takeScreenshot("initial-findings", "Initial page state for findings");

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
      }, initialScreenshot); // Attach screenshot as evidence
    }

    // Check for common issues that weren't explicitly flagged
    // Images without alt text
    const imagesWithoutAlt = pageAnalysis.images.filter(img => !img.hasAlt);
    if (imagesWithoutAlt.length > 0) {
      // List the images with useful identifying info
      const imageList = imagesWithoutAlt
        .slice(0, 10) // Limit to first 10
        .map(img => {
          const src = img.src || '';

          // Handle different src types
          let srcInfo: string;
          if (src.startsWith('data:')) {
            // Data URI - show type and size hint
            const mimeMatch = src.match(/^data:([^;,]+)/);
            const mime = mimeMatch ? mimeMatch[1] : 'unknown';
            srcInfo = `[inline ${mime}]`;
          } else if (src.startsWith('blob:')) {
            srcInfo = '[blob URL]';
          } else {
            // Regular URL - extract meaningful part
            try {
              const url = new URL(src);
              const pathname = url.pathname;
              const filename = pathname.split('/').pop() || pathname;
              srcInfo = filename.length > 40 ? filename.substring(0, 37) + '...' : filename;
            } catch {
              srcInfo = src.length > 40 ? src.substring(0, 37) + '...' : src;
            }
          }

          // Add selector and context for easier identification
          const selector = (img as { selector?: string }).selector || 'img';
          const context = (img as { context?: string }).context || '';
          const dimensions = (img as { dimensions?: string }).dimensions || '';

          return `${srcInfo} (${selector}${dimensions ? ', ' + dimensions : ''}${context ? ', ' + context : ''})`;
        })
        .join('\n  - ');

      const moreText = imagesWithoutAlt.length > 10
        ? `\n  ...and ${imagesWithoutAlt.length - 10} more`
        : '';

      await this.recordFinding({
        type: "accessibility",
        severity: "medium",
        title: `${imagesWithoutAlt.length} image(s) missing alt text`,
        description: `Found ${imagesWithoutAlt.length} images without alt attributes, which affects screen reader users:\n  - ${imageList}${moreText}`,
        recommendation: "Add descriptive alt text to all images for better accessibility.",
      }, initialScreenshot);
    }

    // Forms without proper labels
    const formsWithUnlabeledFields = pageAnalysis.forms.filter(form =>
      form.fields.some(field => !field.label && field.type !== "hidden")
    );
    if (formsWithUnlabeledFields.length > 0) {
      // List the fields without labels
      const fieldList = formsWithUnlabeledFields
        .flatMap(form => form.fields.filter(f => !f.label && f.type !== "hidden"))
        .slice(0, 10)
        .map(f => `${f.name || f.type} (${f.selector})`)
        .join('\n  - ');

      await this.recordFinding({
        type: "accessibility",
        severity: "medium",
        title: "Form fields missing labels",
        description: `Some form fields are missing associated labels, which affects accessibility:\n  - ${fieldList}`,
        recommendation: "Add proper <label> elements or aria-label attributes to all form fields.",
      }, initialScreenshot);
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

    // Plan exploration for high and medium priority test ideas
    const highPriorityIdeas = charter.testIdeas
      .filter((t) => t.priority === "high")
      .slice(0, 5);

    const mediumPriorityIdeas = charter.testIdeas
      .filter((t) => t.priority === "medium")
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

    // Get available selectors to help AI choose valid ones
    const availableSelectors = this.getAvailableSelectors(pageAnalysis);

    // Plan for high priority ideas
    for (const idea of highPriorityIdeas) {
      try {
        const validatedPlan = await this.planWithValidation(
          idea.area,
          simplifiedAnalysis,
          charter,
          availableSelectors
        );
        if (validatedPlan && validatedPlan.steps.length > 0) {
          plans.push({ area: idea.area, ...validatedPlan });
        } else {
          this.log("warn", `Plan for "${idea.area}" had no valid selectors after validation, skipping`);
        }
      } catch (error) {
        this.log("warn", `Failed to plan for area ${idea.area}: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    // Plan for medium priority ideas
    for (const idea of mediumPriorityIdeas) {
      try {
        const validatedPlan = await this.planWithValidation(
          idea.area,
          simplifiedAnalysis,
          charter,
          availableSelectors
        );
        if (validatedPlan && validatedPlan.steps.length > 0) {
          plans.push({ area: idea.area, ...validatedPlan });
        } else {
          this.log("warn", `Plan for "${idea.area}" had no valid selectors after validation, skipping`);
        }
      } catch (error) {
        this.log("warn", `Failed to plan for area ${idea.area}: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    // Add basic exploration of interactive elements (buttons, links)
    const interactiveToExplore = pageAnalysis.interactiveElements
      .filter(el => el.isVisible && el.isEnabled)
      .slice(0, 8);

    if (interactiveToExplore.length > 0) {
      plans.push({
        area: "Interactive Elements",
        objective: "Test clickable buttons and links",
        steps: interactiveToExplore.slice(0, 5).map((el) => ({
          action: "click" as const,
          target: el.selector,
          value: undefined,
          description: `Click ${el.text || el.ariaLabel || "element"}`,
          expectedOutcome: "Element responds to interaction",
          riskLevel: "safe" as const,
        })),
        expectedFindings: ["Button/link behavior", "Navigation patterns"],
        risks: [],
      });
    }

    // Add basic exploration of forms
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

    // Save total actions and the plan itself
    const totalActions = plans.reduce((sum, p) => sum + p.steps.length, 0);
    const maxActions = this.config.maxActions ?? 50; // Fallback to 50 if undefined
    const totalActionsValue = Math.min(totalActions, maxActions);

    this.log("info", `Saving plan with ${totalActions} total actions (capped at ${totalActionsValue}, max=${maxActions})`);
    this.log("info", `Types: totalActions=${typeof totalActions}, maxActions=${typeof maxActions}, totalActionsValue=${typeof totalActionsValue}`);
    this.log("info", `Values: totalActions=${totalActions}, maxActions=${maxActions}, totalActionsValue=${totalActionsValue}`);

    // WORKAROUND: Prisma client has a persistent bug with totalActions field
    // Use raw SQL to bypass the typed client completely
    // Ensure totalActionsValue is a valid integer
    const safeTotal = Number.isInteger(totalActionsValue) ? totalActionsValue : 0;

    this.log("info", `Final safeTotal value: ${safeTotal} (type: ${typeof safeTotal})`);

    await prisma.$executeRaw`
      UPDATE exploration_runs
      SET
        totalActions = ${safeTotal},
        plan = ${JSON.stringify(plans)}
      WHERE id = ${this.runId}
    `;

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

    // Check page state before starting exploration
    const initialState = await this.validatePageState();
    if (!initialState.isValid) {
      this.log("error", `Cannot proceed with exploration: ${initialState.reason}`);
      await this.takeScreenshot("exploration-blocked", "Exploration blocked by page state");
      // Don't throw error, just skip exploration and complete gracefully
      return;
    }

    let actionsExecuted = 0;
    const maxActions = this.config.maxActions!;
    const totalPlannedActions = Math.min(
      plans.reduce((sum, p) => sum + p.steps.length, 0),
      maxActions
    );

    for (let planIndex = 0; planIndex < plans.length; planIndex++) {
      const plan = plans[planIndex];
      if (actionsExecuted >= maxActions) break;
      if (this.shouldStop()) break;

      // Update progress for new area
      const areaProgress = 42 + Math.floor((planIndex / plans.length) * 5);
      await this.updateProgress(areaProgress, `Exploring: ${plan.area}`);
      this.log("info", `Exploring area: ${plan.area}`);

      // Track consecutive failures for this plan
      let consecutiveFailures = 0;
      const maxConsecutiveFailures = appConfig.exploration.maxConsecutiveFailures;

      for (const step of plan.steps) {
        if (actionsExecuted >= maxActions) break;
        if (this.shouldStop()) break;

        // Check if we've hit too many consecutive failures - abort this plan
        if (consecutiveFailures >= maxConsecutiveFailures) {
          this.log("warn", `Aborting plan "${plan.area}" after ${consecutiveFailures} consecutive failures`);
          break;
        }

        // Validate page state before executing step
        const pageState = await this.validatePageState();
        if (!pageState.isValid) {
          this.log("warn", `Skipping plan "${plan.area}" - ${pageState.reason}`);
          consecutiveFailures = maxConsecutiveFailures; // Force skip rest of plan
          break;
        }

        // Update progress before action (shows what's currently running)
        const progress = 45 + Math.floor((actionsExecuted / totalPlannedActions) * 45);
        const truncatedDesc = step.description.length > 50
          ? step.description.substring(0, 47) + "..."
          : step.description;
        await this.updateProgress(progress, `[${actionsExecuted + 1}/${totalPlannedActions}] ${truncatedDesc}`);

        try {
          await this.executeStep(step);
          actionsExecuted++;
          consecutiveFailures = 0; // Reset on success
        } catch (error) {
          this.log("warn", `Step failed: ${step.description} - ${error instanceof Error ? error.message : "Unknown"}`);
          actionsExecuted++; // Still count failed actions
          consecutiveFailures++; // Increment failure counter
        }
      }
    }

    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { completedActions: actionsExecuted },
    });
  }

  private async closeOverlaysIfPresent() {
    if (!this.page) return;

    try {
      // Check for common overlay/modal patterns
      const overlaySelectors = [
        '[data-euiportal="true"] .euiOverlayMask', // Elastic UI overlays
        '.euiFlyout', // Elastic UI flyouts
        '[role="dialog"]', // ARIA dialogs
        '.modal', // Generic modals
        '[class*="overlay"]', // Classes containing "overlay"
      ];

      for (const selector of overlaySelectors) {
        const overlay = await this.page.$(selector);
        if (overlay && await overlay.isVisible()) {
          this.log("info", `Detected overlay (${selector}), attempting to close`);

          // Try pressing Escape to close
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(500);

          // Check if overlay is gone
          const stillVisible = await overlay.isVisible().catch(() => false);
          if (!stillVisible) {
            this.log("info", "Overlay closed successfully");
            return;
          }

          // If still there, try clicking close button
          const closeButtons = await this.page.$$('button[aria-label*="close" i], button[aria-label*="dismiss" i], .euiFlyout__closeButton');
          for (const btn of closeButtons) {
            if (await btn.isVisible()) {
              await btn.click();
              await this.page.waitForTimeout(500);
              break;
            }
          }
        }
      }
    } catch (error) {
      // Silently continue if overlay handling fails
      this.log("debug", `Overlay handling skipped: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  private async capturePageState() {
    if (!this.page) return null;

    try {
      const url = this.page.url();
      const title = await this.page.title();

      // Capture key page indicators
      const bodyText = await this.page.evaluate(() => {
        // Get visible text from body, limited to first 500 chars
        return document.body?.innerText?.substring(0, 500) || '';
      });

      const elementCount = await this.page.evaluate(() => {
        return {
          buttons: document.querySelectorAll('button').length,
          links: document.querySelectorAll('a').length,
          inputs: document.querySelectorAll('input').length,
          modals: document.querySelectorAll('[role="dialog"], .modal').length,
        };
      });

      return {
        url,
        title,
        bodyText,
        elementCount,
        timestamp: Date.now(),
      };
    } catch (error) {
      return null;
    }
  }

  private verifyOutcome(
    step: { action: string; target: string; description: string; expectedOutcome: string },
    beforeState: Awaited<ReturnType<typeof this.capturePageState>>,
    afterState: Awaited<ReturnType<typeof this.capturePageState>>
  ): { success: boolean; reason?: string } {
    // If we couldn't capture state, assume success
    if (!beforeState || !afterState) {
      return { success: true };
    }

    // For wait actions, verify that something actually changed
    if (step.action === "wait") {
      // Check if URL changed
      if (beforeState.url !== afterState.url) {
        return { success: true };
      }

      // Check if title changed
      if (beforeState.title !== afterState.title) {
        return { success: true };
      }

      // Check if page content changed significantly
      if (beforeState.bodyText !== afterState.bodyText) {
        return { success: true };
      }

      // Check if modals appeared/disappeared
      if (beforeState.elementCount.modals !== afterState.elementCount.modals) {
        return { success: true };
      }

      // Nothing changed during wait
      return {
        success: false,
        reason: `Waited ${step.target || '1000ms'} but page state did not change (URL, title, and content remained identical)`,
      };
    }

    // For click actions, expect some change
    if (step.action === "click") {
      // URL change is a strong indicator something happened
      if (beforeState.url !== afterState.url) {
        return { success: true };
      }

      // Modal opened/closed
      if (beforeState.elementCount.modals !== afterState.elementCount.modals) {
        return { success: true };
      }

      // Content changed significantly
      const contentSimilarity = this.calculateSimilarity(beforeState.bodyText, afterState.bodyText);
      if (contentSimilarity < 0.9) {
        return { success: true };
      }

      // For clicks, allow no change (might be a no-op button or already selected)
      return { success: true };
    }

    // For fill actions, just verify it completed without error
    if (step.action === "fill") {
      return { success: true };
    }

    // For other actions, assume success if no error was thrown
    return { success: true };
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple similarity check - percentage of matching characters
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;

    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;

    let matches = 0;
    const minLen = Math.min(str1.length, str2.length);
    for (let i = 0; i < minLen; i++) {
      if (str1[i] === str2[i]) matches++;
    }

    return matches / maxLen;
  }

  private async validatePageState(): Promise<{ isValid: boolean; reason?: string }> {
    if (!this.page) return { isValid: false, reason: "Page not initialized" };

    const currentUrl = this.page.url();
    const pageTitle = await this.page.title().catch(() => "");

    // Check if we've been redirected to an authentication page
    const authPatterns = [
      /login/i,
      /sign-?in/i,
      /auth/i,
      /authenticate/i,
      /accounts\.google/i,
      /login\.microsoftonline/i,
      /okta\.com/i,
      /auth0\.com/i,
    ];

    const isAuthUrl = authPatterns.some(pattern => pattern.test(currentUrl));
    const isAuthTitle = authPatterns.some(pattern => pattern.test(pageTitle));

    if (isAuthUrl || isAuthTitle) {
      // Check if we have credentials configured
      if (!this.config.username || !this.config.password) {
        return {
          isValid: false,
          reason: `Authentication required at ${currentUrl} but no credentials provided. Use saved configurations to provide login details.`,
        };
      }

      // If we have credentials, check if we're still on auth page (login might have failed)
      const hasPasswordField = await this.page.$('input[type="password"]').then(el => !!el);
      if (hasPasswordField) {
        return {
          isValid: false,
          reason: `Login appears to have failed or requires additional verification. Still on authentication page: ${currentUrl}`,
        };
      }
    }

    // Check for error pages
    const errorPatterns = [
      /error/i,
      /404/,
      /403/,
      /500/,
      /not.?found/i,
      /access.?denied/i,
      /unavailable/i,
    ];

    const isErrorUrl = errorPatterns.some(pattern => pattern.test(currentUrl));
    const isErrorTitle = errorPatterns.some(pattern => pattern.test(pageTitle));

    if (isErrorUrl || isErrorTitle) {
      return {
        isValid: false,
        reason: `Encountered error page: ${pageTitle} (${currentUrl})`,
      };
    }

    // Check for CAPTCHA or bot detection
    const hasCaptcha = await this.page.evaluate(() => {
      const captchaSelectors = [
        '#g-recaptcha',
        '.g-recaptcha',
        '[data-sitekey]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]',
        '[class*="captcha"]',
        '[id*="captcha"]',
      ];
      return captchaSelectors.some(selector => !!document.querySelector(selector));
    });

    if (hasCaptcha) {
      return {
        isValid: false,
        reason: "CAPTCHA or bot detection encountered - cannot proceed with automated testing",
      };
    }

    return { isValid: true };
  }

  /**
   * Extract a list of available selectors from page analysis
   * This helps the AI choose valid selectors when regenerating plans
   */
  private getAvailableSelectors(pageAnalysis: PageAnalysis): string[] {
    const selectors: string[] = [];

    // Add interactive element selectors
    pageAnalysis.interactiveElements.forEach((el) => {
      if (el.selector && el.isVisible && el.isEnabled) {
        selectors.push(el.selector);
      }
    });

    // Add form field selectors
    pageAnalysis.forms.forEach((form) => {
      if (form.selector) selectors.push(form.selector);
      form.fields.forEach((field) => {
        if (field.selector) selectors.push(field.selector);
      });
      if (form.submitButton?.selector) {
        selectors.push(form.submitButton.selector);
      }
    });

    // Add navigation selectors
    pageAnalysis.navigation.forEach((nav) => {
      if (nav.selector) selectors.push(nav.selector);
    });

    return selectors;
  }

  /**
   * Plan exploration with validation and retries
   * If the AI generates invalid selectors, we provide feedback and ask it to regenerate
   */
  private async planWithValidation(
    area: string,
    simplifiedAnalysis: any,
    charter: Awaited<ReturnType<AIProvider["generateTestCharter"]>>,
    availableSelectors: string[],
    maxRetries: number = 2
  ): Promise<{
    objective: string;
    steps: Array<{ action: string; target: string; value?: string; description: string; expectedOutcome: string; riskLevel: string }>;
    expectedFindings: string[];
    risks: string[];
  } | null> {
    let attempt = 0;
    let lastInvalidSelectors: Array<{ selector: string; description: string }> = [];

    while (attempt <= maxRetries) {
      // Generate plan (with feedback on subsequent attempts)
      let plan;
      if (attempt === 0) {
        // First attempt - no feedback
        plan = await this.aiProvider.proposeExplorationPlan(
          area,
          simplifiedAnalysis,
          charter
        );
      } else {
        // Retry with feedback about invalid selectors
        this.log("info", `Regenerating plan for "${area}" (attempt ${attempt + 1}/${maxRetries + 1}) due to invalid selectors`);

        // Build feedback message
        const invalidSelectorsList = lastInvalidSelectors
          .map(s => `- "${s.selector}" (for: ${s.description})`)
          .join('\n');

        const availableSelectorsList = availableSelectors
          .slice(0, 20) // Limit to avoid overwhelming the AI
          .map(s => `- ${s}`)
          .join('\n');

        const feedback = `
VALIDATION FEEDBACK: Some selectors in your previous plan don't exist on the page.

Invalid selectors:
${invalidSelectorsList}

Here are some selectors that DO exist on the page:
${availableSelectorsList}

Please regenerate the plan using ONLY selectors that actually exist on the page. Do not invent data-testid or data-test attributes that aren't present.
`;

        // For now, we'll treat this as a new attempt with the same inputs
        // In the future, we could extend the AI provider interface to accept feedback
        plan = await this.aiProvider.proposeExplorationPlan(
          area + "\n\n" + feedback,
          simplifiedAnalysis,
          charter
        );
      }

      // Validate selectors
      const validation = await this.validatePlanSelectors(plan);

      // If all selectors are valid, or we have some valid steps, return
      if (validation.invalidSelectors.length === 0) {
        if (attempt > 0) {
          this.log("info", `Successfully regenerated plan for "${area}" with valid selectors`);
        }
        return validation.plan;
      }

      // If we still have invalid selectors but some valid steps, return what we have
      if (validation.plan.steps.length > 0 && attempt === maxRetries) {
        this.log("info", `Returning partial plan for "${area}" with ${validation.plan.steps.length} valid steps (${validation.invalidSelectors.length} invalid selectors filtered)`);
        return validation.plan;
      }

      // If no valid steps and we have retries left, try again
      if (validation.plan.steps.length === 0 && attempt < maxRetries) {
        lastInvalidSelectors = validation.invalidSelectors;
        attempt++;
        continue;
      }

      // No valid steps and no retries left
      return null;
    }

    return null;
  }

  private async validatePlanSelectors(plan: {
    objective: string;
    steps: Array<{ action: string; target: string; value?: string; description: string; expectedOutcome: string; riskLevel: string }>;
    expectedFindings: string[];
    risks: string[];
  }): Promise<{
    plan: typeof plan;
    invalidSelectors: Array<{ selector: string; description: string }>;
  }> {
    if (!this.page) return { plan, invalidSelectors: [] };

    const validSteps = [];
    const invalidSelectors: Array<{ selector: string; description: string }> = [];

    for (const step of plan.steps) {
      // Skip steps that don't have selectors (like wait, assert, etc.)
      if (!step.target || step.action === "wait" || step.action === "assert" || step.action === "check") {
        validSteps.push(step);
        continue;
      }

      // Check if selector exists on the page
      try {
        // Use waitFor with timeout instead of count with timeout
        await this.page.locator(step.target).first().waitFor({
          state: 'attached',
          timeout: appConfig.exploration.selectorValidationTimeout
        });
        validSteps.push(step);
      } catch (error) {
        // Invalid selector syntax or not found
        this.log("info", `Invalid selector: ${step.target} (${step.description})`);
        invalidSelectors.push({
          selector: step.target,
          description: step.description,
        });
      }
    }

    return {
      plan: {
        ...plan,
        steps: validSteps,
      },
      invalidSelectors,
    };
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

    // Capture page state before action for comparison
    const beforeState = await this.capturePageState();

    try {
      // Try to close any overlays before executing actions
      await this.closeOverlaysIfPresent();

      // Execute the action
      switch (step.action) {
        case "click":
          try {
            // Ensure element is in viewport before clicking
            await this.page.locator(step.target).scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
            await this.page.click(step.target, { timeout: 5000 });
          } catch (clickError) {
            // If click fails, try recovery strategies
            if (clickError instanceof Error) {
              if (clickError.message.includes('intercepts pointer events')) {
                this.log("info", "Element blocked by overlay, attempting force click");
                await this.closeOverlaysIfPresent();
                await this.page.click(step.target, { timeout: 5000, force: true });
              } else if (clickError.message.includes('outside of the viewport')) {
                this.log("info", "Element outside viewport, using JavaScript click");
                // Use JavaScript click as a last resort - it bypasses viewport checks
                await this.page.evaluate((selector) => {
                  const element = document.querySelector(selector);
                  if (element instanceof HTMLElement) {
                    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                    // Use JavaScript click which doesn't require viewport visibility
                    element.click();
                  }
                }, step.target);
                // Wait for potential navigation/changes
                await this.page.waitForTimeout(500);
              } else {
                throw clickError;
              }
            } else {
              throw clickError;
            }
          }
          break;

        case "fill":
          try {
            // Verify element is fillable before attempting
            const elementInfo = await this.page.locator(step.target).evaluate((el) => ({
              tagName: el.tagName,
              type: (el as HTMLInputElement).type || null,
              isButton: el.tagName === 'BUTTON' || (el as HTMLInputElement).type === 'button' || (el as HTMLInputElement).type === 'submit',
            }));

            if (elementInfo.isButton) {
              throw new Error(`Cannot fill element - target is a ${elementInfo.tagName.toLowerCase()} button. Use "click" action instead.`);
            }

            await this.page.fill(step.target, step.value || "", { timeout: 5000 });
          } catch (fillError) {
            // Provide better error message if trying to fill non-input element
            if (fillError instanceof Error && fillError.message.includes('not an <input>')) {
              throw new Error(`Cannot fill element - target is not a fillable input field (use "click" action for buttons)`);
            }
            throw fillError;
          }
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

      // Wait for page to stabilize before taking after screenshot
      await this.waitForPageStability();

      // Take after screenshot with human-readable description
      const afterDesc = `After ${step.action}: ${step.description}`;
      const afterPath = await this.takeScreenshot(`action-${this.actionSequence}-${actionName}-after`, afterDesc);

      // Capture page state after action
      const afterState = await this.capturePageState();

      // Verify expected outcome
      const outcomeVerification = this.verifyOutcome(step, beforeState, afterState);
      if (!outcomeVerification.success) {
        this.log("warn", `Action completed but expected outcome not met: ${outcomeVerification.reason}`);
      }

      // Collect observations
      const observations = await this.collectObservations();

      // Add outcome verification to observations if it failed
      if (!outcomeVerification.success) {
        observations.unshift(`Expected outcome not met: ${outcomeVerification.reason}`);
      }

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

  /**
   * Wait for page to stabilize after an action
   * Waits for network idle + additional delay for animations/transitions
   */
  private async waitForPageStability(): Promise<void> {
    if (!this.page) return;

    try {
      // Wait for network to be idle (no network activity for 500ms)
      await this.page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
        // Network might already be idle or timeout - that's ok
      });

      // Additional delay for animations, transitions, and dynamic content
      // This ensures modals, dropdowns, tooltips, etc. are fully rendered
      await this.page.waitForTimeout(appConfig.exploration.screenshotDelay);
    } catch (error) {
      // If waiting fails, log but continue - we'll still take the screenshot
      this.log("debug", `Page stability wait failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async takeScreenshot(name: string, description?: string): Promise<string> {
    if (!this.page) return "";

    // Sanitize filename (limit to 40 chars to keep full path reasonable)
    const sanitizedName = this.sanitizeFilename(name).substring(0, 40);
    const filename = `${sanitizedName}.png`;
    const filepath = path.join(this.evidenceDir, "screenshots", filename);
    const relativePath = `/evidence/${this.runId}/screenshots/${filename}`;

    try {
      // Use viewport screenshot with generous timeout
      await this.page.screenshot({
        path: filepath,
        fullPage: false,  // Just viewport - much faster
        timeout: appConfig.exploration.screenshotTimeout,
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
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      // Include error message in the log for visibility
      this.log("warn", `Screenshot failed: ${errorMsg.substring(0, 100)}`);
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

    // Save video recording if enabled
    if (appConfig.exploration.recordVideo && this.page) {
      try {
        // Get video from page (video recording is automatic when enabled)
        const video = this.page.video();
        if (video) {
          // Close page to finalize video
          await this.page.close();
          this.page = null;

          // Wait for video to be saved
          const videoPath = await video.path();

          // Move video to a consistent location
          const targetVideoPath = path.join(this.evidenceDir, "exploration-recording.webm");
          await fs.rename(videoPath, targetVideoPath);

          // Get video file size for metadata
          const stats = await fs.stat(targetVideoPath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

          this.log("info", `Video recording saved: ${fileSizeMB}MB`);

          await prisma.explorationEvidence.create({
            data: {
              runId: this.runId,
              type: "video",
              path: `/evidence/${this.runId}/exploration-recording.webm`,
              description: "Full exploration recording",
              metadata: JSON.stringify({
                sizeBytes: stats.size,
                sizeMB: fileSizeMB,
                format: "webm",
              }),
            },
          });
        }
      } catch (error) {
        this.log("warn", `Failed to save video recording: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }

  private async generateSummaryFinding(plans: Array<{ area: string; steps: Array<unknown> }>) {
    // Take final screenshot for summary evidence
    await this.waitForPageStability();
    const finalScreenshot = await this.takeScreenshot("final-summary", "Final page state for summary");

    // Count various metrics
    const consoleErrors = this.consoleMessages.filter(m => m.type === "error").length;
    const consoleWarnings = this.consoleMessages.filter(m => m.type === "warn").length;
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
    }, finalScreenshot);
  }

  private async complete(status: "completed" | "failed") {
    // Mark any actions still in "running" status as skipped/cancelled
    await prisma.explorationAction.updateMany({
      where: {
        runId: this.runId,
        status: "running",
      },
      data: {
        status: status === "completed" ? "skipped" : "cancelled",
      },
    });

    await prisma.explorationRun.update({
      where: { id: this.runId },
      data: { status, endTime: new Date() },
    });

    this.log("info", `Exploration ${status}`);
  }

  private async cleanup() {
    // Unregister from manager
    explorationManager.unregister(this.runId);

    if (this.browser) {
      await this.browser.close().catch(() => {});  // May already be closed by manager
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  private shouldStop(): boolean {
    return explorationManager.shouldStop(this.runId);
  }

  // Static method to start exploration (can be called from API route)
  static async start(
    runId: string,
    config: ExplorationConfig,
    aiConfig?: AIConfig,
    savedPlan?: Array<{ area: string; steps: Array<{ action: string; target: string; value?: string; description: string; expectedOutcome: string; riskLevel: string }> }>
  ): Promise<void> {
    const finalAiConfig = aiConfig || (await detectBestProvider());
    const engine = new ExplorationEngine(runId, config, finalAiConfig, {}, savedPlan);
    await engine.run();
  }
}
