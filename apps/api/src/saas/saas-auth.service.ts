import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  AuthUser,
  FirmRole,
  SubscriptionPlan,
  SubscriptionStatus,
  TRIAL_DAYS,
  PLAN_CONFIG,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from './tenant.service';
import { RegisterDto } from '../auth/dto/register.dto';
import { CaseTypesService } from '../case-types/case-types.service';

@Injectable()
export class SaasAuthService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
    private caseTypes: CaseTypesService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const trialEndAt = this.tenant.trialEndDate();
    const slug = this.tenant.slugify(dto.firmName);

    const user = await this.prisma.$transaction(async (tx) => {
      const firm = await tx.firm.create({
        data: {
          name: dto.firmName,
          slug,
          subscriptionStatus: SubscriptionStatus.TRIAL,
          trialStartAt: new Date(),
          trialEndAt,
          maxUsers: PLAN_CONFIG[SubscriptionPlan.SOLO].maxUsers,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'ADMIN',
        },
      });

      await tx.firmMember.create({
        data: {
          firmId: firm.id,
          userId: createdUser.id,
          role: FirmRole.OWNER,
        },
      });

      await tx.pettyCashFund.create({
        data: { firmId: firm.id },
      });

      await this.caseTypes.provisionDefaults(firm.id, tx);

      await tx.auditLog.create({
        data: {
          firmId: firm.id,
          userId: createdUser.id,
          action: 'FIRM_REGISTERED',
          metadata: { email: dto.email },
        },
      });

      return createdUser;
    });

    const authUser = await this.tenant.buildAuthUser(user.id);
    if (!authUser) throw new BadRequestException('Registration failed');
    return authUser;
  }

  async createPasswordResetToken(email: string): Promise<{ token: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    return { token };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }
}
