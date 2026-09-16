export interface AppConfig {
  port: number;
  allowedOrigin: string[];
  host: string;
}
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  max: number;
  min: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statementTimeoutMillis: number;
  ssl: false | { ca?: string; rejectUnauthorized: boolean };
}
