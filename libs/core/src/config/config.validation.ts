import { Logger } from '@nestjs/common';
import { z } from 'zod';

const logger = new Logger('ConfigValidation');

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),

    PORT: z.coerce
      .number({
        message: 'PORT must be a valid number',
      })
      .int({
        message: 'PORT must be an integer',
      })
      .min(1000, {
        message: 'PORT must be at least 1000',
      })
      .max(65535, {
        message: 'PORT must be less than or equal to 65535',
      }),

    ALLOWED_ORIGINS: z
      .string()
      .min(1, {
        message: 'ALLOWED_ORIGINS is required',
      })
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(
        z.array(z.string().url()).min(1, {
          message: 'ALLOWED_ORIGINS must contain at least one valid URL',
        }),
      ),
    HOST: z
      .string()
      .min(1, { message: 'HOST is required' })
      .refine(
        (value) => {
          const isValidIp =
            /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([1-9]|[12][0-9]|3[012]))?$/.test(
              value,
            );
          const isValidHostname =
            /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$/.test(
              value,
            );
          return isValidIp || isValidHostname;
        },
        {
          message: 'HOST must be a valid IP address or hostname',
        },
      ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.ALLOWED_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGINS'],
        message: 'Wildcard (*) origin is not allowed in production',
      });
    }
  });

export type EnvironmentVariables = z.infer<typeof envSchema>;

function formatValidationErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const property = issue.path.join('.') || 'environment';
      return ` ✗ ${property}: ${issue.message}`;
    })
    .join('\n');
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  logger.debug('Validating environment variables...');

  // Convert empty strings to undefined so they are treated as missing.
  const cleanConfig = Object.entries(config).reduce(
    (acc, [key, value]) => {
      acc[key] =
        typeof value === 'string' && value.trim() === '' ? undefined : value;

      return acc;
    },
    {} as Record<string, unknown>,
  );

  const result = envSchema.safeParse(cleanConfig);

  if (!result.success) {
    const formattedErrors = formatValidationErrors(result.error);

    logger.error('Environment validation failed');
    logger.error(`\n${formattedErrors}`);

    console.error(
      '\n✗ Please fix the above environment variables in your .env file.\n',
    );

    process.exit(1);
  }

  logger.log('✓ Environment variables validated successfully');

  return result.data;
}
