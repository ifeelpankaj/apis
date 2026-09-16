import { Injectable } from '@nestjs/common';
import { AppConfigService, DatabaseService } from '@app/core';
import { UserRepository } from '../../auth/repositories/user.repository.js';
import { AuthErrors } from '../../auth/types/auth-errors.js';
import { ImageRepository } from '../../media/repositories/image.repository.js';
import { toImageResponse } from '../../media/types/media.types.js';
import { DriverProfileRepository } from '../repositories/driver-profile.repository.js';
import { DriverDocumentRepository } from '../repositories/driver-document.repository.js';
import { DriverBankAccountRepository } from '../repositories/driver-bank-account.repository.js';
import { VehicleRepository } from '../repositories/vehicle.repository.js';
import { VehicleDocumentRepository } from '../repositories/vehicle-document.repository.js';
import { DriverVerificationRepository } from '../repositories/driver-verification.repository.js';
import { DriverErrors } from '../types/driver-errors.js';
import {
  EDITABLE_DRIVER_PROFILE_STATUSES,
  toDriverProfileResponse,
  type DriverProfileRow,
} from '../types/driver.types.js';
import type { CreateDriverDocumentDto } from '../dto/create-driver-document.dto.js';
import type { UpsertBankDetailsDto } from '../dto/upsert-bank-details.dto.js';
import type { CreateDriverVehicleDto } from '../dto/create-driver-vehicle.dto.js';
import type { CreateVehicleDocumentDto } from '../dto/create-vehicle-document.dto.js';
import type { driver_document_type } from '@db/queries/drivers/driver_documents.queries.js';

