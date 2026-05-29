import { Injectable, NotFoundException } from '@nestjs/common';
import { OAuthProvider, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data: { ...data, email: data.email.toLowerCase() } });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
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
    if (existingLink) return existingLink.user;

    const email = params.email.toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            firstName: params.firstName,
            lastName: params.lastName,
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
}
