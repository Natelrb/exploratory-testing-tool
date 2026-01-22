import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { explorationManager } from "@/lib/explorer/manager";

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

    if (run.status !== "running" && run.status !== "pending") {
      return NextResponse.json(
        { error: "Exploration is not running" },
        { status: 400 }
      );
    }

    // Signal the exploration to stop
    explorationManager.stop(id);

    // Update status in database
    await prisma.explorationRun.update({
      where: { id },
      data: {
        status: "failed",
        endTime: new Date(),
        currentStep: "Terminated by user",
      },
    });

    // Add a log entry
    await prisma.explorationLog.create({
      data: {
        runId: id,
        level: "info",
        message: "Exploration terminated by user",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Exploration terminated",
    });
  } catch (error) {
    console.error("Failed to stop exploration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stop exploration" },
      { status: 500 }
    );
  }
}
