import { NextRequest, NextResponse } from "next/server";
import { ExplorationEngine } from "@/lib/explorer/engine";
import { prisma } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the original exploration run
    const originalRun = await prisma.explorationRun.findUnique({
      where: { id },
    });

    if (!originalRun) {
      return NextResponse.json({ error: "Exploration run not found" }, { status: 404 });
    }

    // Parse the original config and plan
    const config = originalRun.config ? JSON.parse(originalRun.config) : {};
    const plan = originalRun.plan ? JSON.parse(originalRun.plan) : null;

    if (!plan) {
      return NextResponse.json(
        { error: "No plan found in original run. Cannot rerun without a saved plan." },
        { status: 400 }
      );
    }

    // Create a new exploration run with the same configuration
    const newRun = await prisma.explorationRun.create({
      data: {
        url: originalRun.url,
        status: "pending",
        aiProvider: originalRun.aiProvider,
        aiModel: originalRun.aiModel,
        config: originalRun.config,
        plan: originalRun.plan, // Copy the plan for this rerun too
      },
    });

    // Start exploration in background with the saved plan (don't await)
    ExplorationEngine.start(
      newRun.id,
      { url: originalRun.url, ...config },
      {
        provider: originalRun.aiProvider,
        model: originalRun.aiModel || undefined,
      },
      plan
    ).catch(async (error) => {
      console.error("Rerun failed:", error);
      await prisma.explorationRun.update({
        where: { id: newRun.id },
        data: { status: "failed" },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Exploration rerun started",
      newRunId: newRun.id,
      usingSavedPlan: true,
    });
  } catch (error) {
    console.error("Failed to rerun exploration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rerun exploration" },
      { status: 500 }
    );
  }
}
