import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CargoClaimsService } from './cargo-claims.service';
import { UpdateCargoRequirementDto, UpsertCargoClaimDto } from './dto/cargo-claim.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CargoClaimsController {
  constructor(private cargoClaims: CargoClaimsService) {}

  @Get('cases/:id/cargo-claim')
  caseCargo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cargoClaims.findForCase(user, id);
  }

  @Post('cases/:id/cargo-claim')
  enableCaseCargo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertCargoClaimDto) {
    return this.cargoClaims.ensureForCase(user, id, dto);
  }

  @Patch('cases/:id/cargo-claim')
  updateCaseCargo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertCargoClaimDto) {
    return this.cargoClaims.updateForCase(user, id, dto);
  }

  @Patch('cases/:id/cargo-claim/requirements/:requirementId')
  updateCaseRequirement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('requirementId') requirementId: string, @Body() dto: UpdateCargoRequirementDto) {
    return this.cargoClaims.updateRequirement(user, { caseId: id }, requirementId, dto);
  }

  @Get('intake/:id/cargo-claim')
  intakeCargo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cargoClaims.findForIntake(user, id);
  }

  @Post('intake/:id/cargo-claim')
  enableIntakeCargo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertCargoClaimDto) {
    return this.cargoClaims.ensureForIntake(user, id, dto);
  }

  @Patch('intake/:id/cargo-claim')
  updateIntakeCargo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertCargoClaimDto) {
    return this.cargoClaims.updateForIntake(user, id, dto);
  }

  @Patch('intake/:id/cargo-claim/requirements/:requirementId')
  updateIntakeRequirement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('requirementId') requirementId: string, @Body() dto: UpdateCargoRequirementDto) {
    return this.cargoClaims.updateRequirement(user, { intakeId: id }, requirementId, dto);
  }
}
