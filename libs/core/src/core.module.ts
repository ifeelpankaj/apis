import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { LoggerModule } from './logger/logger.module.js';

@Module({
  imports: [ConfigModule, DatabaseModule, LoggerModule],
  exports: [ConfigModule, DatabaseModule, LoggerModule],
})
export class CoreModule {}
