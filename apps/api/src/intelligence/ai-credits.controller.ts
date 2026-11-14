import { Body, Controller, ForbiddenException, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { AiCreditsEstimate, AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { PlanQuotaService } from '../common/services/plan-quota.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { CreditsEstimateDto } from './dto/credits-estimate.dto';

@Controller('ai/credits')
@UseGuards(JwtAuthGuard)
export class AiCreditsController {
  constructor(
    private prisma: PrismaService,
    private documents: DocumentsService,
    private caseAccess: CaseAccessService,
    private storage: FileStorageService,
    private intelligence: DocumentIntelligenceService,
    private quota: PlanQuotaService,
  ) {}

  @Post('estimate')
  async estimate(@CurrentUser() user: AuthUser, @Body() dto: CreditsEstimateDto): Promise<AiCreditsEstimate> {
    const documents = await this.prisma.document.findMany({
      where: { id: { in: dto.documentIds }, OR: [{ case: { firmId: user.firmId } }, { intake: { firmId: user.firmId } }] },
      select: { id: true, caseId: true, intakeId: true },
    });
    if (documents.length !== dto.documentIds.length) throw new NotFoundException('Document not found');
    // Resolve all access checks before reading any of the selected content.
    const paths = [];
    for (const id of dto.documentIds) {
      const document = documents.find((item) => item.id === id)!;
      if (document.caseId) {
        if (!await this.caseAccess.canAccessCase(user, document.caseId)) throw new ForbiddenException('You do not have access to this case');
        paths.push(await this.documents.getFilePath(user, document.caseId, id));
      } else if (document.intakeId) {
        paths.push(await this.documents.getFilePathForIntake(user, document.intakeId, id));
      } else {
        throw new NotFoundException('Document not found');
      }
    }
    const items = [];
    for (const [index, file] of paths.entries()) {
      const buffer = await this.storage.getBuffer(file.path);
      items.push({ documentId: dto.documentIds[index], ...await this.intelligence.estimateFileCredits(buffer, file.mimeType) });
    }
    return { items, total: items.reduce((sum, item) => sum + item.credits, 0), balance: await this.quota.aiBalance(user) };
  }
}
