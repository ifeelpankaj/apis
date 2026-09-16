import {
  Controller,
  Get,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService, Public } from '@app/resources';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  @Get()
  liveness() {
    return this.healthService.liveness();
  }

  @Public()
  @ApiOperation({ summary: 'Readiness probe' })
  @Get('ready')
  async readiness(@Res({ passthrough: true }) res: Response) {
    const result = await this.healthService.readiness();
    if (result.status !== 'ready') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
