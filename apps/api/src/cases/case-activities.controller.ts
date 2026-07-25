import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CaseActivitiesService } from './case-activities.service';
import { CreateActivityDto } from './dto/activity.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

@Controller('cases/:caseId/activities')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseActivitiesController {
  constructor(
    private activitiesService: CaseActivitiesService,
    private prisma: PrismaService,
  ) {}

  @Get()
  findByCase(@Param('caseId') caseId: string) {
    return this.activitiesService.findByCase(caseId);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateActivityDto,
  ) {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { courtName: true },
    });
    return this.activitiesService.create(user, caseId, dto, legalCase?.courtName ?? undefined);
  }
}
