import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(24),
  TRUSTED_ORIGINS: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().url()
});

export const env = envSchema.parse(process.env);

export const trustedOrigins = env.TRUSTED_ORIGINS
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);