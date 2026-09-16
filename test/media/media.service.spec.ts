import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MediaService } from '../../libs/resources/src/media/services/media.service.js';
import { MediaErrors } from '../../libs/resources/src/media/types/media-errors.js';

describe('MediaService', () => {
  const imageRepository = {
    create: vi.fn(),
    listByOwner: vi.fn(),
    findById: vi.fn(),
    deleteById: vi.fn(),
  };
  const imageKitService = {
    getUploadAuth: vi.fn().mockReturnValue({ token: 't', signature: 's', expire: 1 }),
    deleteFile: vi.fn(),
  };
  const profileRepository = { findByUserId: vi.fn() };
  const documentRepository = { findById: vi.fn() };
  const vehicleRepository = { findById: vi.fn() };
  const vehicleDocumentRepository = { findById: vi.fn() };

  let service: MediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MediaService(
      imageRepository as never,
      imageKitService as never,
      profileRepository as never,
      documentRepository as never,
      vehicleRepository as never,
      vehicleDocumentRepository as never,
    );
  });

  it('returns ImageKit upload auth parameters', () => {
    const auth = service.getUploadAuth();
    expect(auth).toEqual({ token: 't', signature: 's', expire: 1 });
  });

  it('registers image metadata for owned driver document', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      driver_profile_id: 'profile-1',
    });
    profileRepository.findByUserId.mockResolvedValue({ id: 'profile-1' });
    imageRepository.create.mockResolvedValue({
      id: 'img-1',
      owner_type: 'DRIVER_DOCUMENT',
      owner_id: 'doc-1',
      image_type: 'DOCUMENT',
      imagekit_file_id: 'file-1',
      url: 'https://ik.imagekit.io/demo/file.jpg',
      file_name: 'file.jpg',
      mime_type: 'image/jpeg',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await service.registerImage('user-1', {
      owner_type: 'DRIVER_DOCUMENT',
      owner_id: 'doc-1',
      image_type: 'DOCUMENT',
      imagekit_file_id: 'file-1',
      url: 'https://ik.imagekit.io/demo/file.jpg',
    });

    expect(result.image.imagekit_file_id).toBe('file-1');
  });

  it('rejects media registration when user does not own the owner record', async () => {
    documentRepository.findById.mockResolvedValue({
      id: 'doc-1',
      driver_profile_id: 'profile-1',
    });
    profileRepository.findByUserId.mockResolvedValue({ id: 'other-profile' });

    await expect(
      service.registerImage('user-1', {
        owner_type: 'DRIVER_DOCUMENT',
        owner_id: 'doc-1',
        image_type: 'DOCUMENT',
        imagekit_file_id: 'file-1',
        url: 'https://ik.imagekit.io/demo/file.jpg',
      }),
    ).rejects.toEqual(MediaErrors.forbidden());
  });
});
