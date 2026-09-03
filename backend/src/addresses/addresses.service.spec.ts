import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AddressesService } from './addresses.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AddressesService', () => {
  let service: AddressesService;
  let prisma: any;

  const address = (overrides: Partial<any> = {}) => ({
    street: '123 Main St',
    city: 'Helsinki',
    postalCode: '00100',
    country: 'Finland',
    ...overrides,
  });

  beforeEach(async () => {
    const mockPrisma = {
      address: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AddressesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(AddressesService);
    prisma = module.get(PrismaService);
  });

  it('encrypts address fields at rest and decrypts them back on list', async () => {
    prisma.address.count.mockResolvedValue(0);
    prisma.address.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'a1',
        userId: 'u1',
        label: data.label,
        data: data.data,
        isDefault: data.isDefault,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const created = await service.create('u1', address({ label: 'Home' }));

    // The persisted blob must not contain the plaintext street/city.
    const persistedBlob = prisma.address.create.mock.calls[0][0].data.data;
    expect(persistedBlob).not.toContain('123 Main St');
    expect(persistedBlob).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);

    expect(created.street).toBe('123 Main St');
    expect(created.label).toBe('Home');

    prisma.address.findMany.mockResolvedValue([
      {
        id: 'a1',
        userId: 'u1',
        label: 'Home',
        data: persistedBlob,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const [listed] = await service.list('u1');
    expect(listed.street).toBe('123 Main St');
    expect(listed.postalCode).toBe('00100');
  });

  it('makes the first saved address the default automatically', async () => {
    prisma.address.count.mockResolvedValue(0);
    prisma.address.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'a1', ...data, createdAt: new Date(), updatedAt: new Date() }),
    );

    const created = await service.create('u1', address());
    expect(created.isDefault).toBe(true);
  });

  it('unsets the previous default when a new address is saved as default', async () => {
    prisma.address.count.mockResolvedValue(1);
    prisma.address.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'a2', ...data, createdAt: new Date(), updatedAt: new Date() }),
    );

    await service.create('u1', address({ isDefault: true }));

    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('rejects updating/deleting an address that belongs to another user', async () => {
    prisma.address.findUnique.mockResolvedValue({ id: 'a1', userId: 'someone-else' });

    await expect(service.update('u1', 'a1', address())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('u1', 'a1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException for a nonexistent address', async () => {
    prisma.address.findUnique.mockResolvedValue(null);
    await expect(service.remove('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
