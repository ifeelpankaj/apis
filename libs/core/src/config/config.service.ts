import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config.interface.js';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}
  get appConfig(): AppConfig {
    return {
      port: this.configService.getOrThrow<number>('PORT'),
      host: this.configService.getOrThrow<string>('HOST'),
      allowedOrigin: this.configService.getOrThrow<string[]>('ALLOWED_ORIGINS'),
    };
  }
  get isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}
