import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  DriverOnboardingService,
  Roles,
  RolesGuard,
} from '@app/resources';
import type { JwtClaims } from '@app/resources/auth/types/auth.types.js';
import { CreateDriverDocumentDto } from '@app/resources/drivers/dto/create-driver-document.dto.js';
import { UpsertBankDetailsDto } from '@app/resources/drivers/dto/upsert-bank-details.dto.js';
import { CreateDriverVehicleDto } from '@app/resources/drivers/dto/create-driver-vehicle.dto.js';
import { CreateVehicleDocumentDto } from '@app/resources/drivers/dto/create-vehicle-document.dto.js';

@ApiTags('Drivers')
@ApiCookieAuth('access_token')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('Driver')
@Controller('drivers/me')
export class DriversController {
  constructor(private readonly driverOnboardingService: DriverOnboardingService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current driver profile' })
  getProfile(@CurrentUser() user: JwtClaims) {
    return this.driverOnboardingService.getMyProfile(user.user_id);
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create driver document record (attach image via /media)' })
  addDocument(@CurrentUser() user: JwtClaims, @Body() dto: CreateDriverDocumentDto) {
    return this.driverOnboardingService.addDocument(user.user_id, dto);
  }

  @Get('documents')
  @ApiOperation({ summary: 'List driver documents with linked images' })
  listDocuments(@CurrentUser() user: JwtClaims) {
    return this.driverOnboardingService.listDocuments(user.user_id);
  }

  @Put('bank-details')
  @ApiOperation({ summary: 'Upsert driver bank account' })
  upsertBankDetails(@CurrentUser() user: JwtClaims, @Body() dto: UpsertBankDetailsDto) {
    return this.driverOnboardingService.upsertBankDetails(user.user_id, dto);
  }

  @Get('bank-details')
  @ApiOperation({ summary: 'Get driver bank account' })
  getBankDetails(@CurrentUser() user: JwtClaims) {
    return this.driverOnboardingService.getBankDetails(user.user_id);
  }

  @Post('vehicles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register driver vehicle' })
  addVehicle(@CurrentUser() user: JwtClaims, @Body() dto: CreateDriverVehicleDto) {
    return this.driverOnboardingService.addVehicle(user.user_id, dto);
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'List driver vehicles with linked images' })
  listVehicles(@CurrentUser() user: JwtClaims) {
    return this.driverOnboardingService.listVehicles(user.user_id);
  }

  @Post('vehicles/:vehicleId/documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create vehicle document record (attach image via /media)' })
  addVehicleDocument(
    @CurrentUser() user: JwtClaims,
    @Param('vehicleId') vehicleId: string,
    @Body() dto: CreateVehicleDocumentDto,
  ) {
    return this.driverOnboardingService.addVehicleDocument(user.user_id, vehicleId, dto);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit driver profile for admin verification' })
  submit(@CurrentUser() user: JwtClaims) {
    return this.driverOnboardingService.submitForVerification(user.user_id);
  }
}
