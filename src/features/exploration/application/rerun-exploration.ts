import { Result } from '@/lib/result';
import type { IExplorationRepository } from '../infrastructure/repositories/exploration-repository.interface';
import { ExplorationEngine } from '@/lib/explorer/engine';
import type { ExplorationConfig } from '../domain/schemas';

/**
 * Use case: Rerun an existing exploration with the same test plan
 * This ensures reproducible test results
 */

export interface RerunExplorationInput {
  originalRunId: string;
}

export interface RerunExplorationOutput {
  newRunId: string;
  usingSavedPlan: boolean;
}

export class RerunExplorationError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NO_PLAN' | 'ENGINE_ERROR'
  ) {
    super(message);
    this.name = 'RerunExplorationError';
  }
}

export class RerunExplorationUseCase {
  constructor(private explorationRepo: IExplorationRepository) {}

  async execute(
    input: RerunExplorationInput
  ): Promise<Result<RerunExplorationOutput, RerunExplorationError>> {
    // Get original run
    const originalRun = await this.explorationRepo.findById(input.originalRunId);
    if (!originalRun) {
      return Result.error(
        new RerunExplorationError('Exploration run not found', 'NOT_FOUND')
      );
    }

    // Validate plan exists
    if (!originalRun.plan) {
      return Result.error(
        new RerunExplorationError(
          'No plan found in original run. Cannot rerun without a saved plan.',
          'NO_PLAN'
        )
      );
    }

    // Parse config and plan
    const config: ExplorationConfig = originalRun.config
      ? JSON.parse(originalRun.config)
      : {};
    const plan = JSON.parse(originalRun.plan);

    // Create new run with charter from original run
    const newRun = await this.explorationRepo.create({
      url: originalRun.url,
      config: originalRun.config || undefined,
      plan: originalRun.plan,
      charter: originalRun.charter || undefined, // Persist charter from original run
      aiProvider: originalRun.aiProvider,
      aiModel: originalRun.aiModel || undefined,
    });

    // Start engine in background
    ExplorationEngine.start(
      newRun.id,
      { ...config, url: originalRun.url },
      {
        provider: originalRun.aiProvider as 'ollama' | 'anthropic' | 'openai' | 'heuristic',
        model: originalRun.aiModel || undefined,
      },
      plan
    ).catch(async (error) => {
      console.error('Rerun engine failed:', error);
      await this.explorationRepo.markAsFailed(
        newRun.id,
        error instanceof Error ? error.message : 'Unknown error'
      );
    });

    return Result.ok({
      newRunId: newRun.id,
      usingSavedPlan: true,
    });
  }
}
