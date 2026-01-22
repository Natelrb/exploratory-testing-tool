import { NextRequest, NextResponse } from "next/server";
import { RerunExplorationUseCase } from "@/features/exploration/application/rerun-exploration";
import { explorationRepository } from "@/features/exploration/infrastructure/repositories/prisma-exploration-repository";
import { successResponse, errorResponse } from "@/lib/api-response";

// Create use case instance
const rerunUseCase = new RerunExplorationUseCase(explorationRepository);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Execute use case
    const result = await rerunUseCase.execute({ originalRunId: id });

    // Handle result
    if (result.isError()) {
      const error = result.getError()!;
      const statusCode = error.code === 'NOT_FOUND' ? 404 : 400;

      return NextResponse.json(
        errorResponse(error.message, error.code),
        { status: statusCode }
      );
    }

    // Return success response
    return NextResponse.json(
      successResponse({
        runId: result.unwrap().newRunId,
        usingSavedPlan: result.unwrap().usingSavedPlan,
      })
    );
  } catch (error) {
    console.error("Failed to rerun exploration:", error);
    return NextResponse.json(
      errorResponse(
        error instanceof Error ? error.message : "Failed to rerun exploration",
        'INTERNAL_ERROR'
      ),
      { status: 500 }
    );
  }
}
