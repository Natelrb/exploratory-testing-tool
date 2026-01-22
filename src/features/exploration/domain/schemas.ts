import { z } from 'zod';

/**
 * Domain schemas for exploration feature
 * These provide runtime validation and type inference
 */

export const ExplorationConfigSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  username: z.string().optional(),
  password: z.string().optional(),
  headless: z.boolean().default(true),
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  timeout: z.number().positive().optional(),
  maxActions: z.number().positive().optional(),
});

export type ExplorationConfig = z.infer<typeof ExplorationConfigSchema>;

export const ExplorationStepSchema = z.object({
  action: z.enum(['click', 'fill', 'select', 'hover', 'scroll', 'wait', 'assert', 'navigate', 'press', 'keyboard']),
  target: z.string(),
  value: z.string().optional(),
  description: z.string().min(1),
  expectedOutcome: z.string().min(1),
  riskLevel: z.enum(['safe', 'moderate', 'risky']),
});

export type ExplorationStep = z.infer<typeof ExplorationStepSchema>;

export const ExplorationPlanSchema = z.object({
  area: z.string().min(1),
  objective: z.string().optional(),
  steps: z.array(ExplorationStepSchema),
  expectedFindings: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
});

export type ExplorationPlan = z.infer<typeof ExplorationPlanSchema>;

export const ExplorationStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
]);

export type ExplorationStatus = z.infer<typeof ExplorationStatusSchema>;

export const CreateExplorationSchema = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  config: ExplorationConfigSchema.optional(),
});

export type CreateExplorationInput = z.infer<typeof CreateExplorationSchema>;
