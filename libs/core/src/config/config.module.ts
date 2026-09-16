import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './config.service.js';
import { ConfigModule as NestConfig } from '@nestjs/config';
import { validateEnv } from './config.validation.js';
import * as path from 'path';

console.log(process.cwd());
const env = process.env['NODE_ENV'] || 'development';

const envFilePath = path.resolve(process.cwd(), `.env.${env}`);

@Global()
@Module({
  imports: [
    NestConfig.forRoot({
      isGlobal: true,
      envFilePath,
      cache: true,
      expandVariables: true,
      validate: (config: Record<string, unknown>) => {
        validateEnv(config as Record<string, any>);
        return config;
      },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
