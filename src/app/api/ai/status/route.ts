import { NextResponse } from "next/server";
import { detectBestProvider, getProviderInfo, checkOllamaAvailable, listOllamaModels } from "@/lib/ai";

export async function GET() {
  try {
    // Check Ollama availability
    const ollamaAvailable = await checkOllamaAvailable();
    const ollamaModels = ollamaAvailable ? await listOllamaModels() : [];

    // Detect best provider
    const config = await detectBestProvider();
    const info = getProviderInfo(config);

    return NextResponse.json({
      currentProvider: {
        config,
        info,
      },
      ollama: {
        available: ollamaAvailable,
        models: ollamaModels,
      },
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    });
  } catch (error) {
    console.error("Failed to check AI status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check AI status" },
      { status: 500 }
    );
  }
}
