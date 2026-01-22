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
      maxTokens: 16384, // Increased to prevent truncation
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
    let jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

    // Try to find JSON object or array
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);

    let finalJson = objectMatch?.[0] || arrayMatch?.[0] || jsonStr;

    // First attempt: parse as-is
    try {
      return JSON.parse(finalJson) as T;
    } catch (firstError) {
      // Second attempt: try to repair common issues
      try {
        // Remove trailing commas before closing brackets
        let repaired = finalJson.replace(/,\s*([\]}])/g, '$1');

        // Fix truncated strings - look for unclosed quotes
        const truncatedStringMatch = repaired.match(/"[^"]*$/);
        if (truncatedStringMatch) {
          // Find the last complete key-value pair
          const lastCompleteComma = repaired.lastIndexOf('",');
          const lastCompleteBrace = repaired.lastIndexOf('}');
          const lastCompleteBracket = repaired.lastIndexOf(']');

          // Use the most recent complete structure
          const lastGoodIndex = Math.max(lastCompleteComma, lastCompleteBrace, lastCompleteBracket);

          if (lastGoodIndex > 0) {
            // Truncate to last good point
            if (lastCompleteComma === lastGoodIndex) {
              repaired = repaired.substring(0, lastCompleteComma + 2);
            } else {
              repaired = repaired.substring(0, lastGoodIndex + 1);
            }
          }
        }

        // Remove any trailing incomplete tokens
        repaired = repaired.replace(/,\s*$/, '');

        // Try to close unclosed brackets/braces
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;

        // Add missing closing brackets/braces
        repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));

        return JSON.parse(repaired) as T;
      } catch {
        // Log more details for debugging
        console.error('JSON parse failed. Response length:', text.length);
        console.error('First 300 chars:', text.substring(0, 300));
        console.error('Last 300 chars:', text.substring(Math.max(0, text.length - 300)));
        throw new Error(`Failed to parse JSON from response: ${text.substring(0, 200)}...`);
      }
    }
  }

  async analyzePageStructure(html: string, url: string): Promise<PageStructureAnalysis> {
    const systemPrompt = `You are an expert QA engineer analyzing web pages for exploratory testing.
Analyze the HTML structure and identify testable areas, forms, navigation, and potential risks.
CRITICAL: Respond with valid JSON only. No markdown, no code blocks, no explanations.
Keep arrays short (max 5 items each) to ensure complete response.`;

    const prompt = `Analyze this web page and respond with JSON only:

URL: ${url}

HTML:
${this.truncateHTML(html)}

IMPORTANT: For potentialRisks and accessibilityNotes, be SPECIFIC:
- Include actual CSS selectors or element IDs where issues exist
- Mention specific field names, button labels, or section identifiers
- Provide concrete examples rather than general statements
- If you can't be specific, omit the item

JSON structure (keep arrays to max 5 items):
{
  "appType": "app type",
  "primaryPurpose": "page purpose",
  "keyAreas": [{"name": "area", "description": "desc", "importance": "high|medium|low", "suggestedTests": ["test1"]}],
  "navigation": [{"label": "text", "selector": "css", "type": "main|secondary", "hasSubmenu": false}],
  "forms": [{"purpose": "desc", "selector": "css", "fields": [{"name": "n", "type": "t", "selector": "css", "required": false}], "submitSelector": "css"}],
  "interactiveElements": [{"description": "desc", "selector": "css", "type": "button|link", "importance": "high|medium|low"}],
  "potentialRisks": ["Specific risk with element identifier (e.g., 'Search button #search-btn has no keyboard shortcut')"],
  "accessibilityNotes": ["Specific issue with selector (e.g., 'Button .close-modal missing aria-label')"]
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

CRITICAL RULES:
- You MUST use ONLY the "selector" values from the "Available elements" and "Forms" lists above
- DO NOT invent or make up any selectors, especially data-testid attributes
- DO NOT use generic selectors like button:nth-of-type(N)
- For "fill" actions, ONLY use elements with tagName "INPUT" or "TEXTAREA", NOT buttons
- For "click" actions, use elements with tagName "BUTTON", "A", or type "submit"/"button"
- If you cannot find a suitable element in the provided lists, skip that test step
- Maximum 3 steps per plan to keep response concise

Respond with this exact JSON structure (keep it concise):
{
  "objective": "Brief objective (one sentence)",
  "steps": [
    {
      "action": "click|fill|select|hover|scroll|wait",
      "target": "EXACT selector from Available elements list above",
      "value": "value (if action is fill)",
      "description": "Brief step description",
      "expectedOutcome": "Brief expected outcome",
      "riskLevel": "safe|moderate|risky"
    }
  ],
  "expectedFindings": ["finding1", "finding2"],
  "risks": ["risk1"]
}`;

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

IMPORTANT: Make descriptions SPECIFIC and ACTIONABLE:
- Include exact error messages, URLs, or selectors from the observations
- Reference specific observation numbers
- Provide concrete details that help locate the issue
- Bad: "There might be an error" | Good: "Console error 'undefined is not a function' at line 42 in app.js"

Respond with a JSON array of issues:
[
  {
    "type": "bug|ux|accessibility|security|performance",
    "severity": "critical|high|medium|low|info",
    "title": "Short issue title",
    "description": "Specific description with evidence from observations (include URLs, error messages, selectors)",
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
