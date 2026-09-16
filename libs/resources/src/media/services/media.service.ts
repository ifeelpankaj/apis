import { Injectable } from '@nestjs/common';
import { ImageRepository } from '../repositories/image.repository.js';
import { ImageKitService } from './imagekit.service.js';
import { MediaErrors } from '../types/media-errors.js';
import { toImageResponse } from '../types/media.types.js';
import type { RegisterImageDto } from '../dto/register-image.dto.js';
import { DriverProfileRepository } from '../../drivers/repositories/driver-profile.repository.js';
import { DriverDocumentRepository } from '../../drivers/repositories/driver-document.repository.js';
import { VehicleRepository } from '../../drivers/repositories/vehicle.repository.js';
import { VehicleDocumentRepository } from '../../drivers/repositories/vehicle-document.repository.js';
import type { image_owner_type } from '@db/queries/media/images.queries.js';

@Injectable()
export class MediaService {
  constructor(
    private readonly imageRepository: ImageRepository,
    private readonly imageKitService: ImageKitService,
    private readonly profileRepository: DriverProfileRepository,
    private readonly documentRepository: DriverDocumentRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly vehicleDocumentRepository: VehicleDocumentRepository,
  ) {}

  getUploadAuth() {
    return this.imageKitService.getUploadAuth();
  }

  async registerImage(userId: string, dto: RegisterImageDto) {
    await this.assertOwnerAccess(userId, dto.owner_type, dto.owner_id);

    const image = await this.imageRepository.create({
      ownerType: dto.owner_type,
      ownerId: dto.owner_id,
      imageType: dto.image_type,
      imagekitFileId: dto.imagekit_file_id,
      url: dto.url,
      fileName: dto.file_name ?? null,
      mimeType: dto.mime_type ?? null,
    });

    return { image: toImageResponse(image) };
  }

  async listImages(userId: string, ownerType: image_owner_type, ownerId: string) {
    await this.assertOwnerAccess(userId, ownerType, ownerId);
    const images = await this.imageRepository.listByOwner(ownerType, ownerId);
    return { images: images.map((row) => toImageResponse(row)) };
  }

  async deleteImage(userId: string, imageId: string) {
    const image = await this.imageRepository.findById(imageId);
    if (!image) {
      throw MediaErrors.imageNotFound();
    }

    await this.assertOwnerAccess(userId, image.owner_type, image.owner_id);

    try {
      await this.imageKitService.deleteFile(image.imagekit_file_id);
    } catch {
      // Metadata cleanup still proceeds if ImageKit delete fails
    }

    await this.imageRepository.deleteById(imageId);
    return { message: 'Image deleted successfully' };
  }

  async listByOwner(ownerType: image_owner_type, ownerId: string) {
    const images = await this.imageRepository.listByOwner(ownerType, ownerId);
    return images.map((row) => toImageResponse(row));
  }

  async hasImageForOwner(ownerType: image_owner_type, ownerId: string) {
    const count = await this.imageRepository.countByOwner(ownerType, ownerId);
    return count > 0;
  }

  private async assertOwnerAccess(
    userId: string,
    ownerType: image_owner_type | RegisterImageDto['owner_type'],
    ownerId: string,
  ) {
    switch (ownerType) {
      case 'USER':
        if (ownerId !== userId) {
          throw MediaErrors.forbidden();
        }
        return;

      case 'DRIVER_DOCUMENT': {
        const document = await this.documentRepository.findById(ownerId);
        if (!document) {
          throw MediaErrors.invalidOwner();
        }
        const profile = await this.profileRepository.findByUserId(userId);
        if (!profile || profile.id !== document.driver_profile_id) {
          throw MediaErrors.forbidden();
        }
        return;
      }

      case 'VEHICLE': {
        const vehicle = await this.vehicleRepository.findById(ownerId);
        if (!vehicle) {
          throw MediaErrors.invalidOwner();
        }
        const profile = await this.profileRepository.findByUserId(userId);
        if (!profile || profile.id !== vehicle.driver_profile_id) {
          throw MediaErrors.forbidden();
        }
        return;
      }

      case 'VEHICLE_DOCUMENT': {
        const vehicleDocument = await this.vehicleDocumentRepository.findById(ownerId);
        if (!vehicleDocument) {
          throw MediaErrors.invalidOwner();
        }
        const vehicle = await this.vehicleRepository.findById(vehicleDocument.vehicle_id);
        if (!vehicle) {
          throw MediaErrors.invalidOwner();
        }
        const profile = await this.profileRepository.findByUserId(userId);
        if (!profile || profile.id !== vehicle.driver_profile_id) {
          throw MediaErrors.forbidden();
        }
        return;
      }

      default:
        throw MediaErrors.invalidOwner();
    }
  }
}
