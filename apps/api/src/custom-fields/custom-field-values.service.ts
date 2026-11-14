import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, CustomFieldEntity } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CustomFieldsService } from './custom-fields.service';
import { mergeCustomFieldPatch, redactCustomFields } from './custom-field-rules';

@Injectable()
export class CustomFieldValuesService {
  constructor(
    private prisma: PrismaService,
    private definitions: CustomFieldsService,
    private caseAccess: CaseAccessService,
  ) {}

  async setValues(
    user: AuthUser,
    entity: CustomFieldEntity,
    recordId: string,
    values: Record<string, unknown>,
    via: { source: 'WEB' | 'MCP' | 'AI'; auditMetadata?: Record<string, unknown> } = { source: 'WEB' },
    // Overview saves join their existing transaction; REST/MCP/AI use the five-argument API.
    transaction?: Prisma.TransactionClient,
  ): Promise<{ customFields: Record<string, unknown> }> {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new BadRequestException('values must be an object');
    if (entity !== 'CASE' && entity !== 'CLIENT') throw new BadRequestException('Invalid custom field entity');
    if (entity === 'CASE' && !await this.caseAccess.canAccessCase(user, recordId)) throw new NotFoundException('Case not found');

    const write = async (db: Prisma.TransactionClient) => {
      // Definition edits take the same firm lock; record locks prevent concurrent JSON patches losing keys.
      await db.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      if (entity === 'CASE') await db.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${recordId} AND "firmId" = ${user.firmId} FOR UPDATE`;
      else await db.$queryRaw`SELECT "id" FROM "Client" WHERE "id" = ${recordId} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const record = entity === 'CASE'
        ? await db.case.findFirst({ where: { id: recordId, firmId: user.firmId, deletedAt: null }, select: { customFields: true } })
        : await db.client.findFirst({ where: { AND: [{ id: recordId, firmId: user.firmId }, this.caseAccess.getClientFilterForUser(user)] }, select: { customFields: true } });
      if (!record) throw new NotFoundException('Record not found');
      const defs = await this.definitions.listAllForFirm(user.firmId, entity);
      const merged = mergeCustomFieldPatch(record.customFields, values, defs, user.id);
      const data = { customFields: merged.values as Prisma.InputJsonObject };
      if (entity === 'CASE') await db.case.update({ where: { id: recordId, firmId: user.firmId }, data });
      else await db.client.update({ where: { id: recordId, firmId: user.firmId }, data });
      for (const change of merged.changes) {
        const def = defs.find(d => d.key === change.key)!;
        await db.auditLog.create({ data: {
          firmId: user.firmId, userId: user.id, action: 'CUSTOM_FIELD_VALUE_CHANGED',
          metadata: {
            ...via.auditMetadata as Prisma.InputJsonObject, source: via.source,
            entity, recordId, key: change.key, label: def.label,
            from: def.isSensitive ? '[hidden]' : change.from ?? null,
            to: def.isSensitive ? '[hidden]' : change.to,
          } as Prisma.InputJsonObject,
        } });
      }
      return { customFields: redactCustomFields(merged.values, defs, user.id, via.source === 'WEB' ? 'app' : via.source === 'MCP' ? 'mcp' : 'ai') };
    };
    return transaction ? write(transaction) : this.prisma.$transaction(write);
  }
}
