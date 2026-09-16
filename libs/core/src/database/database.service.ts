import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseConfig } from './database.config';

interface QueryMetrics {
  text: string;
  durationMs: number;
  rowCount: number;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private isShuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get<DatabaseConfig>('database');
    if (!config) {
      throw new Error(
        'Database configuration not found. Did you register database.config.ts with ConfigModule?',
      );
    }

    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,

      max: config.max,
      min: config.min,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      statement_timeout: config.statementTimeoutMillis,

      ssl: config.ssl,
      application_name: process.env.SERVICE_NAME ?? 'nestjs-app',
    });

    // REQUIRED: pg emits 'error' on idle clients that die in the background
    // (dropped connection, DB restart, etc). Without this listener, that
    // error is unhandled and crashes the whole process.
    this.pool.on('error', (err) => {
      this.logger.error(
        `Unexpected error on idle Postgres client: ${err.message}`,
        err.stack,
      );
    });

    this.pool.on('connect', () =>
      this.logger.debug('New client connected to pool'),
    );
    this.pool.on('remove', () => this.logger.debug('Client removed from pool'));
  }

  async onModuleInit(): Promise<void> {
    await this.healthCheck();
    this.logger.log(
      `Postgres pool ready (max=${this.pool.options.max}, min=${
        (this.pool.options as { min?: number }).min ?? 0
      })`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.log('Draining Postgres pool...');
    await this.pool.end();
    this.logger.log('Postgres pool closed');
  }

  /**
   * Raw pool handle for pgtyped-generated query functions, which accept a
   * `Pool | PoolClient` as their second argument, e.g.:
   *   findUserById.run({ id }, this.db.getPool())
   */
  getPool(): Pool {
    if (this.isShuttingDown) {
      throw new Error('Database pool is shutting down; rejecting new work');
    }
    return this.pool;
  }

  /** Used at startup and by the /health/db endpoint. */
  async healthCheck(): Promise<{ ok: true; latencyMs: number }> {
    const start = process.hrtime.bigint();
    await this.pool.query('SELECT 1');
    return { ok: true, latencyMs: this.elapsedMs(start) };
  }

  /** Snapshot of pool saturation — wire this into your metrics exporter. */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Instrumented ad hoc query helper (timing + slow-query logging).
   * pgtyped-generated functions call `pool.query` themselves and don't go
   * through this — use this for one-off queries at the repository layer
   * that aren't worth generating a .sql file for.
   *
   * Always parameterized: pass values via `params`, never interpolate
   * into `text`.
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const start = process.hrtime.bigint();
    try {
      const result = await this.pool.query<T>(text, params as unknown[]);
      this.logQuery({
        text,
        durationMs: this.elapsedMs(start),
        rowCount: result.rowCount ?? 0,
      });
      return result;
    } catch (err) {
      this.logger.error(
        `Query failed after ${this.elapsedMs(start).toFixed(1)}ms: ${text}`,
        (err as Error).stack,
      );
      throw err;
    }
  }

  /**
   * Runs `work` inside a transaction on a single checked-out client.
   * Commits on success, rolls back on any thrown error, always releases
   * the client back to the pool.
   *
   * Pass `client` into your pgtyped `.run()` calls inside `work` so every
   * query in the callback shares the same transaction.
   */
  async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const start = process.hrtime.bigint();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      this.logger.debug(
        `Transaction committed in ${this.elapsedMs(start).toFixed(1)}ms`,
      );
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.warn(
        `Transaction rolled back after ${this.elapsedMs(start).toFixed(1)}ms: ${
          (err as Error).message
        }`,
      );
      throw err;
    } finally {
      client.release();
    }
  }

  private elapsedMs(startNs: bigint): number {
    return Number(process.hrtime.bigint() - startNs) / 1e6;
  }

  private logQuery(metrics: QueryMetrics): void {
    const { text, durationMs, rowCount } = metrics;
    const slowMs = Number(process.env.DB_SLOW_QUERY_MS ?? 200);
    const message = `query="${this.truncate(text)}" duration=${durationMs.toFixed(
      1,
    )}ms rows=${rowCount}`;

    if (durationMs >= slowMs) {
      this.logger.warn(`SLOW QUERY ${message}`);
    } else {
      this.logger.debug(message);
    }
  }

  private truncate(text: string, max = 120): string {
    return text.length > max ? `${text.slice(0, max)}...` : text;
  }
}
