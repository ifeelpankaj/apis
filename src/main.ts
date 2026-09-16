import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import cookieParser from 'cookie-parser';
import { AppLogger } from '@app/core/logger/logger.service.js';
import { AppConfigService } from '@app/core/config/config.service.js';
import { GlobalExceptionFilter } from '@app/core/filter/global.filter.js';
import { ResponseInterceptor } from '@app/core/interceptor/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Logger
  const logger = app.get(AppLogger);
  logger.forContext('Bootstrap');
  app.useLogger(logger);

  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);
  app.use(cookieParser());

  const configService = app.get(AppConfigService);
  app.enableCors({
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (configService.appConfig.allowedOrigin.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  });

  // Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalInterceptors(new ResponseInterceptor(configService, logger));
  const port = configService.appConfig.port;
  const host = configService.appConfig.host;
  await app.listen(port, host);

  logger.log(
    `✓ Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
