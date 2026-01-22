// Ollama AI Provider implementation

import type {
  AIProvider,
  AIConfig,
  PageStructureAnalysis,
  GeneratedCharter,
  ExplorationPlanResult,
  ScreenshotAnalysis,
  IdentifiedIssue,
} from "./types";

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

export class OllamaProvider implements AIProvider {
  name = "ollama";
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = {
      baseUrl: "http://localhost:11434",
      model: "qwen2.5:14b",
      temperature: 0.7,
      maxTokens: 4096,
      ...config,
    };
  }

  private async chat(prompt: string, systemPrompt?: string): Promise<string> {
    const url = `${this.config.baseUrl}/api/generate`;

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaResponse;
    return data.response;
  }

  private extractJSON<T>(text: string): T {
    // Try to extract JSON from markdown code blocks or raw text
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

    // Try to find JSON object or array
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);

    const finalJson = objectMatch?.[0] || arrayMatch?.[0] || jsonStr;

    try {
      return JSON.parse(finalJson) as T;
    } catch {
      throw new Error(`Failed to parse JSON from response: ${text.substring(0, 200)}...`);
    }
  }

  async analyzePageStructure(html: string, url: string): Promise<PageStructureAnalysis> {
    const systemPrompt = `You are an expert QA engineer analyzing web pages for exploratory testing.
Analyze the HTML structure and identify testable areas, forms, navigation, and potential risks.
Always respond with valid JSON only, no markdown or explanations.`;

    const prompt = `Analyze this web page structure and provide a JSON response:

URL: ${url}

HTML (truncated to key elements):
${this.truncateHTML(html)}

Respond with this exact JSON structure:
{
  "appType": "string describing app type (e.g., e-commerce, dashboard, blog)",
  "primaryPurpose": "what this page is for",
  "keyAreas": [
    {
      "name": "area name",
      "description": "what this area does",
      "importance": "high|medium|low",
      "suggestedTests": ["test idea 1", "test idea 2"]
    }
  ],
  "navigation": [
    {
      "label": "nav item text",
      "selector": "CSS selector",
      "type": "main|secondary|footer|breadcrumb",
      "hasSubmenu": true/false
    }
  ],
  "forms": [
    {
      "purpose": "what the form does",
      "selector": "CSS selector",
      "fields": [
        {
          "name": "field name",
          "type": "text|email|password|etc",
          "selector": "CSS selector",
          "required": true/false
        }
      ],
      "submitSelector": "CSS selector for submit button"
    }
  ],
  "interactiveElements": [
    {
      "description": "what this element does",
      "selector": "CSS selector",
      "type": "button|link|input|dropdown|modal-trigger|other",
      "importance": "high|medium|low"
    }
  ],
  "potentialRisks": ["risk 1", "risk 2"],
  "accessibilityNotes": ["note 1", "note 2"]
}`;

    const response = await this.chat(prompt, systemPrompt);
    return this.extractJSON<PageStructureAnalysis>(response);
  }

  async generateTestCharter(analysis: PageStructureAnalysis): Promise<GeneratedCharter> {
    const systemPrompt = `You are an expert exploratory tester creating test charters.
Based on the page analysis, create a focused test charter with specific test ideas.
Always respond with valid JSON only.`;

    const prompt = `Create a test charter based on this page analysis:

App Type: ${analysis.appType}
Purpose: ${analysis.primaryPurpose}
Key Areas: ${analysis.keyAreas.map((a) => a.name).join(", ")}
Potential Risks: ${analysis.potentialRisks.join(", ")}

Respond with this exact JSON structure:
{
  "mission": "Explore [target] using [approach] to discover [information about risks/quality]",
  "riskFocus": "The main risk we're investigating",
  "scope": "What's included in this testing session",
  "outOfScope": ["what we won't test"],
  "testIdeas": [
    {
      "area": "which area to test",
      "idea": "specific test scenario",
      "priority": "high|medium|low",
      "rationale": "why this test matters"
    }
  ],
  "suggestedDuration": 30
}`;

    const response = await this.chat(prompt, systemPrompt);
    return this.extractJSON<GeneratedCharter>(response);
  }

  async proposeExplorationPlan(
    area: string,
    pageAnalysis: PageStructureAnalysis,
    charter: GeneratedCharter
  ): Promise<ExplorationPlanResult> {
    const systemPrompt = `You are an expert QA automation engineer creating exploration plans.
Given an area to explore and context, propose specific actions to take.
Use real CSS selectors from the page analysis when available.
Always respond with valid JSON only.`;

    const relevantArea = pageAnalysis.keyAreas.find((a) => a.name === area);
    const relevantIdeas = charter.testIdeas.filter((t) => t.area === area);

    const prompt = `Create an exploration plan for this area:

Area: ${area}
${relevantArea ? `Description: ${relevantArea.description}` : ""}
${relevantArea ? `Suggested Tests: ${relevantArea.suggestedTests.join(", ")}` : ""}
${relevantIdeas.length > 0 ? `Test Ideas: ${relevantIdeas.map((i) => i.idea).join(", ")}` : ""}

Available elements on page:
${JSON.stringify(pageAnalysis.interactiveElements.slice(0, 20), null, 2)}

Forms on page:
${JSON.stringify(pageAnalysis.forms, null, 2)}

IMPORTANT: Focus on concrete, clickable elements with specific CSS selectors. Avoid abstract keyboard navigation tests - use direct click actions instead.

Respond with this exact JSON structure:
{
  "objective": "What we want to learn from exploring this area",
  "steps": [
    {
      "action": "click|fill|select|hover|scroll|wait",
      "target": "Specific CSS selector like #id, .class, or [data-testid='x'] - NOT generic selectors like button:nth-of-type(N)",
      "value": "value to fill (if applicable)",
      "description": "Human-readable step description (what action we're taking)",
      "expectedOutcome": "What should happen",
      "riskLevel": "safe|moderate|risky"
    }
  ],
  "expectedFindings": ["what we might discover"],
  "risks": ["potential issues with this plan"]
}

Rules:
- Use SPECIFIC selectors from the Available elements list, not generic nth-of-type selectors
- Keep steps to direct interactions (click, fill) not keyboard navigation
- Maximum 5 steps per plan`;

    const response = await this.chat(prompt, systemPrompt);
    return this.extractJSON<ExplorationPlanResult>(response);
  }

  async analyzeScreenshot(screenshot: Buffer, context: string): Promise<ScreenshotAnalysis> {
    // Check if we have a vision model configured
    const visionModel = this.config.model?.includes("llava") ? this.config.model : "llava:7b";

    const url = `${this.config.baseUrl}/api/generate`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: visionModel,
        prompt: `Analyze this screenshot of a web application. Context: ${context}

Describe what you see and identify:
1. Main visible elements and their purpose
2. Any potential UI/UX issues
3. Accessibility concerns
4. Suggested actions to explore

Respond with JSON:
{
  "description": "overall description",
  "visibleElements": ["element 1", "element 2"],
  "potentialIssues": ["issue 1"],
  "suggestedActions": ["action 1"],
  "accessibility": ["note 1"]
}`,
        images: [screenshot.toString("base64")],
        stream: false,
      }),
    });

    if (!response.ok) {
      // If vision model not available, return basic analysis
      return {
        description: "Screenshot analysis not available (vision model not configured)",
        visibleElements: [],
        potentialIssues: [],
        suggestedActions: [],
        accessibility: [],
      };
    }

    const data = (await response.json()) as OllamaResponse;
    return this.extractJSON<ScreenshotAnalysis>(data.response);
  }

  async identifyIssues(observations: string[], context: string): Promise<IdentifiedIssue[]> {
    const systemPrompt = `You are an expert QA engineer identifying issues from test observations.
Categorize and prioritize issues found during testing.
Always respond with valid JSON only.`;

    const prompt = `Analyze these observations and identify any issues:

Context: ${context}

Observations:
${observations.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Respond with a JSON array of issues:
[
  {
    "type": "bug|ux|accessibility|security|performance",
    "severity": "critical|high|medium|low|info",
    "title": "Short issue title",
    "description": "Detailed description",
    "recommendation": "How to fix or investigate"
  }
]

If no issues found, return an empty array: []`;

    const response = await this.chat(prompt, systemPrompt);
    return this.extractJSON<IdentifiedIssue[]>(response);
  }

  private truncateHTML(html: string): string {
    // Remove scripts, styles, and excessive whitespace
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to reasonable size for LLM context
    if (cleaned.length > 15000) {
      cleaned = cleaned.substring(0, 15000) + "... [truncated]";
    }

    return cleaned;
  }
}

// Helper to check if Ollama is available
export async function checkOllamaAvailable(baseUrl = "http://localhost:11434"): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

// Helper to list available Ollama models
export async function listOllamaModels(
  baseUrl = "http://localhost:11434"
): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    if (!response.ok) return [];
    const data = (await response.json()) as { models: { name: string }[] };
    return data.models.map((m) => m.name);
  } catch {
    return [];
  }
}
