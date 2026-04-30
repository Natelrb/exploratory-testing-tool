import { NextRequest, NextResponse } from "next/server";
import { ExplorationEngine } from "@/lib/explorer/engine";
import { prisma } from "@/lib/db";
import { detectBestProvider } from "@/lib/ai";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the exploration run
    const run = await prisma.explorationRun.findUnique({
      where: { id },
    });

    if (!run) {
      return NextResponse.json({ error: "Exploration run not found" }, { status: 404 });
    }

    if (run.status !== "pending") {
      return NextResponse.json(
        { error: "Exploration has already been started" },
        { status: 400 }
      );
    }

    // Parse config
    const config = run.config ? JSON.parse(run.config) : {};

    // Detect AI provider
    const aiConfig = await detectBestProvider();

    // Update the run with AI info
    await prisma.explorationRun.update({
      where: { id },
      data: {
        aiProvider: aiConfig.provider,
        aiModel: aiConfig.model || null,
      },
    });

    // Load any acceptance criteria persisted at run-creation time.
    const acRows = await prisma.acceptanceCriterion.findMany({
      where: { runId: id },
      orderBy: { order: "asc" },
    });
    const acceptanceCriteria = acRows.map((r) => ({
      id: r.externalId,
      given: r.given,
      when: r.whenText,
      then: r.thenText,
      oracle: JSON.parse(r.oracle),
      priority: r.priority as "must" | "should" | "could",
    }));

    // Start exploration in background (don't await)
    ExplorationEngine.start(
      id,
      { url: run.url, ...config, acceptanceCriteria: acceptanceCriteria.length ? acceptanceCriteria : undefined },
      aiConfig
    ).catch(async (error) => {
      console.error("Exploration failed:", error);
      await prisma.explorationRun.update({
        where: { id },
        data: { status: "failed" },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Exploration started",
      aiProvider: aiConfig.provider,
      aiModel: aiConfig.model,
    });
  } catch (error) {
    console.error("Failed to start exploration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start exploration" },
      { status: 500 }
    );
  }
}
