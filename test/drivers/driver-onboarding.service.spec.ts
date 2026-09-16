import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DriverOnboardingService } from '../../libs/resources/src/drivers/services/driver-onboarding.service.js';
import { DriverErrors } from '../../libs/resources/src/drivers/types/driver-errors.js';

describe('DriverOnboardingService', () => {
  const userRepository = { findById: vi.fn() };
  const profileRepository = {
    findByUserId: vi.fn(),
    updateStatus: vi.fn(),
  };
  const documentRepository = { listByProfileId: vi.fn(), create: vi.fn(), deleteRejectedByType: vi.fn() };
  const bankAccountRepository = { findByProfileId: vi.fn() };
  const vehicleRepository = { countActiveByProfileId: vi.fn() };
  const vehicleDocumentRepository = {};
  const verificationRepository = { create: vi.fn() };
  const imageRepository = { countByOwner: vi.fn(), listByOwner: vi.fn().mockResolvedValue([]) };
  const databaseService = {
    withTransaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) =>
      work({}),
    ),
  };
  const config = {
    driver: {
      vehicleRequired: false,
      requiredDocumentTypes: ['AADHAAR', 'DRIVING_LICENCE'],
    },
  };

  let service: DriverOnboardingService;

  const profile = {
    id: 'profile-1',
    user_id: 'user-1',
    status: 'DRAFT' as const,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DriverOnboardingService(
      userRepository as never,
      profileRepository as never,
      documentRepository as never,
      bankAccountRepository as never,
      vehicleRepository as never,
      vehicleDocumentRepository as never,
      verificationRepository as never,
      imageRepository as never,
      databaseService as never,
      config as never,
    );

    userRepository.findById.mockResolvedValue({
      id: 'user-1',
      global_role: 'Driver',
    });
    profileRepository.findByUserId.mockResolvedValue(profile);
  });

  it('submits profile when required documents, bank account, and images exist', async () => {
    documentRepository.listByProfileId.mockResolvedValue([
      { id: 'doc-1', document_type: 'AADHAAR', status: 'PENDING' },
      { id: 'doc-2', document_type: 'DRIVING_LICENCE', status: 'PENDING' },
    ]);
    bankAccountRepository.findByProfileId.mockResolvedValue({ id: 'bank-1' });
    imageRepository.countByOwner.mockResolvedValue(1);
    profileRepository.updateStatus.mockResolvedValue({
      ...profile,
      status: 'PENDING_VERIFICATION',
    });
    verificationRepository.create.mockResolvedValue({
      id: 'verification-1',
      driver_profile_id: profile.id,
      status: 'PENDING',
      submitted_at: new Date(),
    });

    const result = await service.submitForVerification('user-1');

    expect(result.profile.status).toBe('PENDING_VERIFICATION');
    expect(imageRepository.countByOwner).toHaveBeenCalledWith('DRIVER_DOCUMENT', 'doc-1');
  });

  it('requires vehicle when DRIVER_VEHICLE_REQUIRED is enabled', async () => {
    config.driver.vehicleRequired = true;
    documentRepository.listByProfileId.mockResolvedValue([
      { id: 'doc-1', document_type: 'AADHAAR', status: 'PENDING' },
      { id: 'doc-2', document_type: 'DRIVING_LICENCE', status: 'PENDING' },
    ]);
    bankAccountRepository.findByProfileId.mockResolvedValue({ id: 'bank-1' });
    imageRepository.countByOwner.mockResolvedValue(1);
    vehicleRepository.countActiveByProfileId.mockResolvedValue(0);

    await expect(service.submitForVerification('user-1')).rejects.toEqual(
      DriverErrors.vehicleRequired(),
    );

    config.driver.vehicleRequired = false;
  });

  it('blocks edits when profile is pending verification', async () => {
    profileRepository.findByUserId.mockResolvedValue({
      ...profile,
      status: 'PENDING_VERIFICATION',
    });

    await expect(
      service.addDocument('user-1', {
        document_type: 'AADHAAR',
      }),
    ).rejects.toEqual(DriverErrors.profileNotEditable());
  });
});
