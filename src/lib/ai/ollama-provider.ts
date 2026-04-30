// Ollama AI Provider implementation

import type {
  AIProvider,
  AIConfig,
  PageStructureAnalysis,
  GeneratedCharter,
  ExplorationPlanResult,
  ScreenshotAnalysis,
  IdentifiedIssue,
  ParsedAC,
  DecideNextStepInput,
  DecisionResult,
} from "./types";
import type { AcceptanceCriterion } from "@/lib/explorer/types";

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
    let jsonStr = text.trim();

    // Remove markdown code blocks if present (handle multiple formats)
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Remove any leading/trailing non-JSON text
    jsonStr = jsonStr.replace(/^[^{\[]+/, '').replace(/[^}\]]+$/, '');

    // Try to find the outermost JSON object or array (greedy match).
    // Prefer the structure that the response actually starts with — otherwise
    // a `{` inside an array of objects causes the object regex to match a
    // bogus span like `{...}, {...}` which isn't valid JSON.
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    const startsWithArray = jsonStr.trimStart().startsWith("[");

    let finalJson = startsWithArray
      ? arrayMatch?.[0] || objectMatch?.[0] || jsonStr
      : objectMatch?.[0] || arrayMatch?.[0] || jsonStr;

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
      } catch (parseError) {
        // Log more details for debugging
        console.error('JSON parse failed. Response length:', text.length);
        console.error('Extracted JSON length:', finalJson.length);
        console.error('First 500 chars of original:', text.substring(0, 500));
        console.error('First 500 chars of extracted:', finalJson.substring(0, 500));
        console.error('Last 300 chars of extracted:', finalJson.substring(Math.max(0, finalJson.length - 300)));
        console.error('Parse error:', parseError);

        // Try to provide a more helpful error message
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        throw new Error(`Failed to parse JSON (${errorMsg}): Original response starts with: ${text.substring(0, 150)}...`);
      }
    }
  }

  async analyzePageStructure(html: string, url: string): Promise<PageStructureAnalysis> {
    const systemPrompt = `You are an expert QA engineer analyzing web pages for exploratory testing.
Analyze the HTML structure and identify testable areas, forms, navigation, and potential risks.
CRITICAL: Respond with ONLY raw JSON. Do NOT wrap in markdown code blocks.
Do NOT use \`\`\`json or \`\`\` - output the JSON directly.
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
CRITICAL: Respond with ONLY raw JSON. Do NOT wrap in markdown code blocks (no \`\`\`json).`;

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
CRITICAL: Respond with ONLY raw JSON. Do NOT wrap in markdown code blocks (no \`\`\`json).`;

    const relevantArea = pageAnalysis.keyAreas.find((a) => a.name === area);
    const relevantIdeas = charter.testIdeas.filter((t) => t.area === area);

    // Separate elements by whether they're fillable or clickable.
    // ElementInfo's nominal type doesn't carry the raw HTML tagName here, but
    // the runtime payload from the page extractor does.
    const clickableElements = pageAnalysis.interactiveElements.filter((el: any) =>
      el.tagName === 'BUTTON' || el.tagName === 'A' || el.type === 'submit' || el.type === 'button'
    );
    const fillableElements = pageAnalysis.interactiveElements.filter((el: any) =>
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
      el.type !== 'submit' && el.type !== 'button'
    );

    const prompt = `Create an exploration plan for this area:

Area: ${area}
${relevantArea ? `Description: ${relevantArea.description}` : ""}
${relevantArea ? `Suggested Tests: ${relevantArea.suggestedTests.join(", ")}` : ""}
${relevantIdeas.length > 0 ? `Test Ideas: ${relevantIdeas.map((i) => i.idea).join(", ")}` : ""}

Clickable elements (use for "click" actions):
${JSON.stringify(clickableElements.slice(0, 15), null, 2)}

Fillable inputs (use for "fill" actions):
${JSON.stringify(fillableElements.slice(0, 10), null, 2)}

Forms on page:
${JSON.stringify(pageAnalysis.forms, null, 2)}

CRITICAL RULES:
- For "click" actions: ONLY use selectors from "Clickable elements" list
- For "fill" actions: ONLY use selectors from "Fillable inputs" or form fields
- DO NOT invent or make up any selectors, especially data-testid attributes
- DO NOT use generic selectors like button:nth-of-type(N)
- If you cannot find a suitable element in the provided lists, skip that test step
- Aim for 3-5 steps per plan for thorough exploration (up to 7 for complex areas)

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
CRITICAL: Respond with ONLY raw JSON. Do NOT wrap in markdown code blocks (no \`\`\`json).`;

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

  async parseAcceptanceCriteria(text: string): Promise<ParsedAC[]> {
    const systemPrompt = `You are an expert QA engineer translating free-form acceptance criteria into structured Gherkin with verifiable oracles.
CRITICAL: Respond with ONLY raw JSON. Do NOT wrap in markdown code blocks (no \`\`\`json).`;

    const prompt = `Parse the following acceptance criteria into structured form.

For each criterion, infer the most appropriate ORACLE — a deterministic check
that proves "then" is satisfied. Pick the simplest oracle that fits:

  - "dom"     verify a DOM element/text exists, is visible, has content, etc.
  - "url"     verify the page URL matches a regex pattern after the action
  - "console" verify no console errors / warnings during the action
  - "network" verify a backend request hits a URL pattern with expected status
  - "judge"   last-resort LLM judge with a rubric (use only when no other oracle fits)

Each oracle has these shapes:
  { "kind": "dom", "selector": "...", "check": "exists|visible|hidden|text-equals|text-contains|count-equals|count-at-least", "value": "..." }
  { "kind": "url", "pattern": "regex source", "flags": "i" }
  { "kind": "console", "check": "no-errors|no-warnings|contains", "value": "..." }
  { "kind": "network", "method": "GET|POST|...", "urlPattern": "regex", "statusRange": [200, 299] }
  { "kind": "judge", "rubric": "what makes this pass" }

Use selectors only if you can read them from context; otherwise prefer URL or
console oracles, or fall back to "judge". Do NOT invent CSS selectors that may
not exist.

Acceptance criteria text:
"""
${text}
"""

Respond with this exact JSON array structure:
[
  {
    "externalId": "AC-1",
    "given": "...",
    "when": "...",
    "then": "...",
    "priority": "must|should|could",
    "oracle": { ... one of the shapes above ... },
    "oracleConfidence": "high|medium|low"
  }
]

If the input is a single criterion, return an array of length 1. If you cannot
parse the input at all, return [].`;

    const response = await this.chat(prompt, systemPrompt);
    return this.extractJSON<ParsedAC[]>(response);
  }

  async proposeACPlan(
    ac: AcceptanceCriterion,
    pageAnalysis: PageStructureAnalysis
  ): Promise<ExplorationPlanResult> {
    const systemPrompt = `You are an expert QA automation engineer driving exploratory testing toward a single acceptance criterion.
Your job is to propose the actions needed to (1) reach the GIVEN state and (2) perform the WHEN action.
You do NOT verify THEN — that is handled separately by an oracle.
Use only selectors that appear in the page analysis. Do not invent data-testid attributes.
CRITICAL: Respond with ONLY raw JSON. Do NOT wrap in markdown code blocks.`;

    const clickable = pageAnalysis.interactiveElements
      .filter((e) => e.type === "button" || e.type === "link")
      .slice(0, 20);
    const inputs = pageAnalysis.forms.flatMap((f) => f.fields).slice(0, 15);

    const prompt = `Propose steps to verify this acceptance criterion.

Acceptance criterion ${ac.id}:
  GIVEN: ${ac.given}
  WHEN:  ${ac.when}
  THEN:  ${ac.then}

Page navigation:
${JSON.stringify(pageAnalysis.navigation.slice(0, 15), null, 2)}

Clickable elements:
${JSON.stringify(clickable, null, 2)}

Form fields (for fill actions):
${JSON.stringify(inputs, null, 2)}

Forms:
${JSON.stringify(pageAnalysis.forms, null, 2)}

RULES:
- Steps should drive the UI from current state into the GIVEN state, then perform WHEN.
- Use ONLY selectors that appear above. Do not invent.
- Aim for 2-6 steps. Fewer is better.
- If you cannot find selectors that match the GIVEN/WHEN, return an empty steps array.

Respond with this exact JSON:
{
  "objective": "Verify ${ac.id}: ${ac.then}",
  "steps": [
    {
      "action": "click|fill|select|hover|scroll|wait",
      "target": "exact selector",
      "value": "value (for fill)",
      "description": "...",
      "expectedOutcome": "...",
      "riskLevel": "safe|moderate|risky"
    }
  ],
  "expectedFindings": [],
  "risks": []
}`;

    const response = await this.chat(prompt, systemPrompt);
    return this.extractJSON<ExplorationPlanResult>(response);
  }

  // Single-step exploratory decision. The AI picks ONE action, declares
  // WHEN satisfied, or declares blocked — informed by what's happened so far.
  async decideNextStep(input: DecideNextStepInput): Promise<DecisionResult> {
    const systemPrompt = `You are an exploratory tester driving a web app to verify an acceptance criterion. You decide ONE action at a time.

Each turn you observe the current page and either:
- take a single next action toward reaching the GIVEN state and performing the WHEN action
- declare WHEN is now satisfied (oracle will run)
- declare you are blocked and explain why

Be conservative: if WHEN is clearly satisfied, return "done" rather than over-stepping.
Use only selectors that appear in the page analysis. Do NOT invent data-testid or other attributes.
CRITICAL: Respond with raw JSON. No markdown code blocks.`;

    const clickable = input.pageAnalysis.interactiveElements
      .filter((e) => e.type === "button" || e.type === "link")
      .slice(0, 15);
    const inputs = input.pageAnalysis.forms.flatMap((f) => f.fields).slice(0, 12);
    const navigation = input.pageAnalysis.navigation.slice(0, 10);

    const historyText =
      input.history.length === 0
        ? "(no actions taken yet)"
        : input.history
            .map(
              (h, i) =>
                `${i + 1}. ${h.action} ${h.target}${h.succeeded ? "" : " [FAILED]"} — ${h.description}${h.rationale ? ` (${h.rationale})` : ""}`
            )
            .join("\n");

    const observationsText =
      input.observations.length === 0
        ? "(none)"
        : input.observations.slice(-8).map((o) => `- ${o}`).join("\n");

    const prompt = `ACCEPTANCE CRITERION: ${input.acId}
GIVEN: ${input.given}
WHEN:  ${input.when}
THEN:  ${input.then}

CURRENT PAGE
URL: ${input.pageAnalysis.primaryPurpose ? "" : ""}${(input.pageAnalysis as unknown as { url?: string }).url ?? ""}
Navigation:
${JSON.stringify(navigation, null, 2)}
Clickable elements:
${JSON.stringify(clickable, null, 2)}
Form fields:
${JSON.stringify(inputs, null, 2)}

WHAT YOU'VE DONE SO FAR:
${historyText}

OBSERVATIONS FROM PRIOR STEPS:
${observationsText}

STEPS REMAINING IN BUDGET: ${input.stepsRemaining}

Decide your next move. Respond with one of these JSON shapes:

  // Take ONE action toward Given+When:
  { "kind": "step", "rationale": "why this action moves toward the goal",
    "step": { "action": "click|fill|select|hover|scroll|wait", "target": "exact selector", "value": "for fill", "description": "...", "expectedOutcome": "...", "riskLevel": "safe|moderate|risky" } }

  // WHEN is satisfied — run the oracle now:
  { "kind": "done", "rationale": "why you believe WHEN is now satisfied" }

  // Cannot proceed:
  { "kind": "blocked", "reason": "specific reason — e.g. no path from current state to the GIVEN" }

Pick the simplest action that makes progress. Prefer "done" if WHEN is already true.`;

    const response = await this.chat(prompt, systemPrompt);
    return this.extractJSON<DecisionResult>(response);
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
