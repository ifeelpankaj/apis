import { Module } from '@nestjs/common';
import { ResourcesService } from './resources.service.js';

@Module({
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
