import type { ExplorationRun, ExplorationAction, ExplorationFinding } from '@/generated/prisma/client';

/**
 * Repository interface for exploration persistence
 * This abstraction allows us to swap implementations (Prisma, in-memory, etc.)
 */

export type ExplorationRunWithRelations = ExplorationRun & {
  actions: ExplorationAction[];
  findings: ExplorationFinding[];
  evidence?: any[];
  logs?: any[];
};

export interface CreateExplorationData {
  url: string;
  config?: string;
  charter?: string;
  plan?: string;
  aiProvider?: string;
  aiModel?: string;
}

export interface UpdateExplorationData {
  status?: string;
  config?: string;
  charter?: string;
  plan?: string;
  currentStep?: string;
  progress?: number;
  totalActions?: number;
  completedActions?: number;
  startTime?: Date;
  endTime?: Date;
}

export interface ExplorationFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface IExplorationRepository {
  /**
   * Find exploration by ID with all relations
   */
  findById(id: string): Promise<ExplorationRunWithRelations | null>;

  /**
   * Find all explorations with optional filters
   */
  findAll(filters?: ExplorationFilters): Promise<ExplorationRun[]>;

  /**
   * Create a new exploration run
   */
  create(data: CreateExplorationData): Promise<ExplorationRun>;

  /**
   * Update an existing exploration
   */
  update(id: string, data: UpdateExplorationData): Promise<ExplorationRun>;

  /**
   * Mark exploration as running
   */
  markAsRunning(id: string): Promise<void>;

  /**
   * Mark exploration as completed
   */
  markAsCompleted(id: string): Promise<void>;

  /**
   * Mark exploration as failed with error message
   */
  markAsFailed(id: string, errorMessage?: string): Promise<void>;

  /**
   * Delete an exploration (cascade deletes relations)
   */
  delete(id: string): Promise<void>;
}
