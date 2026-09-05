import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InsuranceClaimsService } from './insurance-claims.service';
import { CreateInsuranceClaimDto, UpdateInsuranceClaimDto, AdvanceStageDto } from './dto/insurance-claim.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

@Controller('cases/:caseId/insurance-claim')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class InsuranceClaimsController {
  constructor(private insuranceClaimsService: InsuranceClaimsService) {}

  @Get()
  findByCase(@Param('caseId') caseId: string) {
    return this.insuranceClaimsService.findByCase(caseId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateInsuranceClaimDto,
  ) {
    return this.insuranceClaimsService.create(user, caseId, dto);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateInsuranceClaimDto,
  ) {
    return this.insuranceClaimsService.update(user, caseId, dto);
  }

  @Post('advance-stage')
  advanceStage(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: AdvanceStageDto,
  ) {
    return this.insuranceClaimsService.advanceStage(user, caseId, dto);
  }
}
