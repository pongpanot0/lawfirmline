import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuthUser, CustomFieldDefinitionDto, CustomFieldEntity, CustomFieldOption, CustomFieldType,
  CustomFieldVisibility, hasFirmCapability, PLAN_LIMIT_CUSTOM_FIELDS, SubscriptionPlan,
} from '@lawfirm/shared';
import { CustomFieldDefinition, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { canSee, generateFieldKey } from './custom-field-rules';
import { CreateCustomFieldDto, UpdateCustomFieldDto, UpdateCustomFieldOptionDto } from './dto/custom-field.dto';

@Injectable()
export class CustomFieldsService {
  constructor(private prisma: PrismaService) {}

  async listVisible(user: AuthUser, entityKind: CustomFieldEntity, opts: { includeArchived?: boolean } = {}): Promise<CustomFieldDefinitionDto[]> {
    const defs = await this.prisma.customFieldDefinition.findMany({
      where: {
        firmId: user.firmId, entityKind,
        OR: [{ visibility: 'FIRM' }, { visibility: 'PERSONAL', ownerUserId: user.id }],
        ...(opts.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return defs.map((def) => this.toDto(def));
  }

  async create(user: AuthUser, dto: CreateCustomFieldDto): Promise<CustomFieldDefinitionDto> {
    this.assertCapability(user, dto.visibility);
    return this.write(user, async (db) => {
      await this.validateScope(db, user, dto.entityKind, dto.visibility, dto.required ?? false, dto.caseTypeIds ?? []);
      await this.assertQuota(db, user, dto.entityKind, dto.visibility);
      const options = this.options(dto.type, dto.options);
      // Check under the firm lock so generated keys cannot collide with another writer here.
      let key = generateFieldKey();
      while (await db.customFieldDefinition.findFirst({ where: { firmId: user.firmId, key } })) key = generateFieldKey();
      const saved = await db.customFieldDefinition.create({
        data: {
          firmId: user.firmId, createdById: user.id,
          entityKind: dto.entityKind, visibility: dto.visibility,
          ownerUserId: dto.visibility === 'PERSONAL' ? user.id : null,
          key, label: dto.label, type: dto.type,
          ...(dto.type === 'SELECT' ? { options: options.map((opt) => ({ ...opt })) } : {}),
          required: dto.required ?? false, caseTypeIds: dto.caseTypeIds ?? [],
          section: dto.section, helpText: dto.helpText, isSensitive: dto.isSensitive ?? false,
        },
      });
      return this.toDto(saved);
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomFieldDto): Promise<CustomFieldDefinitionDto> {
    return this.write(user, async (db) => {
      const def = await this.findWritable(db, user, id);
      if (dto.isSensitive !== undefined && dto.isSensitive !== def.isSensitive && def.createdById !== user.id) {
        throw new ForbiddenException('Only the creator can change field sensitivity');
      }
      await this.validateScope(db, user, def.entityKind, def.visibility, dto.required ?? def.required, dto.caseTypeIds ?? def.caseTypeIds);
      const options = dto.options === undefined ? undefined : this.options(def.type, dto.options, this.toDto(def).options);
      return this.toDto(await db.customFieldDefinition.update({
        where: { id, firmId: user.firmId },
        data: {
          label: dto.label, required: dto.required, caseTypeIds: dto.caseTypeIds,
          section: dto.section, helpText: dto.helpText, isSensitive: dto.isSensitive,
          ...(options === undefined ? {} : { options: options.map((opt) => ({ ...opt })) }),
        },
      }));
    });
  }

  async archive(user: AuthUser, id: string): Promise<CustomFieldDefinitionDto> {
    return this.write(user, async (db) => {
      const def = await this.findWritable(db, user, id);
      if (def.archivedAt) return this.toDto(def);
      return this.toDto(await db.customFieldDefinition.update({ where: { id, firmId: user.firmId }, data: { archivedAt: new Date() } }));
    });
  }

  async restore(user: AuthUser, id: string): Promise<CustomFieldDefinitionDto> {
    return this.write(user, async (db) => {
      const def = await this.findWritable(db, user, id);
      if (!def.archivedAt) return this.toDto(def);
      await this.assertQuota(db, user, def.entityKind, def.visibility);
      return this.toDto(await db.customFieldDefinition.update({ where: { id, firmId: user.firmId }, data: { archivedAt: null } }));
    });
  }

  async order(user: AuthUser, ids: string[]): Promise<{ ordered: true }> {
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate field ids');
    return this.write(user, async (db) => {
      for (const id of ids) {
        const def = await this.findWritable(db, user, id);
        if (def.archivedAt) throw new NotFoundException('Custom field not found');
      }
      for (const [sortOrder, id] of ids.entries()) {
        await db.customFieldDefinition.update({ where: { id, firmId: user.firmId }, data: { sortOrder } });
      }
      return { ordered: true };
    });
  }

  private assertCapability(user: AuthUser, visibility: CustomFieldVisibility): void {
    if (visibility === 'FIRM' && !hasFirmCapability(user.firmRole, 'manageFirmContent')) {
      throw new ForbiddenException('Cannot manage firm custom fields');
    }
  }

  private async findWritable(db: Prisma.TransactionClient, user: AuthUser, id: string): Promise<CustomFieldDefinition> {
    const def = await db.customFieldDefinition.findFirst({ where: { id, firmId: user.firmId } });
    if (!def || !canSee(def, user.id)) throw new NotFoundException('Custom field not found');
    this.assertCapability(user, def.visibility);
    return def;
  }

  private async validateScope(db: Prisma.TransactionClient, user: AuthUser, entity: CustomFieldEntity, visibility: CustomFieldVisibility, required: boolean, caseTypeIds: string[]): Promise<void> {
    if (required && (visibility !== 'FIRM' || entity !== 'CASE')) throw new BadRequestException('Only firm case fields can be required');
    if (caseTypeIds.length && entity !== 'CASE') throw new BadRequestException('Only case fields can specify case types');
    if (caseTypeIds.length) {
      const count = await db.caseType.count({ where: { firmId: user.firmId, id: { in: caseTypeIds } } });
      if (count !== new Set(caseTypeIds).size) throw new BadRequestException('Invalid caseTypeIds for this firm');
    }
  }

  private async assertQuota(db: Prisma.TransactionClient, user: AuthUser, entityKind: CustomFieldEntity, visibility: CustomFieldVisibility): Promise<void> {
    if (user.subscriptionPlan === SubscriptionPlan.FREE && !user.planGrandfathered) {
      const count = await db.customFieldDefinition.count({ where: { firmId: user.firmId, archivedAt: null } });
      if (count >= 5) throw new ForbiddenException({
        code: PLAN_LIMIT_CUSTOM_FIELDS,
        message: 'สำนักงานใช้ช่องข้อมูลเพิ่มเติมครบ 5 ช่องแล้ว เก็บถาวรช่องที่ไม่ใช้ หรือติดต่อเจ้าของสำนักงาน',
      });
    }
    const count = await db.customFieldDefinition.count({
      where: { firmId: user.firmId, entityKind, visibility, archivedAt: null, ...(visibility === 'PERSONAL' ? { ownerUserId: user.id } : {}) },
    });
    const limit = visibility === 'PERSONAL' ? 30 : 100;
    if (count >= limit) throw new BadRequestException(`Custom field limit (${limit}) reached`);
  }

  private options(type: CustomFieldType, incoming?: UpdateCustomFieldOptionDto[], existing: CustomFieldOption[] = []): CustomFieldOption[] {
    if (type !== 'SELECT') {
      if (incoming !== undefined) throw new BadRequestException('Only SELECT fields can have options');
      return [];
    }
    if (!incoming?.length || incoming.length > 50) throw new BadRequestException('SELECT needs 1–50 options');
    const byId = new Map(existing.map((opt) => [opt.id, opt]));
    const seen = new Set<string>();
    const options = incoming.map((opt) => {
      if (opt.id && (!byId.has(opt.id) || seen.has(opt.id))) throw new BadRequestException('Unknown or duplicate option id');
      if (opt.id) seen.add(opt.id);
      return { ...(opt.id ? byId.get(opt.id)! : { id: randomUUID() }), label: opt.label };
    });
    const retained = existing.filter((opt) => !seen.has(opt.id)).map((opt) => ({ ...opt, archived: true }));
    if (options.length + retained.length > 50) throw new BadRequestException('SELECT allows at most 50 option ids, including archived options');
    return [...options, ...retained];
  }

  private toDto(def: CustomFieldDefinition): CustomFieldDefinitionDto {
    const { firmId, createdById, createdAt, updatedAt, ...dto } = def;
    return { ...dto, options: (def.options ?? []) as unknown as CustomFieldOption[], archivedAt: def.archivedAt?.toISOString() ?? null };
  }

  private write<T>(user: AuthUser, fn: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (db) => {
      // Serialize quota checks and definition edits across this firm's requests.
      await db.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      return fn(db);
    });
  }
}
