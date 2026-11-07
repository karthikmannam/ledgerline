import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().optional(),
  MIGRATIONS_URL: z.string().optional(),
  FRONTEND_ORIGIN: z.string().optional(),
  FRONTEND_ORIGINS: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  COOKIE_SECURE: z.enum(['true', 'false']).optional()
});

export type EnvConfig = Omit<z.infer<typeof envSchema>, 'DATABASE_URL' | 'FRONTEND_ORIGINS'> & {
  DATABASE_URL: string;
  FRONTEND_ORIGINS: string[];
};

function splitOrigins(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

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
  return {
    ...parsed.data,
    FRONTEND_ORIGINS: splitOrigins(parsed.data.FRONTEND_ORIGINS ?? parsed.data.FRONTEND_ORIGIN),
    DATABASE_URL: parsed.data.DATABASE_URL ?? 'postgresql://localhost:5432/ledgerline'
  };
}

export const env: EnvConfig = loadEnv();

export const cookieSecure: boolean =
  env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production';
