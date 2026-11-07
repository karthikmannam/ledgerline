import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info')
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.') || 'env';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env: EnvConfig = loadEnv();
