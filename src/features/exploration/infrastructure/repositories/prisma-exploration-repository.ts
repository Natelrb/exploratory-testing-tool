import { prisma } from '@/lib/db';
import type {
  IExplorationRepository,
  CreateExplorationData,
  UpdateExplorationData,
  ExplorationFilters,
  ExplorationRunWithRelations,
} from './exploration-repository.interface';
import type { ExplorationRun } from '@/generated/prisma/client';

/**
 * Prisma implementation of exploration repository
 * Handles all database operations for explorations
 */
export class PrismaExplorationRepository implements IExplorationRepository {
  async findById(id: string): Promise<ExplorationRunWithRelations | null> {
    return prisma.explorationRun.findUnique({
      where: { id },
      include: {
        actions: {
          orderBy: { sequence: 'asc' },
        },
        findings: {
          orderBy: { createdAt: 'desc' },
        },
        evidence: {
          orderBy: { timestamp: 'desc' },
        },
        logs: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });
  }

  async findAll(filters?: ExplorationFilters): Promise<ExplorationRun[]> {
    return prisma.explorationRun.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit,
      skip: filters?.offset,
    });
  }

  async create(data: CreateExplorationData): Promise<ExplorationRun> {
    return prisma.explorationRun.create({
      data: {
        url: data.url,
        status: 'pending',
        aiProvider: data.aiProvider || 'heuristic',
        aiModel: data.aiModel || null,
        config: data.config || null,
        charter: data.charter || null,
        plan: data.plan || null,
      },
    });
  }

  async update(id: string, data: UpdateExplorationData): Promise<ExplorationRun> {
    return prisma.explorationRun.update({
      where: { id },
      data,
    });
  }

  async markAsRunning(id: string): Promise<void> {
    await prisma.explorationRun.update({
      where: { id },
      data: {
        status: 'running',
        startTime: new Date(),
      },
    });
  }

  async markAsCompleted(id: string): Promise<void> {
    await prisma.explorationRun.update({
      where: { id },
      data: {
        status: 'completed',
        endTime: new Date(),
      },
    });
  }

  async markAsFailed(id: string, errorMessage?: string): Promise<void> {
    await prisma.explorationRun.update({
      where: { id },
      data: {
        status: 'failed',
        endTime: new Date(),
      },
    });

    // Optionally log the error
    if (errorMessage) {
      await prisma.explorationLog.create({
        data: {
          runId: id,
          level: 'error',
          message: `Exploration failed: ${errorMessage}`,
        },
      });
    }
  }

  async delete(id: string): Promise<void> {
    await prisma.explorationRun.delete({
      where: { id },
    });
  }
}

// Export singleton instance
export const explorationRepository = new PrismaExplorationRepository();