@Injectable()
export class DriverOnboardingService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly profileRepository: DriverProfileRepository,
    private readonly documentRepository: DriverDocumentRepository,
    private readonly bankAccountRepository: DriverBankAccountRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly vehicleDocumentRepository: VehicleDocumentRepository,
    private readonly verificationRepository: DriverVerificationRepository,
    private readonly imageRepository: ImageRepository,
    private readonly databaseService: DatabaseService,
    private readonly config: AppConfigService,
  ) {}

  async getMyProfile(userId: string) {
    const profile = await this.requireDriverProfile(userId);
    return { profile: toDriverProfileResponse(profile) };
  }

  async addDocument(userId: string, dto: CreateDriverDocumentDto) {
    const profile = await this.requireEditableProfile(userId);
    await this.documentRepository.deleteRejectedByType(
      profile.id,
      dto.document_type as driver_document_type,
    );

    const document = await this.documentRepository.create({
      driverProfileId: profile.id,
      documentType: dto.document_type as driver_document_type,
      documentNumber: dto.document_number ?? null,
      status: 'PENDING',
    });

    return {
      document: this.toDocumentResponse(document),
      message: 'Upload the document image via POST /api/v1/media with owner_type=DRIVER_DOCUMENT',
    };
  }

  async listDocuments(userId: string) {
    const profile = await this.requireDriverProfile(userId);
    const documents = await this.documentRepository.listByProfileId(profile.id);
    const enriched = await Promise.all(
      documents.map(async (doc) => ({
        ...this.toDocumentResponse(doc),
        images: (await this.imageRepository.listByOwner('DRIVER_DOCUMENT', doc.id)).map(
          (img) => toImageResponse(img),
        ),
      })),
    );
    return { documents: enriched };
  }

  async upsertBankDetails(userId: string, dto: UpsertBankDetailsDto) {
    const profile = await this.requireEditableProfile(userId);
    const bankAccount = await this.bankAccountRepository.upsert({
      driverProfileId: profile.id,
      accountHolderName: dto.account_holder_name,
      accountNumber: dto.account_number,
      ifsc: dto.ifsc,
      bankName: dto.bank_name,
      razorpayFundAccountId: dto.razorpay_fund_account_id ?? null,
    });

    return { bank_account: this.toBankAccountResponse(bankAccount) };
  }

  async getBankDetails(userId: string) {
    const profile = await this.requireDriverProfile(userId);
    const bankAccount = await this.bankAccountRepository.findByProfileId(profile.id);
    return {
      bank_account: bankAccount ? this.toBankAccountResponse(bankAccount) : null,
    };
  }

  async addVehicle(userId: string, dto: CreateDriverVehicleDto) {
    const profile = await this.requireEditableProfile(userId);
    const vehicle = await this.vehicleRepository.create({
      driverProfileId: profile.id,
      vehicleNumber: dto.vehicle_number,
      vehicleType: dto.vehicle_type ?? null,
      make: dto.make ?? null,
      model: dto.model ?? null,
      color: dto.color ?? null,
      manufacturingYear: dto.manufacturing_year ?? null,
    });

    return { vehicle: this.toVehicleResponse(vehicle) };
  }

  async listVehicles(userId: string) {
    const profile = await this.requireDriverProfile(userId);
    const vehicles = await this.vehicleRepository.listByProfileId(profile.id);
    const enriched = await Promise.all(
      vehicles.map(async (vehicle) => ({
        ...this.toVehicleResponse(vehicle),
        images: (await this.imageRepository.listByOwner('VEHICLE', vehicle.id)).map(
          (img) => toImageResponse(img),
        ),
      })),
    );
    return { vehicles: enriched };
  }

  async addVehicleDocument(
    userId: string,
    vehicleId: string,
    dto: CreateVehicleDocumentDto,
  ) {
    const profile = await this.requireEditableProfile(userId);
    const vehicle = await this.vehicleRepository.findById(vehicleId);
    if (!vehicle || vehicle.driver_profile_id !== profile.id) {
      throw DriverErrors.vehicleNotFound();
    }

    const document = await this.vehicleDocumentRepository.create({
      vehicleId,
      documentType: dto.document_type,
      documentNumber: dto.document_number ?? null,
      expiryDate: dto.expiry_date ? new Date(dto.expiry_date) : null,
      status: 'PENDING',
    });

    return {
      document: this.toVehicleDocumentResponse(document),
      message: 'Upload the document image via POST /api/v1/media with owner_type=VEHICLE_DOCUMENT',
    };
  }

  async submitForVerification(userId: string) {
    const profile = await this.requireEditableProfile(userId);
    const documents = await this.documentRepository.listByProfileId(profile.id);
    const bankAccount = await this.bankAccountRepository.findByProfileId(profile.id);

    if (!bankAccount) {
      throw DriverErrors.bankDetailsMissing();
    }

    const presentTypes = new Set(documents.map((doc) => doc.document_type));
    for (const requiredType of this.config.driver.requiredDocumentTypes) {
      if (!presentTypes.has(requiredType as driver_document_type)) {
        throw DriverErrors.documentsIncomplete();
      }
    }

    for (const document of documents) {
      if (document.status === 'REJECTED') {
        continue;
      }
      const imageCount = await this.imageRepository.countByOwner(
        'DRIVER_DOCUMENT',
        document.id,
      );
      if (imageCount === 0) {
        throw DriverErrors.documentsIncomplete();
      }
    }

    if (this.config.driver.vehicleRequired) {
      const activeCount = await this.vehicleRepository.countActiveByProfileId(profile.id);
      if (activeCount === 0) {
        throw DriverErrors.vehicleRequired();
      }
    }

    const result = await this.databaseService.withTransaction(async (client) => {
      const updatedProfile = await this.profileRepository.updateStatus(
        profile.id,
        'PENDING_VERIFICATION',
        client,
      );
      if (!updatedProfile) {
        throw DriverErrors.profileNotFound();
      }

      const verification = await this.verificationRepository.create(profile.id, client);
      return {
        profile: toDriverProfileResponse(updatedProfile),
        verification: {
          id: verification.id,
          driver_profile_id: verification.driver_profile_id,
          status: verification.status,
          submitted_at: verification.submitted_at.toISOString(),
        },
      };
    });

    return result;
  }

  private async requireDriverProfile(userId: string): Promise<DriverProfileRow> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AuthErrors.userNotFound();
    }
    if (user.global_role !== 'Driver') {
      throw DriverErrors.notDriver();
    }

    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw DriverErrors.profileNotFound();
    }

    return profile;
  }

  private async requireEditableProfile(userId: string): Promise<DriverProfileRow> {
    const profile = await this.requireDriverProfile(userId);
    if (!EDITABLE_DRIVER_PROFILE_STATUSES.includes(profile.status)) {
      throw DriverErrors.profileNotEditable();
    }
    return profile;
  }

  private toDocumentResponse(document: {
    id: string;
    driver_profile_id: string;
    document_type: string;
    document_number: string | null;
    status: string;
    rejection_reason: string | null;
    uploaded_at: Date;
    reviewed_at: Date | null;
  }) {
    return {
      id: document.id,
      driver_profile_id: document.driver_profile_id,
      document_type: document.document_type,
      document_number: document.document_number,
      status: document.status,
      rejection_reason: document.rejection_reason,
      uploaded_at: document.uploaded_at.toISOString(),
      reviewed_at: document.reviewed_at?.toISOString() ?? null,
    };
  }

  private toBankAccountResponse(account: {
    id: string;
    driver_profile_id: string;
    account_holder_name: string;
    account_number: string;
    ifsc: string;
    bank_name: string;
    razorpay_fund_account_id: string | null;
    is_verified: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: account.id,
      driver_profile_id: account.driver_profile_id,
      account_holder_name: account.account_holder_name,
      account_number: account.account_number,
      ifsc: account.ifsc,
      bank_name: account.bank_name,
      razorpay_fund_account_id: account.razorpay_fund_account_id,
      is_verified: account.is_verified,
      created_at: account.created_at.toISOString(),
      updated_at: account.updated_at.toISOString(),
    };
  }

  private toVehicleResponse(vehicle: {
    id: string;
    driver_profile_id: string;
    vehicle_number: string;
    vehicle_type: string | null;
    make: string | null;
    model: string | null;
    color: string | null;
    manufacturing_year: number | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: vehicle.id,
      driver_profile_id: vehicle.driver_profile_id,
      vehicle_number: vehicle.vehicle_number,
      vehicle_type: vehicle.vehicle_type,
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      manufacturing_year: vehicle.manufacturing_year,
      is_active: vehicle.is_active,
      created_at: vehicle.created_at.toISOString(),
      updated_at: vehicle.updated_at.toISOString(),
    };
  }

  private toVehicleDocumentResponse(document: {
    id: string;
    vehicle_id: string;
    document_type: string;
    document_number: string | null;
    expiry_date: Date | null;
    status: string;
    rejection_reason: string | null;
    uploaded_at: Date;
    reviewed_at: Date | null;
  }) {
    return {
      id: document.id,
      vehicle_id: document.vehicle_id,
      document_type: document.document_type,
      document_number: document.document_number,
      expiry_date: document.expiry_date?.toISOString().slice(0, 10) ?? null,
      status: document.status,
      rejection_reason: document.rejection_reason,
      uploaded_at: document.uploaded_at.toISOString(),
      reviewed_at: document.reviewed_at?.toISOString() ?? null,
    };
  }
}
