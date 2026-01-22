import { z } from 'zod';

/**
 * Centralized application configuration
 * All config values should be defined here and validated
 */
const ConfigSchema = z.object({
  app: z.object({
    name: z.string().default('Exploratory Testing Tool'),
  }),
  exploration: z.object({
    defaultMaxActions: z.number().positive().default(50),
    defaultTimeout: z.number().positive().default(30000),
    defaultViewport: z.object({
      width: z.number().positive().default(1920),
      height: z.number().positive().default(1080),
    }),
    screenshotTimeout: z.number().positive().default(15000),
    maxConsecutiveFailures: z.number().positive().default(5),
    selectorValidationTimeout: z.number().positive().default(2000),
  }),
  ai: z.object({
    ollama: z.object({
      baseUrl: z.string().url().default('http://localhost:11434'),
      defaultModel: z.string().default('qwen2.5:14b'),
      maxTokens: z.number().positive().default(16384),
      temperature: z.number().min(0).max(2).default(0.7),
    }),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// Parse and validate configuration
export const config = ConfigSchema.parse({
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Exploratory Testing Tool',
  },
  exploration: {
    defaultMaxActions: process.env.MAX_ACTIONS
      ? parseInt(process.env.MAX_ACTIONS, 10)
      : 50,
    defaultTimeout: process.env.DEFAULT_TIMEOUT
      ? parseInt(process.env.DEFAULT_TIMEOUT, 10)
      : 30000,
    screenshotTimeout: process.env.SCREENSHOT_TIMEOUT
      ? parseInt(process.env.SCREENSHOT_TIMEOUT, 10)
      : 15000,
    maxConsecutiveFailures: process.env.MAX_CONSECUTIVE_FAILURES
      ? parseInt(process.env.MAX_CONSECUTIVE_FAILURES, 10)
      : 5,
  },
  ai: {
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultModel: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
      maxTokens: process.env.OLLAMA_MAX_TOKENS
        ? parseInt(process.env.OLLAMA_MAX_TOKENS, 10)
        : 16384,
    },
  },
});
