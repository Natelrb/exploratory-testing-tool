import { z } from 'zod';

/**
 * Centralized application configuration
 * All config values should be defined here and validated
 */
const ConfigSchema = z.object({
  app: z.object({
    name: z.string().default('Exploratory Testing Tool'),
  }).default({}),
  exploration: z.object({
    defaultMaxActions: z.number().positive().default(50),
    defaultTimeout: z.number().positive().default(30000),
    defaultViewport: z.object({
      width: z.number().positive().default(1920),
      height: z.number().positive().default(1080),
    }).default({}),
    screenshotTimeout: z.number().positive().default(15000),
    screenshotDelay: z.number().min(0).default(
      process.env.SCREENSHOT_DELAY ? parseInt(process.env.SCREENSHOT_DELAY) : 500
    ), // ms to wait after actions before screenshot
    maxConsecutiveFailures: z.number().positive().default(5),
    selectorValidationTimeout: z.number().positive().default(2000),
    recordVideo: z.boolean().default(process.env.RECORD_VIDEO === 'true'),
    videoSize: z.object({
      width: z.number().positive().default(1280),
      height: z.number().positive().default(720),
    }).default({}),
  }).default({}),
  ai: z.object({
    ollama: z.object({
      baseUrl: z.string().url().default('http://localhost:11434'),
      defaultModel: z.string().default('qwen2.5:14b'),
      maxTokens: z.number().positive().default(16384),
      temperature: z.number().min(0).max(2).default(0.7),
    }).default({}),
  }).default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// Parse with empty object to trigger all defaults
export const config = ConfigSchema.parse({});
