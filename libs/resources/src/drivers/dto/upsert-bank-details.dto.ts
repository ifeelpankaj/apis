import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertBankDetailsDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  account_holder_name!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  account_number!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  ifsc!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  bank_name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  razorpay_fund_account_id?: string;
}
