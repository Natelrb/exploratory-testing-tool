// AI Service Factory

import type { AIProvider, AIConfig } from "./types";
import { OllamaProvider, checkOllamaAvailable, listOllamaModels } from "./ollama-provider";
import { HeuristicProvider } from "./heuristic-provider";

export * from "./types";
export { checkOllamaAvailable, listOllamaModels } from "./ollama-provider";

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config);
    case "heuristic":
    default:
      return new HeuristicProvider();
  }
}

// Auto-detect best available provider
export async function detectBestProvider(): Promise<AIConfig> {
  // Check if Ollama is available
  const ollamaAvailable = await checkOllamaAvailable();

  if (ollamaAvailable) {
    const models = await listOllamaModels();

    // Prefer these models in order. Coder-tuned variants are noticeably
    // better at strict JSON output, which matters for AC parsing and plan
    // generation. Order: coder variants first, then general models.
    const preferredModels = [
      "qwen2.5-coder:14b",
      "qwen2.5-coder:7b",
      "qwen3:14b",
      "qwen2.5:14b",
      "qwen2.5:7b",
      "llama3.2:11b",
      "llama3.2:3b",
      "mistral-nemo:12b",
      "mistral:7b",
      "gemma3:12b",
      "gemma2:9b",
    ];

    for (const preferred of preferredModels) {
      if (models.some((m) => m.startsWith(preferred.split(":")[0]))) {
        const matchedModel = models.find((m) => m.startsWith(preferred.split(":")[0]));
        return {
          provider: "ollama",
          model: matchedModel || preferred,
          baseUrl: "http://localhost:11434",
          temperature: 0.7,
          maxTokens: 4096,
        };
      }
    }

    // Use first available model if no preferred one found
    if (models.length > 0) {
      return {
        provider: "ollama",
        model: models[0],
        baseUrl: "http://localhost:11434",
        temperature: 0.7,
        maxTokens: 4096,
      };
    }
  }

  // Check for Anthropic API key
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "claude-sonnet-4-20250514",
      temperature: 0.7,
      maxTokens: 4096,
    };
  }

  // Check for OpenAI API key
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o",
      temperature: 0.7,
      maxTokens: 4096,
    };
  }

  // Fall back to heuristic
  return {
    provider: "heuristic",
  };
}

// Get provider info for display
export function getProviderInfo(config: AIConfig): {
  name: string;
  description: string;
  capabilities: string[];
} {
  switch (config.provider) {
    case "ollama":
      return {
        name: `Ollama (${config.model})`,
        description: "Local LLM for intelligent analysis",
        capabilities: [
          "Page structure analysis",
          "Test charter generation",
          "Exploration planning",
          "Issue identification",
          config.model?.includes("llava") ? "Screenshot analysis" : "No vision support",
        ],
      };
    case "anthropic":
      return {
        name: `Claude (${config.model})`,
        description: "Anthropic Claude for advanced analysis",
        capabilities: [
          "Page structure analysis",
          "Test charter generation",
          "Exploration planning",
          "Issue identification",
          "Screenshot analysis (vision)",
        ],
      };
    case "openai":
      return {
        name: `OpenAI (${config.model})`,
        description: "OpenAI GPT for analysis",
        capabilities: [
          "Page structure analysis",
          "Test charter generation",
          "Exploration planning",
          "Issue identification",
          config.model?.includes("vision") || config.model?.includes("4o")
            ? "Screenshot analysis (vision)"
            : "No vision support",
        ],
      };
    case "heuristic":
    default:
      return {
        name: "Heuristic Analyzer",
        description: "Rule-based analysis (no AI required)",
        capabilities: [
          "Page structure analysis",
          "Test charter generation",
          "Basic exploration planning",
          "Pattern-based issue detection",
        ],
      };
  }
}
