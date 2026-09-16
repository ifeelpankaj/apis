import { registerAs } from '@nestjs/config';
import * as fs from 'fs';
import { DatabaseConfig } from '../config/config.interface.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * DB_SSL_MODE:
 *   disable      -> no TLS (local/dev only)
 *   require      -> TLS, but don't verify the server cert (encrypted, not authenticated)
 *   verify-full  -> TLS + verify server cert against DB_SSL_CA (use this in production)
 */
function buildSsl(): DatabaseConfig['ssl'] {
  const mode = process.env.DB_SSL_MODE ?? 'disable';
  if (mode === 'disable') return false;

  const ssl: { ca?: string; rejectUnauthorized: boolean } = {
    rejectUnauthorized: mode === 'verify-full',
  };

  if (process.env.DB_SSL_CA_PATH) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8');
  } else if (process.env.DB_SSL_CA) {
    // Useful when a secrets manager injects the CA cert directly as a value
    // rather than mounting a file.
    ssl.ca = process.env.DB_SSL_CA;
  }

  return ssl;
}

export default registerAs('database', (): DatabaseConfig => ({
  host: required('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 5432),
  user: required('DB_USER'),
  password: required('DB_PASSWORD'),
  database: required('DB_NAME'),

  max: Number(process.env.DB_POOL_MAX ?? 20),
  min: Number(process.env.DB_POOL_MIN ?? 2),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(
    process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000,
  ),
  statementTimeoutMillis: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000),

  ssl: buildSsl(),
}));
