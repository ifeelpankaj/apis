import { Global, Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { loggerConfig } from './logger.config.js';
import { AppLogger } from './logger.service.js';

@Global() // Make it global so you don't need to import everywhere
@Module({
  imports: [WinstonModule.forRoot(loggerConfig)],
  providers: [AppLogger],
  exports: [AppLogger, WinstonModule],
})
export class LoggerModule {}
