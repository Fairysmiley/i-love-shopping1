import { Injectable, NotFoundException } from '@nestjs/common';
import { OAuthProvider, Prisma, User, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt, hashForLookup } from '../common/utils/encryption.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const emailHash = hashForLookup(email.toLowerCase());
    const user = await this.prisma.user.findUnique({ where: { emailHash } });
    return this.decryptUser(user);
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return this.decryptUser(user);
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: Omit<Prisma.UserCreateInput, 'emailHash'>): Promise<User> {
    const normalizedEmail = data.email.toLowerCase();
    const encryptedData: Prisma.UserCreateInput = {
      ...data,
      email: encrypt(normalizedEmail),
      emailHash: hashForLookup(normalizedEmail),
    };
    if (encryptedData.firstName) encryptedData.firstName = encrypt(encryptedData.firstName);
    if (encryptedData.lastName) encryptedData.lastName = encrypt(encryptedData.lastName);
    const user = await this.prisma.user.create({ data: encryptedData });
    return this.decryptUser(user) as User;
  }

  async findAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.decryptUser(u) as User);
  }

  async updateRole(id: string, role: Role): Promise<User> {
    await this.getByIdOrThrow(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { role },
    });
    return this.decryptUser(user) as User;
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    const updateData: Prisma.UserUpdateInput = { ...data };
    if (typeof updateData.email === 'string') {
      const normalizedEmail = updateData.email.toLowerCase();
      updateData.email = encrypt(normalizedEmail);
      updateData.emailHash = hashForLookup(normalizedEmail);
    }
    if (typeof updateData.firstName === 'string')
      updateData.firstName = encrypt(updateData.firstName);
    if (typeof updateData.lastName === 'string') updateData.lastName = encrypt(updateData.lastName);
    const user = await this.prisma.user.update({ where: { id }, data: updateData });
    return this.decryptUser(user) as User;
  }

  /**
   * Finds an existing user linked to an OAuth identity, or provisions one.
   * Links the OAuth account to a pre-existing email-based account when emails
   * match, so a user can sign in with either method.
   */
  async findOrCreateFromOAuth(params: {
    provider: OAuthProvider;
    providerAccountId: string;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: params.provider,
          providerAccountId: params.providerAccountId,
        },
      },
      include: { user: true },
    });
    if (existingLink) return this.decryptUser(existingLink.user) as User;

    const email = params.email.toLowerCase();
    const emailHash = hashForLookup(email);
    const userResult = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { emailHash } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email: encrypt(email),
            emailHash,
            firstName: encrypt(params.firstName),
            lastName: encrypt(params.lastName),
            isEmailVerified: true,
          },
        });
      }
      await tx.oAuthAccount.create({
        data: {
          provider: params.provider,
          providerAccountId: params.providerAccountId,
          userId: user.id,
        },
      });
      return user;
    });
    return this.decryptUser(userResult) as User;
  }

  toPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }

  private decryptUser(user: User | null): User | null {
    if (!user) return null;
    return {
      ...user,
      email: decrypt(user.email),
      firstName: decrypt(user.firstName),
      lastName: decrypt(user.lastName),
    };
  }
}
