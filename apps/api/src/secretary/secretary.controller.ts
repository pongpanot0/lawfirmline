import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MatterBriefService } from './matter-brief.service';

@Controller('cases')
@UseGuards(JwtAuthGuard)
export class SecretaryController {
  constructor(private readonly briefs: MatterBriefService) {}

  @Get(':caseId/brief')
  @UseGuards(CaseAccessGuard)
  async caseBrief(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    const brief = await this.briefs.getCaseBrief(u, caseId);
    if (!brief) throw new NotFoundException('Case not found');
    return brief;
  }
}
